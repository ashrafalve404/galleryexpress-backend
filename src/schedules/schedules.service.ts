import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  SearchScheduleDto,
} from './dto/schedule.dto';
import {
  PaginationDto,
  getPaginationParams,
  paginatedResponse,
} from '../common/utils/pagination.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateScheduleDto) {
    // Validate coach and route belong to company
    const [coach, route] = await Promise.all([
      this.prisma.coach.findFirst({ where: { id: dto.coachId, companyId } }),
      this.prisma.route.findFirst({ where: { id: dto.routeId, companyId } }),
    ]);

    if (!coach) throw new NotFoundException('Coach not found');
    if (!route) throw new NotFoundException('Route not found');

    // Check for duplicate schedule (same coach, date, departure time)
    const existing = await this.prisma.schedule.findFirst({
      where: {
        coachId: dto.coachId,
        departureDate: new Date(dto.departureDate),
        departureTime: dto.departureTime,
        status: { not: 'CANCELLED' },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'A schedule already exists for this coach at this date and time',
      );
    }

    return this.prisma.schedule.create({
      data: {
        companyId,
        coachId: dto.coachId,
        routeId: dto.routeId,
        departureDate: new Date(dto.departureDate),
        departureTime: dto.departureTime,
        arrivalTime: dto.arrivalTime,
        isRecurring: dto.isRecurring ?? false,
        recurringDays: dto.recurringDays ?? [],
        bookingOpenTime: dto.bookingOpenTime
          ? new Date(dto.bookingOpenTime)
          : null,
        bookingCloseTime: dto.bookingCloseTime
          ? new Date(dto.bookingCloseTime)
          : null,
        status: dto.status ?? 'ACTIVE',
        notes: dto.notes,
      },
      include: {
        coach: { include: { coachType: true } },
        route: { include: { stops: { orderBy: { sequence: 'asc' } } } },
      },
    });
  }

  async findAll(
    companyId: string,
    query: PaginationDto & { date?: string; routeId?: string },
  ) {
    const { skip, take } = getPaginationParams(query);

    const where: Prisma.ScheduleWhereInput = {
      companyId,
      ...(query.date && { departureDate: new Date(query.date) }),
      ...(query.routeId && { routeId: query.routeId }),
    };

    const [schedules, total] = await this.prisma.$transaction([
      this.prisma.schedule.findMany({
        where,
        skip,
        take,
        orderBy: [{ departureDate: 'asc' }, { departureTime: 'asc' }],
        include: {
          coach: { include: { coachType: true } },
          route: true,
          _count: { select: { bookings: true } },
        },
      }),
      this.prisma.schedule.count({ where }),
    ]);

    return paginatedResponse(
      schedules,
      total,
      query.page || 1,
      query.limit || 20,
    );
  }

  async search(companyId: string, dto: SearchScheduleDto) {
    const originVal = dto.origin || dto.from;
    const destVal = dto.destination || dto.to;

    const where: Prisma.ScheduleWhereInput = {
      companyId,
      status: 'ACTIVE',
      ...(dto.date && { departureDate: new Date(dto.date) }),
      ...(dto.routeId && { routeId: dto.routeId }),
      ...(originVal || destVal
        ? {
            route: {
              ...(originVal && {
                origin: { contains: originVal, mode: 'insensitive' },
              }),
              ...(destVal && {
                destination: { contains: destVal, mode: 'insensitive' },
              }),
            },
          }
        : {}),
    };

    const schedules = await this.prisma.schedule.findMany({
      where,
      orderBy: [{ departureDate: 'asc' }, { departureTime: 'asc' }],
      include: {
        coach: {
          include: { coachType: true, _count: { select: { seats: true } } },
        },
        route: { include: { stops: { orderBy: { sequence: 'asc' } } } },
      },
    });

    if (dto.date) {
      const searchDateStr = dto.date.split('T')[0];
      
      // Explicitly calculate date & time for Bangladesh Standard Time (Asia/Dhaka)
      const bdNowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
      const bdDate = new Date(bdNowStr);
      const bdTodayStr = `${bdDate.getFullYear()}-${(bdDate.getMonth() + 1).toString().padStart(2, '0')}-${bdDate.getDate().toString().padStart(2, '0')}`;

      if (searchDateStr === bdTodayStr) {
        const currentHH = bdDate.getHours().toString().padStart(2, '0');
        const currentMM = bdDate.getMinutes().toString().padStart(2, '0');
        const currentTimeStr = `${currentHH}:${currentMM}`;

        return schedules.filter((s) => s.departureTime >= currentTimeStr);
      }
    }

    return schedules;
  }

  async findOne(id: string, companyId: string) {
    const schedule = await this.prisma.schedule.findFirst({
      where: { id, companyId },
      include: {
        coach: { include: { coachType: true, seats: true } },
        route: { include: { stops: { orderBy: { sequence: 'asc' } } } },
        _count: { select: { bookings: true } },
      },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  async update(id: string, companyId: string, dto: UpdateScheduleDto) {
    await this.findOne(id, companyId);
    return this.prisma.schedule.update({
      where: { id },
      data: {
        ...(dto.departureDate && {
          departureDate: new Date(dto.departureDate),
        }),
        ...(dto.departureTime && { departureTime: dto.departureTime }),
        ...(dto.arrivalTime && { arrivalTime: dto.arrivalTime }),
        ...(dto.isRecurring !== undefined && { isRecurring: dto.isRecurring }),
        ...(dto.recurringDays && { recurringDays: dto.recurringDays }),
        ...(dto.bookingOpenTime && {
          bookingOpenTime: new Date(dto.bookingOpenTime),
        }),
        ...(dto.bookingCloseTime && {
          bookingCloseTime: new Date(dto.bookingCloseTime),
        }),
        ...(dto.status && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { coach: true, route: true },
    });
  }

  async cancel(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.schedule.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async getSeats(scheduleId: string, companyId: string) {
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, companyId },
      include: {
        coach: {
          include: {
            seats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] },
          },
        },
      },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');

    // Get booked/locked seats for this schedule
    const [bookedSeats, lockedSeats] = await Promise.all([
      this.prisma.bookingSeat.findMany({
        where: {
          booking: {
            scheduleId,
            status: { in: ['HELD', 'CONFIRMED'] },
          },
        },
        select: { seatId: true },
      }),
      this.prisma.seatLock.findMany({
        where: {
          scheduleId,
          expiresAt: { gt: new Date() },
        },
        select: { seatId: true },
      }),
    ]);

    const bookedSeatIds = new Set(bookedSeats.map((s) => s.seatId));
    const lockedSeatIds = new Set(lockedSeats.map((s) => s.seatId));

    return schedule.coach.seats.map((seat) => {
      const isBooked = bookedSeatIds.has(seat.id);
      const isHeld = lockedSeatIds.has(seat.id);
      return {
        ...seat,
        availability: isBooked ? 'BOOKED' : isHeld ? 'LOCKED' : 'AVAILABLE',
        isBooked,
        isHeld,
      };
    });
  }
}
