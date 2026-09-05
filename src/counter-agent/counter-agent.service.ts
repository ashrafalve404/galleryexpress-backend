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

  // ─── SELL TICKET FROM BULK BALANCE ──────────────────────────────────────────

  async sellTicketFromBulk(
    agentId: string,
    companyId: string,
    dto: {
      scheduleId: string;
      seatNumbers: string[];
      passengerName: string;
      passengerPhone: string;
      passengerEmail?: string;
      gender?: string;
    },
  ) {
    const seatCount = dto.seatNumbers?.length || 0;
    if (seatCount === 0) {
      throw new BadRequestException('Please select at least one seat to sell.');
    }

    const agent = await this.prisma.user.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent account not found.');

    if (agent.kycStatus !== 'VERIFIED') {
      throw new BadRequestException(
        'KYC Verification Required. Please wait for Admin KYC approval before selling tickets.',
      );
    }

    const schedule = await this.prisma.schedule.findFirst({
      where: { id: dto.scheduleId, companyId },
      include: { route: true, coach: true },
    });
    if (!schedule) throw new NotFoundException('Schedule not found.');

    // Find all active bulk orders for this agent with remaining balance
    const activeBulkOrders = await this.prisma.bulkTicketOrder.findMany({
      where: {
        agentId,
        status: 'ACTIVE',
        remainingQuantity: { gt: 0 },
      } as any,
      orderBy: { createdAt: 'asc' },
    });

    const totalAvailable = activeBulkOrders.reduce(
      (s, o) => s + (o.remainingQuantity || 0),
      0,
    );

    if (totalAvailable < seatCount) {
      throw new BadRequestException(
        `Insufficient bulk ticket balance. You have ${totalAvailable} ticket(s) remaining, but selected ${seatCount} seat(s). Please purchase more bulk tickets.`,
      );
    }

    // Deduct bulk quantity & create confirmed booking
    const result = await this.prisma.$transaction(async (tx) => {
      let remainingToDeduct = seatCount;
      for (const order of activeBulkOrders) {
        if (remainingToDeduct <= 0) break;
        const deduct = Math.min(order.remainingQuantity, remainingToDeduct);
        const newRemaining = order.remainingQuantity - deduct;
        await tx.bulkTicketOrder.update({
          where: { id: order.id },
          data: {
            remainingQuantity: newRemaining,
            status: newRemaining === 0 ? 'EXHAUSTED' : 'ACTIVE',
          } as any,
        });
        remainingToDeduct -= deduct;
      }

      const bookingRef = 'TKD-AG-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const farePerSeat = (schedule as any).fare ? Number((schedule as any).fare) : 2000;
      const totalAmount = farePerSeat * seatCount;

      let validCounterId: string | null = null;
      if ((agent as any)?.assignedCounterId) {
        const counterObj = await tx.counter.findUnique({
          where: { id: (agent as any).assignedCounterId },
        });
        if (counterObj) validCounterId = counterObj.id;
      }

      const booking = await tx.booking.create({
        data: {
          companyId,
          scheduleId: dto.scheduleId,
          userId: agentId,
          counterId: validCounterId,
          bookingRef,
          status: 'CONFIRMED',
          totalAmount,
          discountAmount: 0,
          netAmount: totalAmount,
          paymentStatus: 'PAID',
          paymentMethod: 'BULK_TICKET_DEDUCTION',
          source: 'COUNTER',
          notes: `Ticket sold from Bulk Package by Agent ${agent.firstName} (${agent.phone})`,
        } as any,
      });

      for (const seatNo of dto.seatNumbers) {
        let seatObj = await tx.seat.findFirst({
          where: { coachId: schedule.coachId, seatNumber: seatNo },
        });

        if (!seatObj) {
          const rowIdx = seatNo.charCodeAt(0) - 64;
          const colIdx = parseInt(seatNo.substring(1), 10) || 1;
          seatObj = await tx.seat.create({
            data: {
              coachId: schedule.coachId,
              seatNumber: seatNo,
              row: isNaN(rowIdx) ? 1 : rowIdx,
              column: isNaN(colIdx) ? 1 : colIdx,
              seatType: 'REGULAR',
              status: 'AVAILABLE',
            },
          });
        }

        const passenger = await tx.passenger.create({
          data: {
            bookingId: booking.id,
            seatId: seatObj.id,
            name: dto.passengerName,
            phone: dto.passengerPhone,
            email: dto.passengerEmail || null,
            gender: dto.gender || 'OTHER',
          },
        });

        await tx.bookingSeat.create({
          data: {
            bookingId: booking.id,
            seatId: seatObj.id,
            passengerId: passenger.id,
            amount: farePerSeat,
          },
        });

        const ticketNumber = 'TKD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await tx.ticket.create({
          data: {
            bookingId: booking.id,
            passengerId: passenger.id,
            ticketNumber,
            qrToken: crypto.randomUUID(),
            status: 'ACTIVE',
          },
        });
      }

      const finalRemainingBulk = Math.max(0, totalAvailable - seatCount);
      return { booking, remainingBulkQuantity: finalRemainingBulk };
    });

    // 2-Tier Agent Referral Commission:
    // If agent was registered using another agent's referral code, referrer gets ৳200 PER ticket sold!
    const referredByCode = (agent as any).referredByCode;
    if (referredByCode) {
      try {
        const referrer = await this.prisma.user.findFirst({
          where: { referralCode: referredByCode },
        });

        if (referrer) {
          const referralCommissionAmount = 200 * seatCount;
          await (this.prisma as any).counterAgentCommission.create({
            data: {
              companyId,
              agentId: referrer.id, // Referrer receives ৳200 / ticket sold
              triggerBookingId: result.booking.id,
              totalCommission: referralCommissionAmount,
              agentShare: referralCommissionAmount,
              totalAgents: 1,
              status: 'PENDING',
              notes: `Referral Commission: Agent ${agent.firstName} (${agent.phone}) sold ${seatCount} ticket(s)`,
            },
          });
        }
      } catch (err) {
        console.error('Referral commission processing error:', err);
      }
    }

    return {
      success: true,
      message: `Successfully sold ${seatCount} ticket(s) from bulk balance!`,
      bookingRef: result.booking.bookingRef,
      bookingId: result.booking.id,
      remainingBulkQuantity: result.remainingBulkQuantity,
    };
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
    try {
      let agent: any = null;
      try {
        agent = await this.prisma.user.findUnique({
          where: { id: agentId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            referralCode: true,
          },
        });

        if (agent && !agent.referralCode) {
          const genCode = `AG-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          agent = await this.prisma.user.update({
            where: { id: agentId },
            data: { referralCode: genCode },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              referralCode: true,
            },
          });
        }
      } catch (e) {
        // Fallback if database migration for referralCode column is still pending
        agent = await this.prisma.user.findUnique({
          where: { id: agentId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        });
      }

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
        where: { agentId },
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

      // Automatically transition held commissions whose departure date has arrived (safe execution)
      try {
        await this.settleDepartureCommissions(companyId);
      } catch (e) {
        console.error('settleDepartureCommissions notice:', e);
      }

      let commissions: any[] = [];
      try {
        commissions = await (this.prisma as any).counterAgentCommission.findMany({
          where: { agentId },
        });
      } catch (e) {
        console.error('commissions query notice:', e);
      }

      // Referred stats
      let referredCount = 0;
      let referralEarnings = 0;
      try {
        if (agent?.referralCode) {
          referredCount = await this.prisma.user.count({
            where: { referredByCode: agent.referralCode },
          });
          const referralCommissions = commissions.filter((c: any) =>
            c.notes?.includes('Referral Commission'),
          );
          referralEarnings = referralCommissions.reduce(
            (sum: number, c: any) => sum + Number(c.agentShare || 0),
            0,
          );
        }
      } catch (e) {
        console.error('referral stats notice:', e);
      }

      // Only count finalized commissions (PENDING or PAID) after departure date cutoff
      const totalEarned = commissions
        .filter((c: any) => c.status === 'PENDING' || c.status === 'PAID')
        .reduce((s: number, c: any) => s + Number(c.agentShare || 0), 0);
      const commissionCap = bulkOrders
        .filter((o) => (o as any).commissionEligible)
        .reduce((s, o) => s + Number((o as any).commissionCap || 0), 0);
      const commissionEarnedOnOrders = bulkOrders.reduce(
        (s, o) => s + Number((o as any).commissionEarned || 0),
        0,
      );
      const remainingCapacity = Math.max(0, commissionCap - commissionEarnedOnOrders);

      return {
        agent: { ...agent, assignedCounterId: (agentFull as any)?.assignedCounterId },
        counter,
        totalTicketsBought,
        totalTicketsRemaining,
        ticketsSold: Math.max(0, totalTicketsBought - totalTicketsRemaining),
        totalInvested,
        referredCount,
        referralEarnings,
        commissionStats: {
          totalEarned,
          commissionCap,
          remainingCapacity,
          capReached: remainingCapacity <= 0 && commissionCap > 0,
          recentCommissions: commissions.slice(0, 5),
        },
        bulkOrders,
      };
    } catch (err) {
      console.error('getDashboardStats error:', err);
      return {
        agent: { id: agentId, firstName: 'Agent', lastName: '', email: '' },
        counter: null,
        totalTicketsBought: 0,
        totalTicketsRemaining: 0,
        totalInvested: 0,
        commissionStats: {
          totalEarned: 0,
          commissionCap: 0,
          remainingCapacity: 0,
          capReached: false,
          recentCommissions: [],
        },
        bulkOrders: [],
      };
    }
  }

  // ─── MY BULK ORDERS ──────────────────────────────────────────────────────────

  async getMyBulkOrders(agentId: string, companyId: string) {
    try {
      return await this.prisma.bulkTicketOrder.findMany({
        where: { agentId },
        include: {
          route: { select: { origin: true, destination: true } },
          counter: { select: { name: true, location: true } },
        } as any,
        orderBy: { createdAt: 'desc' },
      });
    } catch (e) {
      console.error('getMyBulkOrders error:', e);
      return [];
    }
  }

  // ─── MY COMMISSIONS ──────────────────────────────────────────────────────────

  async getMyCommissions(agentId: string, companyId: string) {
    try {
      await this.settleDepartureCommissions(companyId);
    } catch (e) {
      console.error('settleDepartureCommissions error in getMyCommissions:', e);
    }

    try {
      return await (this.prisma as any).counterAgentCommission.findMany({
        where: { agentId },
        include: {
          triggerBooking: {
            select: { bookingRef: true, totalAmount: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (e) {
      console.error('getMyCommissions error:', e);
      return [];
    }
  }

  // ─── MY SOLD TICKETS ─────────────────────────────────────────────────────────

  async getMySoldTickets(agentId: string, companyId?: string) {
    try {
      const where: any = { userId: agentId };
      if (companyId) {
        where.companyId = companyId;
      }
      return await this.prisma.booking.findMany({
        where,
        include: {
          schedule: {
            include: {
              route: { select: { origin: true, destination: true } },
              coach: { select: { name: true, coachNumber: true, coachType: true } },
            },
          },
          passengers: true,
          bookingSeats: { include: { seat: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (e) {
      console.error('getMySoldTickets error:', e);
      return [];
    }
  }

  // ─── AVAILABLE COUNTERS ───────────────────────────────────────────────────────

  async getAvailableCounters(companyId: string) {
    try {
      const counters = await this.prisma.counter.findMany({
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
    } catch (e) {
      console.error('getAvailableCounters error:', e);
      return [];
    }
  }

  // ─── ALLOWED ROUTES (Dhaka ↔ Cox's Bazar) ───────────────────────────────────

  async getAllowedRoutes(companyId: string) {
    try {
      const routes = await this.prisma.route.findMany({
        select: { id: true, origin: true, destination: true },
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
    } catch (e) {
      console.error('getAllowedRoutes error:', e);
      return [];
    }
  }

  // ─── DISTRIBUTE COMMISSION (called by BookingsService on CONFIRMED) ──────────

  async distributeCommission(
    bookingId: string,
    companyId: string,
    counterId: string | null,
  ) {
    try {
      // 1. Fetch booking to get schedule & departure date
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: { schedule: true },
      });
      if (!booking) return;

      const targetCounterId = counterId || booking.counterId || null;

      // 2. Fetch all active bulk orders with remaining commission capacity
      const allEligibleOrders = await this.prisma.bulkTicketOrder.findMany({
        where: { status: 'ACTIVE', commissionEligible: true } as any,
        include: { agent: { select: { id: true, assignedCounterId: true } } },
      });

      // Filter to agents whose primary assigned counter matches the booking counter (if specified)
      let eligibleOrders = allEligibleOrders;
      if (targetCounterId) {
        const counterMatchedOrders = allEligibleOrders.filter(
          (order: any) => order.agent?.assignedCounterId === targetCounterId,
        );
        if (counterMatchedOrders.length > 0) {
          eligibleOrders = counterMatchedOrders;
        }
      }

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

      // Determine if departure date has arrived or is today (Asia/Dhaka)
      const nowBstStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
      const depBstStr = booking.schedule?.departureDate
        ? new Date(booking.schedule.departureDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
        : nowBstStr;

      const isSameDayOrPast = nowBstStr >= depBstStr;
      const initialStatus = isSameDayOrPast ? 'PENDING' : 'HELD_UNTIL_DEPARTURE';

      for (const agentId of eligibleAgentIds) {
        // Prevent duplicate commission for same booking + agent
        const existing = await (this.prisma as any).counterAgentCommission.findFirst({
          where: { triggerBookingId: bookingId, agentId },
        });

        if (!existing) {
          await (this.prisma as any).counterAgentCommission.create({
            data: {
              companyId: booking.companyId || companyId || '00000000-0000-4000-a000-000000000001',
              agentId,
              triggerBookingId: bookingId,
              totalCommission: COMMISSION_PER_BOOKING,
              agentShare: sharePerAgent,
              totalAgents: n,
              status: initialStatus,
            },
          });

          // If departure date has arrived (same day), immediately credit commissionEarned on BulkOrder
          if (isSameDayOrPast) {
            const agentOrders = agentMap.get(agentId) || [];
            let remainingToAdd = sharePerAgent;
            for (const order of agentOrders) {
              if (remainingToAdd <= 0) break;
              const cap = Number((order as any).commissionCap);
              const earned = Number((order as any).commissionEarned);
              const available = cap - earned;
              const toAdd = Math.min(remainingToAdd, available);

              await this.prisma.bulkTicketOrder.update({
                where: { id: order.id },
                data: {
                  commissionEarned: { increment: toAdd },
                  status: earned + toAdd >= cap ? 'EXHAUSTED' : 'ACTIVE',
                } as any,
              });
              remainingToAdd -= toAdd;
            }
          }
        }
      }
    } catch (err) {
      console.error('Error distributing counter agent commission:', err);
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

  async deleteBulkOrder(orderId: string, companyId: string) {
    const order = await this.prisma.bulkTicketOrder.findFirst({
      where: { id: orderId, companyId },
    });
    if (!order) throw new NotFoundException('Bulk order not found.');

    await this.prisma.bulkTicketOrder.delete({
      where: { id: orderId },
    });

    return { message: 'Bulk ticket order deleted successfully.' };
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
        where: { role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] } },
      });
      for (const admin of admins) {
        await this.prisma.notification.create({
          data: {
            companyId: admin.companyId || companyId || '00000000-0000-4000-a000-000000000001',
            userId: admin.id,
            type: 'GENERAL',
            title: '📜 KYC Verification Submitted',
            body: `Counter Agent ${user.firstName} ${user.lastName} (${user.phone || user.email}) has submitted NID KYC Verification for approval.`,
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

  // ─── GET ACTIVE SCHEDULES FOR AGENT SELLING ───────────────────────────

  async getActiveSchedules(companyId?: string) {
    const bdNowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
    const bdDate = new Date(bdNowStr);
    const bdTodayStr = `${bdDate.getFullYear()}-${(bdDate.getMonth() + 1).toString().padStart(2, '0')}-${bdDate.getDate().toString().padStart(2, '0')}`;
    const startOfToday = new Date(`${bdTodayStr}T00:00:00.000Z`);

    const currentHH = bdDate.getHours().toString().padStart(2, '0');
    const currentMM = bdDate.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHH}:${currentMM}`;

    const where: any = {
      status: 'ACTIVE',
      departureDate: { gte: startOfToday },
      route: {
        status: 'ACTIVE',
      },
    };

    if (companyId) {
      where.OR = [
        { companyId },
        { companyId: '00000000-0000-4000-a000-000000000001' },
      ];
    }

    const schedules = await this.prisma.schedule.findMany({
      where,
      orderBy: [{ departureDate: 'asc' }, { departureTime: 'asc' }],
      include: {
        coach: {
          include: { coachType: true },
        },
        route: true,
      },
      take: 500,
    });

    const routeIds = Array.from(new Set(schedules.map((s) => s.routeId)));
    const fares = await this.prisma.fare.findMany({
      where: {
        routeId: { in: routeIds },
        isActive: true,
      },
    });

    const to24Hour = (timeStr: string): string => {
      if (!timeStr) return '00:00';
      const str = timeStr.trim();
      if (/^\d{1,2}:\d{2}$/.test(str)) {
        const [h, m] = str.split(':');
        return `${h.padStart(2, '0')}:${m}`;
      }
      const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (match) {
        let h = parseInt(match[1], 10);
        const m = match[2];
        const ampm = match[3].toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return `${h.toString().padStart(2, '0')}:${m}`;
      }
      return str;
    };

    return schedules
      .map((schedule) => {
        const coachTypeId = schedule.coach?.coachTypeId;
        const matchingFare =
          fares.find(
            (f) =>
              f.routeId === schedule.routeId &&
              coachTypeId &&
              f.coachTypeId === coachTypeId,
          ) ||
          fares.find((f) => f.routeId === schedule.routeId && !f.coachTypeId) ||
          fares.find((f) => f.routeId === schedule.routeId);

        const fare = matchingFare ? Number(matchingFare.baseAmount) : 2000;
        const dateStr = schedule.departureDate.toISOString().split('T')[0];

        return {
          id: schedule.id,
          departureTime: schedule.departureTime,
          departureDate: dateStr,
          arrivalTime: schedule.arrivalTime || '03:00 PM',
          coach: {
            id: schedule.coach?.id,
            name: schedule.coach?.name || 'Arabian Express Hino AC 01',
            coachNumber: schedule.coach?.coachNumber || 'BUS-101',
            coachType:
              (schedule.coach as any)?.coachType?.name ||
              (schedule.coach as any)?.coachType?.category ||
              'AC Executive',
          },
          route: {
            id: schedule.route?.id,
            origin: schedule.route?.origin || 'Dhaka',
            destination: schedule.route?.destination || "Cox's Bazar",
          },
          fare,
        };
      })
      .filter((s) => {
        // Exclude buses today that have already departed (compare BDT time)
        if (s.departureDate === bdTodayStr) {
          const dep24 = to24Hour(s.departureTime);
          if (dep24 < currentTimeStr) {
            return false;
          }
        }
        return true;
      });
  }
}

