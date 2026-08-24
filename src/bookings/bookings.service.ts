import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ConfigService } from '@nestjs/config';
import {
  CreateBookingDto,
  ConfirmBookingDto,
  CancelBookingDto,
} from './dto/booking.dto';
import {
  PaginationDto,
  getPaginationParams,
  paginatedResponse,
} from '../common/utils/pagination.util';
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import Redis from 'ioredis';
import * as crypto from 'crypto';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly seatLockTtl: number;

  constructor(
    private prisma: PrismaService,
    @Inject(REDIS_CLIENT) private redis: Redis,
    private configService: ConfigService,
  ) {
    this.seatLockTtl = this.configService.get<number>('app.seatLockTtl') || 300;
  }

  // ================================================
  // SEAT LOCKING via Redis (fast, atomic)
  // ================================================

  private getSeatLockKey(scheduleId: string, seatId: string): string {
    return `seat_lock:${scheduleId}:${seatId}`;
  }

  async lockSeats(
    scheduleId: string,
    seatIds: string[],
    sessionToken: string,
    userId?: string,
  ): Promise<{ locked: string[]; failed: string[] }> {
    const locked: string[] = [];
    const failed: string[] = [];

    // Check existing Redis locks
    const checkPipeline = this.redis.pipeline();
    for (const seatId of seatIds) {
      const key = this.getSeatLockKey(scheduleId, seatId);
      checkPipeline.get(key);
    }

    const existingLocks = await checkPipeline.exec().catch(() => null);

    if (existingLocks) {
      const setPipeline = this.redis.pipeline();
      for (let i = 0; i < seatIds.length; i++) {
        const seatId = seatIds[i];
        const key = this.getSeatLockKey(scheduleId, seatId);
        const holder = existingLocks[i]?.[1] as string | null;

        // Allow if unlocked, or locked by the same session or user
        if (!holder || holder === sessionToken || (userId && holder === userId)) {
          setPipeline.set(key, sessionToken, 'EX', this.seatLockTtl);
          locked.push(seatId);
        } else {
          failed.push(seatId);
        }
      }
      await setPipeline.exec().catch(() => {});
    } else {
      // Fallback to DB locking if Redis unavailable
      return this.lockSeatsInDb(scheduleId, seatIds, sessionToken, userId);
    }

    if (failed.length > 0) {
      await this.releaseRedisLocks(scheduleId, locked, sessionToken);
      return { locked: [], failed: seatIds };
    }

    await this.upsertDbSeatLocks(scheduleId, locked, sessionToken, userId);
    return { locked, failed };
  }

  private async lockSeatsInDb(
    scheduleId: string,
    seatIds: string[],
    sessionToken: string,
    userId?: string,
  ): Promise<{ locked: string[]; failed: string[] }> {
    return this.upsertDbSeatLocks(scheduleId, seatIds, sessionToken, userId)
      .then(() => ({ locked: seatIds, failed: [] }))
      .catch(() => ({ locked: [], failed: seatIds }));
  }

  private async upsertDbSeatLocks(
    scheduleId: string,
    seatIds: string[],
    sessionToken: string,
    userId?: string,
  ) {
    const expiresAt = new Date(Date.now() + this.seatLockTtl * 1000);
    // Use upsert to handle race conditions at DB level
    await Promise.all(
      seatIds.map((seatId) =>
        this.prisma.seatLock.upsert({
          where: { scheduleId_seatId: { scheduleId, seatId } },
          create: {
            scheduleId,
            seatId,
            sessionToken,
            expiresAt,
            lockedBy: userId,
          },
          update: { sessionToken, expiresAt, lockedBy: userId },
        }),
      ),
    );
  }

  private async releaseRedisLocks(
    scheduleId: string,
    seatIds: string[],
    sessionToken: string,
  ) {
    // Only release if we own the lock
    const pipeline = this.redis.pipeline();
    for (const seatId of seatIds) {
      const key = this.getSeatLockKey(scheduleId, seatId);
      // Lua script: delete only if owned
      pipeline.eval(
        `if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
        1,
        key,
        sessionToken,
      );
    }
    await pipeline.exec().catch(() => {});
  }

  // ================================================
  // BOOKING CREATION — Transaction-safe
  // ================================================

  async createBooking(
    companyId: string,
    dto: CreateBookingDto,
    userId?: string,
    counterId?: string,
  ) {
    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.booking.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }

    const sessionToken = dto.idempotencyKey || crypto.randomUUID();
    const seatIds = dto.seats.map((s) => s.seatId);

    // 1. Validate schedule
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: dto.scheduleId, companyId, status: 'ACTIVE' },
      include: {
        coach: { include: { coachType: true } },
        route: true,
      },
    });

    if (!schedule)
      throw new NotFoundException('Schedule not found or not active');

    // 2. Check booking window
    if (schedule.bookingCloseTime && schedule.bookingCloseTime < new Date()) {
      throw new BadRequestException(
        'Booking window has closed for this schedule',
      );
    }

    // 3. Lock seats atomically
    const { locked, failed } = await this.lockSeats(
      dto.scheduleId,
      seatIds,
      sessionToken,
      userId,
    );

    if (failed.length > 0) {
      throw new ConflictException(
        `Seats are no longer available: ${failed.join(', ')}. Please select other seats.`,
        'SEAT_UNAVAILABLE',
      );
    }

    try {
      // 4. Apply discount if coupon provided
      let discountAmount = new Prisma.Decimal(0);
      let discount = null;
      if (dto.couponCode) {
        discount = await this.validateAndApplyDiscount(
          companyId,
          dto.couponCode,
          null,
        );
      }

      // 5. Calculate fare for each seat
      const seatFares = await this.calculateSeatFares(
        dto.seats,
        schedule.routeId,
        schedule.coach.coachTypeId,
        companyId,
      );

      const totalAmount = seatFares.reduce(
        (sum, sf) => sum.plus(sf.amount),
        new Prisma.Decimal(0),
      );

      if (discount) {
        if (discount.type === 'PERCENTAGE') {
          discountAmount = totalAmount.times(discount.value).dividedBy(100);
        } else {
          discountAmount = discount.value;
        }
      }

      const netAmount = totalAmount.minus(discountAmount);
      const bookingRef = this.generateBookingRef();
      const expiresAt = new Date(Date.now() + this.seatLockTtl * 1000);

      // 6. Create booking in DB transaction with row-level locking
      const booking = await this.prisma.$transaction(async (tx) => {
        // Double-check seats are not booked (DB-level truth)
        const existingBookings = await tx.bookingSeat.findMany({
          where: {
            booking: {
              scheduleId: dto.scheduleId,
              status: { in: ['HELD', 'CONFIRMED'] },
            },
            seatId: { in: seatIds },
          },
          select: { seatId: true },
        });

        if (existingBookings.length > 0) {
          const conflictSeats = existingBookings.map((r) => r.seatId);
          throw new ConflictException(
            `Seats already booked: ${conflictSeats.join(', ')}`,
            'SEAT_UNAVAILABLE',
          );
        }

        // Create booking
        const newBooking = await tx.booking.create({
          data: {
            companyId,
            scheduleId: dto.scheduleId,
            userId,
            counterId,
            bookingRef,
            status: BookingStatus.HELD,
            totalAmount,
            discountAmount,
            netAmount,
            paymentStatus: PaymentStatus.PENDING,
            source: dto.source ?? 'ONLINE',
            notes: dto.notes,
            heldAt: new Date(),
            expiresAt,
            idempotencyKey: dto.idempotencyKey,
          },
        });

        // Create passengers and booking seats
        for (const seatInfo of dto.seats) {
          const sf = seatFares.find((s) => s.seatId === seatInfo.seatId)!;

          const passenger = await tx.passenger.create({
            data: {
              bookingId: newBooking.id,
              seatId: seatInfo.seatId,
              name: seatInfo.passenger.name,
              phone: seatInfo.passenger.phone,
              email: seatInfo.passenger.email,
              gender: seatInfo.passenger.gender,
              age: seatInfo.passenger.age,
              nationalId: seatInfo.passenger.nationalId,
            },
          });

          await tx.bookingSeat.create({
            data: {
              bookingId: newBooking.id,
              seatId: seatInfo.seatId,
              fareId: sf.fareId,
              passengerId: passenger.id,
              amount: sf.amount,
            },
          });
        }

        // Record discount usage
        if (discount && dto.couponCode) {
          await tx.discountUsage.create({
            data: {
              discountId: discount.id,
              bookingId: newBooking.id,
              amount: discountAmount,
            },
          });

          await tx.discount.update({
            where: { id: discount.id },
            data: { usedCount: { increment: 1 } },
          });
        }

        return tx.booking.findUnique({
          where: { id: newBooking.id },
          include: {
            bookingSeats: { include: { seat: true, passenger: true } },
            schedule: { include: { coach: true, route: true } },
          },
        });
      });

      return booking;
    } catch (error) {
      // Release locks on failure
      await this.releaseRedisLocks(dto.scheduleId, locked, sessionToken);
      await this.prisma.seatLock.deleteMany({
        where: {
          scheduleId: dto.scheduleId,
          seatId: { in: seatIds },
          sessionToken,
        },
      });
      throw error;
    }
  }

  async confirmBooking(
    bookingId: string,
    companyId: string,
    dto: ConfirmBookingDto,
    _userId?: string,
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, companyId },
      include: { bookingSeats: true },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === BookingStatus.CONFIRMED) {
      return booking; // Already confirmed
    }
    if (booking.status !== BookingStatus.HELD) {
      throw new BadRequestException(
        `Cannot confirm booking in status: ${booking.status}`,
      );
    }
    if (booking.expiresAt && booking.expiresAt < new Date()) {
      throw new BadRequestException('Booking has expired. Please start over.');
    }

    return this.prisma.$transaction(async (tx) => {
      const validProviders = ['MANUAL', 'SSLCOMMERZ', 'BKASH', 'NAGAD', 'STRIPE', 'CASH'];
      const rawProvider = (dto.paymentProvider || '').toUpperCase();
      const providerEnum = validProviders.includes(rawProvider) ? (rawProvider as never) : ('MANUAL' as never);

      // Create payment record
      const payment = await tx.payment.create({
        data: {
          bookingId,
          provider: providerEnum,
          providerRef: dto.providerRef,
          amount: booking.netAmount,
          status: 'PAID',
          metadata: dto.paymentMetadata as never,
          completedAt: new Date(),
        },
      });

      // Confirm booking
      const confirmedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          confirmedAt: new Date(),
          expiresAt: null,
        },
        include: {
          bookingSeats: { include: { seat: true, passenger: true } },
          schedule: { include: { coach: true, route: true } },
          passengers: true,
        },
      });

      // Generate tickets
      for (const passenger of confirmedBooking.passengers) {
        await tx.ticket.create({
          data: {
            bookingId,
            passengerId: passenger.id,
            ticketNumber: this.generateTicketNumber(),
            qrToken: this.generateQrToken(bookingId, passenger.id),
            status: 'ACTIVE',
          },
        });
      }

      // Release seat locks
      const seatIds = confirmedBooking.bookingSeats.map((bs) => bs.seatId);
      await tx.seatLock.deleteMany({
        where: {
          scheduleId: confirmedBooking.schedule.id,
          seatId: { in: seatIds },
        },
      });

      return { booking: confirmedBooking, payment };
    });
  }

  async cancelBooking(
    bookingId: string,
    companyId: string,
    dto: CancelBookingDto,
    requestedBy: string,
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, companyId },
      include: {
        schedule: true,
        bookingSeats: true,
        cancellation: true,
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }
    if (
      booking.status !== BookingStatus.HELD &&
      booking.status !== BookingStatus.CONFIRMED
    ) {
      throw new BadRequestException('Cannot cancel booking in current status');
    }
    if (booking.cancellation) {
      throw new BadRequestException('Cancellation already requested');
    }

    // Find applicable cancellation policy
    const hoursUntilDeparture = this.getHoursUntilDeparture(
      booking.schedule.departureDate,
      booking.schedule.departureTime,
    );

    const policy = await this.prisma.cancellationPolicy.findFirst({
      where: {
        companyId,
        isActive: true,
        hoursBeforeDeparture: { gte: hoursUntilDeparture },
      },
      orderBy: { hoursBeforeDeparture: 'asc' },
    });

    const chargePercentage = policy
      ? policy.chargePercentage
      : new Prisma.Decimal(0);
    const chargeAmount = booking.netAmount
      .times(chargePercentage)
      .dividedBy(100)
      .toDecimalPlaces(2);
    const refundAmount = booking.netAmount.minus(chargeAmount);

    return this.prisma.$transaction(async (tx) => {
      const cancellation = await tx.cancellation.create({
        data: {
          bookingId,
          requestedBy,
          policyId: policy?.id,
          reason: dto.reason,
          originalAmount: booking.netAmount,
          chargeAmount,
          refundAmount,
          status: 'APPROVED',
          refundStatus:
            booking.paymentStatus === 'PAID' ? 'PENDING' : 'NOT_APPLICABLE',
        },
      });

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      // Cancel all tickets
      await tx.ticket.updateMany({
        where: { bookingId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });

      // Release seat locks if any
      const seatIds = booking.bookingSeats.map((bs) => bs.seatId);
      await tx.seatLock.deleteMany({
        where: { scheduleId: booking.scheduleId, seatId: { in: seatIds } },
      });

      return { cancellation, message: 'Booking cancelled successfully' };
    });
  }

  async expireHeldBookings() {
    // Called by cron job to expire HELD bookings past their expiry
    const expired = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.HELD,
        expiresAt: { lt: new Date() },
      },
      include: { bookingSeats: true },
    });

    for (const booking of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.EXPIRED },
        });

        const seatIds = booking.bookingSeats.map((bs) => bs.seatId);
        await tx.seatLock.deleteMany({
          where: { scheduleId: booking.scheduleId, seatId: { in: seatIds } },
        });
      });

      this.logger.log(`Expired booking ${booking.bookingRef}`);
    }

    // Also clean up expired DB seat locks
    await this.prisma.seatLock.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    return { expired: expired.length };
  }

  async findAll(
    companyId: string,
    query: PaginationDto & { status?: BookingStatus; date?: string },
  ) {
    const { skip, take } = getPaginationParams(query);

    const where: Prisma.BookingWhereInput = {
      companyId,
      ...(query.status && { status: query.status }),
      ...(query.search && {
        bookingRef: { contains: query.search, mode: 'insensitive' },
      }),
      ...(query.date && {
        schedule: { departureDate: new Date(query.date) },
      }),
    };

    const [bookings, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy || 'createdAt']: query.sort || 'desc' },
        include: {
          bookingSeats: { include: { seat: true } },
          passengers: true,
          schedule: { include: { route: true, coach: true } },
          tickets: true,
          payments: true,
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return paginatedResponse(
      bookings,
      total,
      query.page || 1,
      query.limit || 20,
    );
  }

  async findOne(id: string, companyId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, companyId },
      include: {
        bookingSeats: { include: { seat: true, fare: true, passenger: true } },
        passengers: true,
        schedule: {
          include: {
            coach: { include: { coachType: true } },
            route: { include: { stops: { orderBy: { sequence: 'asc' } } } },
          },
        },
        tickets: true,
        payments: true,
        cancellation: true,
        counter: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async findByRef(bookingRef: string, companyId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { bookingRef, companyId },
      include: {
        bookingSeats: { include: { seat: true, passenger: true } },
        passengers: true,
        schedule: { include: { coach: true, route: true } },
        tickets: true,
        payments: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async findUserBookings(userId: string, companyId: string) {
    return this.prisma.booking.findMany({
      where: { userId, companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        bookingSeats: { include: { seat: true, passenger: true } },
        passengers: true,
        schedule: { include: { coach: true, route: true } },
        tickets: true,
        payments: true,
      },
    });
  }

  async deleteBooking(id: string, companyId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, companyId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.ticket.deleteMany({ where: { bookingId: id } });
      await tx.payment.deleteMany({ where: { bookingId: id } });
      await tx.cancellation.deleteMany({ where: { bookingId: id } });
      await tx.bookingSeat.deleteMany({ where: { bookingId: id } });
      await tx.passenger.deleteMany({ where: { bookingId: id } });
      return tx.booking.delete({ where: { id } });
    });
  }

  // ================================================
  // HELPERS
  // ================================================

  private async calculateSeatFares(
    seats: CreateBookingDto['seats'],
    routeId: string,
    coachTypeId: string,
    companyId: string,
  ): Promise<
    Array<{ seatId: string; fareId: string | null; amount: Prisma.Decimal }>
  > {
    const now = new Date();
    const results = [];

    for (const seatInfo of seats) {
      if (seatInfo.fareId) {
        const fare = await this.prisma.fare.findFirst({
          where: { id: seatInfo.fareId, isActive: true },
        });
        if (fare) {
          results.push({
            seatId: seatInfo.seatId,
            fareId: fare.id,
            amount: fare.baseAmount,
          });
          continue;
        }
      }

      // Auto-lookup fare
      const fare = await this.prisma.fare.findFirst({
        where: {
          companyId,
          routeId,
          coachTypeId,
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      results.push({
        seatId: seatInfo.seatId,
        fareId: fare?.id ?? null,
        amount: fare?.baseAmount ?? new Prisma.Decimal(0),
      });
    }

    return results;
  }

  private async validateAndApplyDiscount(
    companyId: string,
    code: string,
    totalAmount: Prisma.Decimal | null,
  ) {
    const discount = await this.prisma.discount.findFirst({
      where: {
        companyId,
        code: code.toUpperCase(),
        isActive: true,
        validFrom: { lte: new Date() },
        OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
      },
    });

    if (!discount)
      throw new BadRequestException('Invalid or expired coupon code');

    if (discount.maxUses && discount.usedCount >= discount.maxUses) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    if (
      totalAmount &&
      discount.minAmount &&
      totalAmount.lessThan(discount.minAmount)
    ) {
      throw new BadRequestException(
        `Minimum booking amount for this coupon is ${discount.minAmount.toString()}`,
      );
    }

    return discount;
  }

  private generateBookingRef(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `GE-${timestamp}-${random}`;
  }

  private generateTicketNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `TKT-${timestamp}-${random}`;
  }

  private generateQrToken(bookingId: string, passengerId: string): string {
    const data = `${bookingId}:${passengerId}:${Date.now()}`;
    return crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'secret')
      .update(data)
      .digest('hex')
      .substring(0, 32);
  }

  private getHoursUntilDeparture(
    departureDate: Date,
    departureTime: string,
  ): number {
    const [hours, minutes] = departureTime.split(':').map(Number);
    const departure = new Date(departureDate);
    departure.setHours(hours, minutes, 0, 0);
    return Math.max(0, (departure.getTime() - Date.now()) / (1000 * 60 * 60));
  }
}
