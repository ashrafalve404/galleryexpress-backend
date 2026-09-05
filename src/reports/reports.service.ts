import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardSummary(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      totalBookings,
      todayBookings,
      confirmedBookings,
      cancelledBookings,
      totalRevenue,
      todayRevenue,
      monthlyRevenue,
      totalPassengers,
      onlineBookings,
      counterBookings,
      activeSchedules,
    ] = await Promise.all([
      this.prisma.booking.count({ where: { companyId } }),
      this.prisma.booking.count({
        where: { companyId, createdAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.booking.count({ where: { companyId, status: 'CONFIRMED' } }),
      this.prisma.booking.count({ where: { companyId, status: 'CANCELLED' } }),
      this.prisma.booking.aggregate({
        where: { companyId, status: 'CONFIRMED' },
        _sum: { netAmount: true },
      }),
      this.prisma.booking.aggregate({
        where: {
          companyId,
          status: 'CONFIRMED',
          createdAt: { gte: today, lt: tomorrow },
        },
        _sum: { netAmount: true },
      }),
      this.prisma.booking.aggregate({
        where: {
          companyId,
          status: 'CONFIRMED',
          createdAt: { gte: startOfMonth },
        },
        _sum: { netAmount: true },
      }),
      this.prisma.passenger.count({
        where: {
          booking: {
            companyId,
            status: 'CONFIRMED',
          },
        },
      }),
      this.prisma.booking.count({
        where: { companyId, source: 'ONLINE', status: 'CONFIRMED' },
      }),
      this.prisma.booking.count({
        where: { companyId, source: 'COUNTER', status: 'CONFIRMED' },
      }),
      this.prisma.schedule.count({
        where: { companyId, status: 'ACTIVE', departureDate: { gte: today } },
      }),
    ]);

    return {
      totalBookings,
      todayBookings,
      confirmedBookings,
      cancelledBookings,
      totalRevenue: totalRevenue._sum.netAmount || 0,
      todayRevenue: todayRevenue._sum.netAmount || 0,
      monthlyRevenue: monthlyRevenue._sum.netAmount || 0,
      totalPassengers,
      onlineBookings,
      counterBookings,
      activeSchedules,
    };
  }

  async getRevenueByDateRange(companyId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const bookings = await this.prisma.booking.findMany({
      where: {
        companyId,
        status: 'CONFIRMED',
        confirmedAt: { gte: fromDate, lte: toDate },
      },
      select: {
        netAmount: true,
        source: true,
        confirmedAt: true,
        schedule: {
          select: {
            departureDate: true,
            route: { select: { origin: true, destination: true } },
          },
        },
      },
    });

    const totalRevenue = bookings.reduce(
      (sum, b) => sum + parseFloat(b.netAmount.toString()),
      0,
    );
    const onlineRevenue = bookings
      .filter((b) => b.source === 'ONLINE')
      .reduce((sum, b) => sum + parseFloat(b.netAmount.toString()), 0);
    const counterRevenue = bookings
      .filter((b) => b.source === 'COUNTER')
      .reduce((sum, b) => sum + parseFloat(b.netAmount.toString()), 0);

    return {
      totalRevenue,
      onlineRevenue,
      counterRevenue,
      bookingCount: bookings.length,
      bookings,
    };
  }

  async getRoutePerformance(companyId: string) {
    const routes = await this.prisma.route.findMany({
      where: { companyId, status: 'ACTIVE' },
      include: {
        schedules: {
          include: {
            _count: { select: { bookings: true } },
            bookings: {
              where: { status: 'CONFIRMED' },
              select: { netAmount: true },
            },
          },
        },
      },
    });

    return routes.map((route) => {
      const totalBookings = route.schedules.reduce(
        (sum, s) => sum + s._count.bookings,
        0,
      );
      const totalRevenue = route.schedules
        .flatMap((s) => s.bookings)
        .reduce((sum, b) => sum + parseFloat(b.netAmount.toString()), 0);
      return {
        routeId: route.id,
        origin: route.origin,
        destination: route.destination,
        totalSchedules: route.schedules.length,
        totalBookings,
        totalRevenue,
      };
    });
  }

  async getCoachPerformance(companyId: string) {
    const coaches = await this.prisma.coach.findMany({
      where: { companyId },
      include: {
        schedules: {
          include: {
            _count: { select: { bookings: true } },
            bookings: {
              where: { status: 'CONFIRMED' },
              select: { netAmount: true },
            },
          },
        },
        coachType: true,
      },
    });

    return coaches.map((coach) => {
      const totalTrips = coach.schedules.length;
      const totalBookings = coach.schedules.reduce(
        (sum, s) => sum + s._count.bookings,
        0,
      );
      const totalRevenue = coach.schedules
        .flatMap((s) => s.bookings)
        .reduce((sum, b) => sum + parseFloat(b.netAmount.toString()), 0);
      return {
        coachId: coach.id,
        coachName: coach.name,
        coachNumber: coach.coachNumber,
        coachType: coach.coachType.name,
        totalTrips,
        totalBookings,
        totalRevenue,
      };
    });
  }

  async getBookingsByStatus(companyId: string, from?: string, to?: string) {
    const where: Prisma.BookingWhereInput = {
      companyId,
      ...(from &&
        to && {
          createdAt: { gte: new Date(from), lte: new Date(to) },
        }),
    };

    const result = await this.prisma.booking.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });

    return result.map((r) => ({ status: r.status, count: r._count._all }));
  }
}
