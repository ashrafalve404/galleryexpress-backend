import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsString, IsInt, IsNumber, IsArray, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus, PaymentStatus, BookingSource, TicketStatus } from '@prisma/client';

export class PurchaseBulkQuotaDto {
  @ApiProperty() @IsString() routeId: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class IssueTicketFromQuotaDto {
  @ApiProperty() @IsString() bulkOrderId: string;
  @ApiProperty() @IsString() scheduleId: string;
  @ApiProperty({ type: [String] }) @IsArray() seatIds: string[];
  @ApiProperty() @IsString() passengerName: string;
  @ApiProperty() @IsString() passengerPhone: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

@Injectable()
export class AgentPortalService {
  constructor(private prisma: PrismaService) {}

  private get bulkOrderModel() {
    return (this.prisma as any).bulkTicketOrder;
  }

  // 1. Agent buys bulk ticket quota (e.g. 50 tickets on Dhaka -> Chittagong @ 1000 TK = 50000 TK)
  async purchaseBulkQuota(agentId: string, companyId: string, dto: PurchaseBulkQuotaDto) {
    const agent = await this.prisma.user.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent account not found');

    if ((agent as any).kycStatus !== 'VERIFIED') {
      throw new BadRequestException(
        'KYC Verification Required: Your account KYC must be approved by company administration before purchasing bulk ticket quotas. Please submit your NID & Counter verification details.',
      );
    }

    const route = await this.prisma.route.findFirst({
      where: { id: dto.routeId, companyId },
    });
    if (!route) throw new NotFoundException('Route not found');

    const totalAmount = dto.quantity * dto.unitPrice;

    return this.bulkOrderModel.create({
      data: {
        companyId,
        agentId,
        routeId: dto.routeId,
        quantity: dto.quantity,
        remainingQuantity: dto.quantity,
        unitPrice: dto.unitPrice,
        totalAmount,
        status: 'PURCHASED',
        notes: dto.notes,
      },
      include: {
        route: true,
      },
    });
  }

  // 2. Get list of active & historical bulk orders for this agent
  async getMyBulkOrders(agentId: string, companyId: string) {
    return this.bulkOrderModel.findMany({
      where: { agentId, companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        route: true,
        _count: { select: { bookings: true } },
      },
    });
  }

  // 3. Get summary dashboard stats for agent
  async getMyStats(agentId: string, companyId: string) {
    const bulkOrders = await this.bulkOrderModel.findMany({
      where: { agentId, companyId },
    });

    const totalPurchased = bulkOrders.reduce((sum: number, o: any) => sum + o.quantity, 0);
    const totalRemaining = bulkOrders.reduce((sum: number, o: any) => sum + o.remainingQuantity, 0);
    const totalSpent = bulkOrders.reduce((sum: number, o: any) => sum + Number(o.totalAmount), 0);
    const totalIssued = totalPurchased - totalRemaining;

    return {
      totalPurchased,
      totalIssued,
      totalRemaining,
      totalSpent,
      totalOrders: bulkOrders.length,
    };
  }

  // 4. Issue passenger ticket from active bulk quota (Assign date, schedule, seats, passenger)
  async issueTicketFromQuota(agentId: string, companyId: string, dto: IssueTicketFromQuotaDto) {
    const bulkOrder = await this.bulkOrderModel.findFirst({
      where: { id: dto.bulkOrderId, agentId, companyId },
      include: { route: true },
    });
    if (!bulkOrder) throw new NotFoundException('Bulk order quota not found');

    const seatsCount = dto.seatIds.length;
    if (seatsCount === 0) throw new BadRequestException('At least one seat must be selected');

    if (bulkOrder.remainingQuantity < seatsCount) {
      throw new BadRequestException(
        `Insufficient bulk quota. You have ${bulkOrder.remainingQuantity} remaining ticket(s) in this quota, but requested ${seatsCount}.`
      );
    }

    const schedule = await this.prisma.schedule.findFirst({
      where: { id: dto.scheduleId, companyId },
      include: { route: true, coach: true },
    });
    if (!schedule) throw new NotFoundException('Schedule trip not found');

    // Check seat availability
    const existingBookings = await this.prisma.bookingSeat.findMany({
      where: {
        seatId: { in: dto.seatIds },
        booking: {
          scheduleId: dto.scheduleId,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.HELD] },
        },
      },
    });
    if (existingBookings.length > 0) {
      throw new BadRequestException('One or more selected seats are already booked on this schedule');
    }

    // Generate unique booking ref
    const bookingRef = `AG-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const unitPrice = Number(bulkOrder.unitPrice);
    const totalAmount = unitPrice * seatsCount;

    // Execute atomic transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Booking linked to bulk order
      const booking = await tx.booking.create({
        data: {
          companyId,
          scheduleId: dto.scheduleId,
          userId: agentId,
          bookingRef,
          status: BookingStatus.CONFIRMED,
          totalAmount,
          discountAmount: 0,
          netAmount: totalAmount,
          paymentStatus: PaymentStatus.PAID,
          source: BookingSource.COUNTER,
          notes: `Issued from Bulk Order #${bulkOrder.id.slice(0, 8)} (${dto.notes || ''})`,
          confirmedAt: new Date(),
          bulkOrderId: bulkOrder.id,
        },
      });

      // 2. Create Passenger record
      const passenger = await tx.passenger.create({
        data: {
          bookingId: booking.id,
          name: dto.passengerName,
          phone: dto.passengerPhone,
        },
      });

      // 3. Create BookingSeat and Ticket for each seat
      for (const seatId of dto.seatIds) {
        await tx.bookingSeat.create({
          data: {
            bookingId: booking.id,
            seatId,
            passengerId: passenger.id,
            amount: unitPrice,
          },
        });

        const ticketNumber = `GE-TKT-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
        await tx.ticket.create({
          data: {
            bookingId: booking.id,
            passengerId: passenger.id,
            ticketNumber,
            qrToken: ticketNumber,
            status: TicketStatus.ACTIVE,
            issuedAt: new Date(),
          },
        });
      }

      // 4. Decrement remaining quantity in bulk order
      const updatedRemaining = bulkOrder.remainingQuantity - seatsCount;
      await (tx as any).bulkTicketOrder.update({
        where: { id: bulkOrder.id },
        data: {
          remainingQuantity: updatedRemaining,
          status: updatedRemaining === 0 ? 'EXHAUSTED' : 'PURCHASED',
        },
      });

      return tx.booking.findUnique({
        where: { id: booking.id },
        include: {
          schedule: { include: { route: true, coach: true } },
          passengers: true,
          tickets: true,
          bookingSeats: { include: { seat: true } },
        },
      });
    });

    return result;
  }

  // 5. Get all tickets issued by this agent
  async getMyIssuedTickets(agentId: string, companyId: string) {
    return this.prisma.booking.findMany({
      where: { userId: agentId, companyId, bulkOrderId: { not: null } },
      orderBy: { createdAt: 'desc' },
      include: {
        schedule: { include: { route: true, coach: true } },
        passengers: true,
        tickets: true,
        bookingSeats: { include: { seat: true } },
        bulkOrder: true,
      },
    });
  }

  // 6. Get Agent KYC Verification details
  async getKycStatus(agentId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        kycStatus: true,
        nidNumber: true,
        nidDocUrl: true,
        nidFrontDocUrl: true,
        nidBackDocUrl: true,
        counterName: true,
        counterAddress: true,
        tradeLicenseNo: true,
        kycSubmittedAt: true,
        kycVerifiedAt: true,
        kycRejectReason: true,
      } as any,
    });
    if (!user) throw new NotFoundException('Agent account not found');
    return user;
  }

  // 7. Submit Agent KYC Verification
  async submitKyc(agentId: string, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id: agentId } });
    if (!user) throw new NotFoundException('Agent account not found');

    const frontUrl = dto.nidFrontDocUrl || dto.nidDocUrl;
    const backUrl = dto.nidBackDocUrl || dto.nidDocUrl;

    return this.prisma.user.update({
      where: { id: agentId },
      data: {
        kycStatus: 'PENDING',
        nidNumber: dto.nidNumber,
        nidDocUrl: frontUrl,
        nidFrontDocUrl: frontUrl,
        nidBackDocUrl: backUrl,
        counterName: dto.counterName,
        counterAddress: dto.counterAddress,
        tradeLicenseNo: dto.tradeLicenseNo || null,
        kycSubmittedAt: new Date(),
        kycRejectReason: null,
      } as any,
      select: {
        id: true,
        kycStatus: true,
        nidNumber: true,
        nidDocUrl: true,
        nidFrontDocUrl: true,
        nidBackDocUrl: true,
        counterName: true,
        counterAddress: true,
        tradeLicenseNo: true,
        kycSubmittedAt: true,
      } as any,
    });
  }
}
