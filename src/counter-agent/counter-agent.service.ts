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
    dto: {
      routeId: string;
      quantity: number;
      paymentMethod?: string;
      senderPhone?: string;
      trxId?: string;
      paymentNotes?: string;
    },
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

    if (agent.kycStatus !== 'VERIFIED') {
      throw new BadRequestException(
        'KYC Verification Required. Please upload your NID Front & Back images and wait for Admin approval before purchasing bulk tickets.',
      );
    }

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
        status: 'PENDING_APPROVAL',
        paymentMethod: dto.paymentMethod || 'DIRECT_CASH',
        senderPhone: dto.senderPhone || null,
        trxId: dto.trxId || null,
        paymentNotes: dto.paymentNotes || null,
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

    // Automatically transition held commissions whose departure date has arrived
    await this.settleDepartureCommissions(companyId);

    const commissions = await (this.prisma as any).counterAgentCommission.findMany({
      where: { agentId, companyId },
    });

    // Only count finalized commissions (PENDING or PAID) after departure date cutoff
    const totalEarned = commissions
      .filter((c: any) => c.status === 'PENDING' || c.status === 'PAID')
      .reduce((s: number, c: any) => s + Number(c.agentShare), 0);
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
    await this.settleDepartureCommissions(companyId);

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
          status: 'HELD_UNTIL_DEPARTURE',
        },
      });
    }
  }

  // ─── REVERSE COMMISSION ON RESELL / CANCEL ──────────────────────────────────

  async reverseCommissionOnResell(bookingId: string, companyId: string) {
    const commissions = await (this.prisma as any).counterAgentCommission.findMany({
      where: { triggerBookingId: bookingId, companyId },
    });

    for (const comm of commissions) {
      // If commission was already settled (PENDING or PAID), decrement commissionEarned on BulkTicketOrder
      if (comm.status === 'PENDING' || comm.status === 'PAID') {
        const activeOrders = await this.prisma.bulkTicketOrder.findMany({
          where: { agentId: comm.agentId, companyId },
          orderBy: { createdAt: 'desc' },
        });

        let remainingToDeduct = Number(comm.agentShare || 0);
        for (const order of activeOrders) {
          if (remainingToDeduct <= 0) break;
          const currentEarned = Number((order as any).commissionEarned || 0);
          const deduct = Math.min(remainingToDeduct, currentEarned);
          if (deduct > 0) {
            await this.prisma.bulkTicketOrder.update({
              where: { id: order.id },
              data: {
                commissionEarned: { decrement: deduct },
                status: 'ACTIVE',
              } as any,
            });
            remainingToDeduct -= deduct;
          }
        }
      }

      // Mark commission record as CANCELLED
      await (this.prisma as any).counterAgentCommission.update({
        where: { id: comm.id },
        data: { status: 'CANCELLED' },
      });
    }
  }

  // ─── SETTLE COMMISSIONS AFTER DEPARTURE DATE ────────────────────────────────

  async settleDepartureCommissions(companyId: string) {
    const heldCommissions = await (this.prisma as any).counterAgentCommission.findMany({
      where: { companyId, status: 'HELD_UNTIL_DEPARTURE' },
      include: {
        triggerBooking: {
          include: {
            schedule: true,
          },
        },
      },
    });

    const nowBstStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

    for (const comm of heldCommissions) {
      const schedule = comm.triggerBooking?.schedule;
      if (!schedule) continue;

      const depBstStr = new Date(schedule.departureDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

      // If departure date has arrived or passed
      if (nowBstStr >= depBstStr) {
        // Transition status to PENDING (ready for Admin payout)
        await (this.prisma as any).counterAgentCommission.update({
          where: { id: comm.id },
          data: { status: 'PENDING' },
        });

        // Increment commissionEarned on agent's active BulkTicketOrder
        const eligibleOrders = await this.prisma.bulkTicketOrder.findMany({
          where: { agentId: comm.agentId, companyId, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        });

        let remaining = Number(comm.agentShare || 0);
        for (const order of eligibleOrders) {
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

  async approveBulkOrder(orderId: string, companyId: string, adminId: string) {
    const order = await this.prisma.bulkTicketOrder.findFirst({
      where: { id: orderId, companyId },
    });
    if (!order) throw new NotFoundException('Bulk order not found.');
    if (order.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Order is not in pending approval status.');
    }

    const updated = await this.prisma.bulkTicketOrder.update({
      where: { id: orderId },
      data: {
        status: 'ACTIVE',
        approvedAt: new Date(),
        approvedBy: adminId,
      } as any,
    });

    return { message: 'Bulk ticket order payment approved successfully!', order: updated };
  }

  async rejectBulkOrder(orderId: string, companyId: string, adminId: string, reason?: string) {
    const order = await this.prisma.bulkTicketOrder.findFirst({
      where: { id: orderId, companyId },
    });
    if (!order) throw new NotFoundException('Bulk order not found.');

    const updated = await this.prisma.bulkTicketOrder.update({
      where: { id: orderId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason || 'Payment transaction verification failed.',
      } as any,
    });

    return { message: 'Bulk ticket order payment rejected.', order: updated };
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

  // ─── KYC VERIFICATION METHODS ───────────────────────────────────────────────

  async submitKyc(
    agentId: string,
    companyId: string,
    dto: { nidNumber: string; nidFrontDocUrl: string; nidBackDocUrl: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: agentId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: agentId },
      data: {
        nidNumber: dto.nidNumber,
        nidFrontDocUrl: dto.nidFrontDocUrl,
        nidBackDocUrl: dto.nidBackDocUrl,
        nidDocUrl: dto.nidFrontDocUrl,
        kycStatus: 'PENDING',
        kycSubmittedAt: new Date(),
        kycRejectReason: null,
      },
    });

    try {
      const admins = await this.prisma.user.findMany({
        where: { companyId, role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] } },
      });
      for (const admin of admins) {
        await this.prisma.notification.create({
          data: {
            companyId,
            userId: admin.id,
            type: 'GENERAL',
            title: 'KYC Verification Submitted',
            body: `Counter Agent ${user.firstName} ${user.lastName} (${user.phone || user.email}) has submitted NID KYC Verification.`,
            data: { agentId, link: '/admin/kyc' },
          },
        });
      }
    } catch {
      // ignore notification failures
    }

    return updated;
  }

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
        nidFrontDocUrl: true,
        nidBackDocUrl: true,
        kycSubmittedAt: true,
        kycVerifiedAt: true,
        kycRejectReason: true,
      },
    });
    return user;
  }

  async getAdminKycRequests(companyId: string) {
    const agents = await this.prisma.user.findMany({
      where: { companyId, role: UserRole.COUNTER_AGENT },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        assignedCounterId: true,
        kycStatus: true,
        nidNumber: true,
        nidFrontDocUrl: true,
        nidBackDocUrl: true,
        kycSubmittedAt: true,
        kycVerifiedAt: true,
        kycRejectReason: true,
        createdAt: true,
      },
      orderBy: { kycSubmittedAt: 'desc' },
    });

    const counters = await this.prisma.counter.findMany({
      where: { companyId },
      select: { id: true, name: true, location: true },
    });
    const counterMap = new Map(counters.map((c) => [c.id, c]));

    return agents.map((agent) => ({
      ...agent,
      counter: agent.assignedCounterId ? counterMap.get(agent.assignedCounterId) ?? null : null,
    }));
  }

  async approveKyc(agentId: string, companyId: string, adminId: string) {
    const agent = await this.prisma.user.findUnique({ where: { id: agentId, companyId } });
    if (!agent) throw new NotFoundException('Agent not found');

    const updated = await this.prisma.user.update({
      where: { id: agentId },
      data: {
        kycStatus: 'VERIFIED',
        kycVerifiedAt: new Date(),
        kycRejectReason: null,
      },
    });

    try {
      await this.prisma.notification.create({
        data: {
          companyId,
          userId: agentId,
          type: 'GENERAL',
          title: 'KYC Verification Approved',
          body: 'Your NID KYC Verification has been approved by Admin! You can now purchase bulk ticket quotas.',
          data: { link: '/counter-agent/buy-bulk' },
        },
      });
    } catch {
      // ignore
    }

    return updated;
  }

  async rejectKyc(agentId: string, companyId: string, reason?: string) {
    const agent = await this.prisma.user.findUnique({ where: { id: agentId, companyId } });
    if (!agent) throw new NotFoundException('Agent not found');

    const updated = await this.prisma.user.update({
      where: { id: agentId },
      data: {
        kycStatus: 'REJECTED',
        kycRejectReason: reason || 'Invalid or unreadable NID documents.',
      },
    });

    try {
      await this.prisma.notification.create({
        data: {
          companyId,
          userId: agentId,
          type: 'GENERAL',
          title: 'KYC Verification Rejected',
          body: `Your NID KYC Verification was rejected: ${reason || 'Invalid NID documents'}. Please re-upload clear NID images.`,
          data: { link: '/counter-agent/kyc' },
        },
      });
    } catch {
      // ignore
    }

    return updated;
  }
}

