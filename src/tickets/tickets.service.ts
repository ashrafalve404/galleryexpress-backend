import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  async findByTicketNumber(ticketNumber: string, companyId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        booking: { companyId },
        OR: [
          { ticketNumber },
          { id: ticketNumber },
          { booking: { bookingRef: ticketNumber } },
          { bookingId: ticketNumber },
        ],
      },
      include: {
        passenger: true,
        booking: {
          include: {
            counter: true,
            schedule: {
              include: {
                coach: { include: { coachType: true } },
                route: { include: { stops: { orderBy: { sequence: 'asc' } } } },
              },
            },
            bookingSeats: { include: { seat: true } },
          },
        },
      },
    });

    if (!ticket) {
      // Fallback lookup directly on Booking using bookingRef or bookingId
      const booking = await this.prisma.booking.findFirst({
        where: {
          companyId,
          OR: [{ bookingRef: ticketNumber }, { id: ticketNumber }],
        },
        include: {
          counter: true,
          passengers: true,
          schedule: {
            include: {
              coach: { include: { coachType: true } },
              route: { include: { stops: { orderBy: { sequence: 'asc' } } } },
            },
          },
          bookingSeats: { include: { seat: true } },
        },
      });

      if (booking) {
        const passenger = booking.passengers[0] || null;
        return {
          id: booking.id,
          bookingId: booking.id,
          passengerId: passenger?.id || null,
          ticketNumber: booking.bookingRef,
          qrToken: booking.id,
          status: 'ACTIVE',
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
          passenger,
          booking,
        } as any;
      }

      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }

  async verifyTicket(ticketNumber: string, companyId: string) {
    const ticket = await this.findByTicketNumber(ticketNumber, companyId);

    if (ticket.status !== 'ACTIVE') {
      return {
        valid: false,
        reason: `Ticket is ${ticket.status.toLowerCase()}`,
        ticket,
      };
    }

    if (ticket.booking.status !== 'CONFIRMED') {
      return {
        valid: false,
        reason: 'Booking is not confirmed',
        ticket,
      };
    }

    // Mark as used
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'USED', usedAt: new Date() },
    });

    return { valid: true, reason: 'Ticket verified successfully', ticket };
  }

  async verifyByQrToken(qrToken: string, companyId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        qrToken,
        booking: { companyId },
      },
      include: {
        passenger: true,
        booking: {
          include: {
            counter: true,
            schedule: { include: { coach: true, route: true } },
            bookingSeats: { include: { seat: true } },
          },
        },
      },
    });

    if (!ticket) return { valid: false, reason: 'Ticket not found' };

    if (ticket.status !== 'ACTIVE') {
      return {
        valid: false,
        reason: `Ticket is ${ticket.status.toLowerCase()}`,
      };
    }

    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'USED', usedAt: new Date() },
    });

    return { valid: true, reason: 'Verified', ticket };
  }

  async findByBooking(bookingId: string, companyId: string) {
    return this.prisma.ticket.findMany({
      where: { bookingId, booking: { companyId } },
      include: { passenger: true },
    });
  }

  async adminList(companyId: string, scheduleId?: string) {
    return this.prisma.ticket.findMany({
      where: {
        booking: {
          companyId,
          ...(scheduleId && { scheduleId }),
        },
      },
      include: {
        passenger: true,
        booking: {
          include: {
            schedule: { include: { route: true, coach: true } },
            bookingSeats: { include: { seat: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
