import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

const COMMISSION_PER_BOOKING = 200;
const BULK_MIN_QUANTITY = 10;
const ALLOWED_ROUTE_NAMES = ['Dhaka', "Cox's Bazar"];
const UNIT_PRICE = 2000;

@Injectable()
export class CounterAgentService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── BUY BULK TICKETS ───────────────────────────────────────────────────────

  async buyBulkTickets(
    agentId: string,
    companyId: string,
    dto: { routeId: string; quantity: number },
  ) {
    if (dto.quantity < BULK_MIN_QUANTITY) {
      throw new BadRequestException(
        `Minimum bulk purchase is ${BULK_MIN_QUANTITY} tickets.`,
      );
    }

    // Validate route is allowed (Dhaka ↔ Cox's Bazar only)
    const route = await this.prisma.route.findFirst({
      where: { id: dto.routeId, companyId },
    });
    if (!route) throw new NotFoundException('Route not found.');

    const origin = (route as any).origin?.trim();
    const destination = (route as any).destination?.trim();

    const isAllowedRoute =
      ALLOWED_ROUTE_NAMES.includes(origin) &&
      ALLOWED_ROUTE_NAMES.includes(destination) &&
      origin !== destination;

    if (!isAllowedRoute) {
      throw new BadRequestException(
        "Bulk tickets are only available for Dhaka ↔ Cox's Bazar route.",
      );
    }

    const unitPrice = UNIT_PRICE;
    const totalAmount = unitPrice * dto.quantity;

    const agent = await this.prisma.user.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent account not found.');

    const bulkOrder = await this.prisma.bulkTicketOrder.create({
      data: {
        companyId,
        agentId,
        routeId: dto.routeId,
        counterId: (agent as any).assignedCounterId ?? null,
        quantity: dto.quantity,
        remainingQuantity: dto.quantity,
        unitPrice,
        totalAmount,
        commissionCap: totalAmount,
        commissionEarned: 0,
        commissionEligible: true,
        status: 'ACTIVE',
      } as any,
    });

    return bulkOrder;
  }

  // ─── ASSIGN COUNTER ──────────────────────────────────────────────────────────

  async assignCounter(agentId: string, companyId: string, counterId: string) {
    const counter = await this.prisma.counter.findFirst({
      where: { id: counterId, companyId },
    });
    if (!counter) throw new NotFoundException('Counter not found.');

    await this.prisma.user.update({
      where: { id: agentId },
      data: { assignedCounterId: counterId } as any,
    });

    await this.prisma.bulkTicketOrder.updateMany({
      where: { agentId, companyId, status: 'ACTIVE' },
      data: { counterId } as any,
    });

    return { message: 'Counter assigned successfully.', counterId };
  }

  // ─── DASHBOARD STATS ─────────────────────────────────────────────────────────

  async getDashboardStats(agentId: string, companyId: string) {
    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    const agentFull = await this.prisma.user.findUnique({
      where: { id: agentId },
    });

    const counter = (agentFull as any)?.assignedCounterId
      ? await this.prisma.counter.findUnique({
          where: { id: (agentFull as any).assignedCounterId },
          select: { id: true, name: true, location: true },
        })
      : null;

    const bulkOrders = await this.prisma.bulkTicketOrder.findMany({
      where: { agentId, companyId },
      include: { route: { select: { origin: true, destination: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const totalTicketsBought = bulkOrders.reduce((s, o) => s + o.quantity, 0);
    const totalTicketsRemaining = bulkOrders
      .filter((o) => o.status === 'ACTIVE')
      .reduce((s, o) => s + o.remainingQuantity, 0);
    const totalInvested = bulkOrders.reduce(
      (s, o) => s + Number(o.totalAmount),
      0,
    );

    const commissions = await (this.prisma as any).counterAgentCommission.findMany({
      where: { agentId, companyId },
    });

    const totalEarned = commissions.reduce(
      (s: number, c: any) => s + Number(c.agentShare),
      0,
    );
    const commissionCap = bulkOrders
      .filter((o) => (o as any).commissionEligible)
      .reduce((s, o) => s + Number((o as any).commissionCap), 0);
    const commissionEarnedOnOrders = bulkOrders.reduce(
      (s, o) => s + Number((o as any).commissionEarned),
      0,
    );
    const remainingCapacity = Math.max(0, commissionCap - commissionEarnedOnOrders);

    return {
      agent: { ...agent, assignedCounterId: (agentFull as any)?.assignedCounterId },
      counter,
      totalTicketsBought,
      totalTicketsRemaining,
      totalInvested,
      commissionStats: {
        totalEarned,
        commissionCap,
        remainingCapacity,
        capReached: remainingCapacity <= 0 && commissionCap > 0,
        recentCommissions: commissions.slice(0, 5),
      },
      bulkOrders,
    };
  }

  // ─── MY BULK ORDERS ──────────────────────────────────────────────────────────

  async getMyBulkOrders(agentId: string, companyId: string) {
    return this.prisma.bulkTicketOrder.findMany({
      where: { agentId, companyId },
      include: {
        route: { select: { origin: true, destination: true } },
        counter: { select: { name: true, location: true } },
      } as any,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── MY COMMISSIONS ──────────────────────────────────────────────────────────

  async getMyCommissions(agentId: string, companyId: string) {
    return (this.prisma as any).counterAgentCommission.findMany({
      where: { agentId, companyId },
      include: {
        triggerBooking: {
          select: { bookingRef: true, totalAmount: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── AVAILABLE COUNTERS ───────────────────────────────────────────────────────

  async getAvailableCounters(companyId: string) {
    const counters = await this.prisma.counter.findMany({
      where: { companyId, status: 'ACTIVE' },
      select: { id: true, name: true, location: true, phone: true },
    });

    return counters.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const location = (c.location || '').toLowerCase();

      const isDhakaOrCox =
        name.includes('dhaka') ||
        name.includes('cox') ||
        location.includes('dhaka') ||
        location.includes('cox');

      const isChittagong =
        name.includes('chittagong') ||
        location.includes('chittagong') ||
        name.includes('ctg') ||
        location.includes('ctg');

      return isDhakaOrCox && !isChittagong;
    });
  }

  // ─── ALLOWED ROUTES (Dhaka ↔ Cox's Bazar) ───────────────────────────────────

  async getAllowedRoutes(companyId: string) {
    const routes = await this.prisma.route.findMany({
      where: { companyId, status: 'ACTIVE' },
    });
    return routes.filter((r) => {
      const origin = (r as any).origin?.trim();
      const destination = (r as any).destination?.trim();
      return (
        ALLOWED_ROUTE_NAMES.includes(origin) &&
        ALLOWED_ROUTE_NAMES.includes(destination) &&
        origin !== destination
      );
    });
  }

  // ─── DISTRIBUTE COMMISSION (called by BookingsService on CONFIRMED) ──────────

  async distributeCommission(
    bookingId: string,
    companyId: string,
    counterId: string | null,
  ) {
    if (!counterId) return;

    const eligibleOrders = await this.prisma.bulkTicketOrder.findMany({
      where: { companyId, status: 'ACTIVE', commissionEligible: true } as any,
    });

    const agentMap = new Map<string, typeof eligibleOrders>();
    for (const order of eligibleOrders) {
      const remaining = Number((order as any).commissionCap) - Number((order as any).commissionEarned);
      if (remaining > 0) {
        if (!agentMap.has(order.agentId)) agentMap.set(order.agentId, []);
        agentMap.get(order.agentId)!.push(order);
      }
    }

    const eligibleAgentIds = Array.from(agentMap.keys());
    const n = eligibleAgentIds.length;
    if (n === 0) return;

    const sharePerAgent = Math.round((COMMISSION_PER_BOOKING / n) * 100) / 100;

    for (const agentId of eligibleAgentIds) {
      await (this.prisma as any).counterAgentCommission.create({
        data: {
          companyId,
          agentId,
          triggerBookingId: bookingId,
          totalCommission: COMMISSION_PER_BOOKING,
          agentShare: sharePerAgent,
          totalAgents: n,
          status: 'PENDING',
        },
      });

      let remaining = sharePerAgent;
      const orders = (agentMap.get(agentId) ?? []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      for (const order of orders) {
        if (remaining <= 0) break;
        const cap = Number((order as any).commissionCap);
        const earned = Number((order as any).commissionEarned);
        const available = cap - earned;
        const toAdd = Math.min(remaining, available);

        await this.prisma.bulkTicketOrder.update({
          where: { id: order.id },
          data: {
            commissionEarned: { increment: toAdd },
            status: earned + toAdd >= cap ? 'EXHAUSTED' : 'ACTIVE',
          } as any,
        });
        remaining -= toAdd;
      }
    }
  }

  // ─── ADMIN MONITORING METHODS ────────────────────────────────────────────────

  async getAdminOverview(companyId: string) {
    const totalAgents = await this.prisma.user.count({
      where: { companyId, role: UserRole.COUNTER_AGENT },
    });

    const bulkOrders = await this.prisma.bulkTicketOrder.findMany({
      where: { companyId },
    });

    const totalBulkTickets = bulkOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);
    const totalRemainingTickets = bulkOrders.reduce((sum, o) => sum + (o.remainingQuantity || 0), 0);
    const totalInvested = bulkOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const totalCommissionEarned = bulkOrders.reduce((sum, o) => sum + Number((o as any).commissionEarned || 0), 0);

    const commissions = await (this.prisma as any).counterAgentCommission.findMany({
      where: { companyId },
    });

    const pendingCommissionsCount = commissions.filter((c: any) => c.status === 'PENDING').length;
    const paidCommissionsTotal = commissions
      .filter((c: any) => c.status === 'PAID')
      .reduce((sum: number, c: any) => sum + Number(c.agentShare || 0), 0);

    return {
      totalAgents,
      totalBulkOrders: bulkOrders.length,
      totalBulkTickets,
      totalRemainingTickets,
      totalInvested,
      totalCommissionEarned,
      pendingCommissionsCount,
      paidCommissionsTotal,
    };
  }

  async getAdminAgentsList(companyId: string) {
    const agents = await this.prisma.user.findMany({
      where: { companyId, role: UserRole.COUNTER_AGENT },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        assignedCounterId: true,
        status: true,
        createdAt: true,
      } as any,
      orderBy: { createdAt: 'desc' },
    });

    const counters = await this.prisma.counter.findMany({
      where: { companyId },
      select: { id: true, name: true, location: true },
    });
    const counterMap = new Map(counters.map((c) => [c.id, c]));

    const bulkOrders = await this.prisma.bulkTicketOrder.findMany({
      where: { companyId },
    });

    return agents.map((agent: any) => {
      const agentOrders = bulkOrders.filter((o) => o.agentId === agent.id);
      const totalTicketsBought = agentOrders.reduce((s, o) => s + (o.quantity || 0), 0);
      const totalRemainingTickets = agentOrders.reduce((s, o) => s + (o.remainingQuantity || 0), 0);
      const totalInvested = agentOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
      const totalEarned = agentOrders.reduce((s, o) => s + Number((o as any).commissionEarned || 0), 0);

      return {
        ...agent,
        counter: agent.assignedCounterId ? counterMap.get(agent.assignedCounterId) ?? null : null,
        totalTicketsBought,
        totalRemainingTickets,
        totalInvested,
        totalEarned,
        bulkOrdersCount: agentOrders.length,
      };
    });
  }

  async getAdminBulkOrders(companyId: string) {
    return this.prisma.bulkTicketOrder.findMany({
      where: { companyId },
      include: {
        agent: { select: { firstName: true, lastName: true, email: true, phone: true } },
        route: { select: { origin: true, destination: true } },
        counter: { select: { name: true, location: true } },
      } as any,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAdminCommissions(companyId: string) {
    return (this.prisma as any).counterAgentCommission.findMany({
      where: { companyId },
      include: {
        agent: { select: { firstName: true, lastName: true, email: true, phone: true } },
        triggerBooking: { select: { bookingRef: true, totalAmount: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markCommissionPaid(commissionId: string, companyId: string) {
    return (this.prisma as any).counterAgentCommission.updateMany({
      where: { id: commissionId, companyId },
      data: { status: 'PAID' },
    });
  }
}

