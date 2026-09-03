import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';

export interface AdminNotificationItem {
  id: string;
  type: string;
  category: 'USER_PAYMENT' | 'AGENT_BULK' | 'MESSAGE' | 'SYSTEM';
  title: string;
  body: string;
  link: string;
  createdAt: Date;
  read: boolean;
  meta?: any;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminNotifications(companyId: string) {
    const items: AdminNotificationItem[] = [];

    // 1. Pending User Booking Payments
    const companyFilter = companyId
      ? { OR: [{ companyId }, { companyId: '00000000-0000-4000-a000-000000000001' }] }
      : {};

    const pendingBookings = await this.prisma.booking.findMany({
      where: {
        ...companyFilter,
        status: { in: [BookingStatus.HELD, BookingStatus.PENDING] },
      },
      include: {
        schedule: {
          include: { route: true },
        },
        passengers: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    for (const b of pendingBookings) {
      const passenger = (b.passengers as any[])?.[0];
      const routeStr = b.schedule?.route
        ? `${b.schedule.route.origin} → ${b.schedule.route.destination}`
        : 'Bus Route';

      let detailsStr = `${b.paymentMethod || 'Payment'}: ${b.senderPhone ? 'Phone ' + b.senderPhone : ''} ${b.trxId ? 'TrxID ' + b.trxId : ''}`.trim();
      if (b.paymentNotes) detailsStr += ` (${b.paymentNotes})`;

      items.push({
        id: `booking_${b.id}`,
        type: 'USER_PAYMENT_APPROVAL',
        category: 'USER_PAYMENT',
        title: `Pending Booking Approval #${b.bookingRef}`,
        body: `${passenger?.name || 'Passenger'} (${routeStr}) - Total ৳${b.totalAmount}. ${detailsStr}`,
        link: '/admin/bookings',
        createdAt: b.createdAt,
        read: false,
        meta: {
          bookingId: b.id,
          bookingRef: b.bookingRef,
          amount: b.totalAmount,
          paymentMethod: b.paymentMethod,
          senderPhone: b.senderPhone,
          trxId: b.trxId,
        },
      });
    }

    // 2. Pending Agent Bulk Ticket Orders
    const pendingBulkOrders = await this.prisma.bulkTicketOrder.findMany({
      where: {
        ...companyFilter,
        status: 'PENDING_APPROVAL',
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    for (const bo of pendingBulkOrders) {
      const boAny = bo as any;
      const agentName = boAny.agent?.user?.name || boAny.agent?.agencyName || `Agent #${bo.agentId?.substring(0, 8) || 'Counter'}`;

      items.push({
        id: `bulk_${bo.id}`,
        type: 'AGENT_BULK_APPROVAL',
        category: 'AGENT_BULK',
        title: `Agent Bulk Purchase Approval Needed`,
        body: `${agentName} requested ${bo.quantity} tickets (৳${bo.totalAmount}). ${bo.paymentMethod || 'Mobile'}: TrxID ${bo.trxId || 'N/A'}`,
        link: '/admin/counter-agents',
        createdAt: bo.createdAt,
        read: false,
        meta: {
          orderId: bo.id,
          quantity: bo.quantity,
          amount: bo.totalAmount,
          paymentMethod: bo.paymentMethod,
          trxId: bo.trxId,
        },
      });
    }

    // 3. Pending Counter Agent KYC Verifications
    try {
      const pendingKycAgents = await this.prisma.user.findMany({
        where: {
          role: 'COUNTER_AGENT',
          kycStatus: 'PENDING',
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          nidNumber: true,
          kycSubmittedAt: true,
        },
        orderBy: { kycSubmittedAt: 'desc' },
        take: 30,
      });

      for (const agent of pendingKycAgents) {
        items.push({
          id: `kyc_${agent.id}`,
          type: 'KYC_VERIFICATION_APPROVAL',
          category: 'AGENT_BULK',
          title: `Counter Agent KYC Verification Needed`,
          body: `${agent.firstName} ${agent.lastName} (${agent.phone || agent.email}) submitted NID documents (NID: ${agent.nidNumber || 'N/A'}). Admin review required.`,
          link: '/admin/kyc',
          createdAt: agent.kycSubmittedAt || new Date(),
          read: false,
          meta: {
            agentId: agent.id,
            nidNumber: agent.nidNumber,
          },
        });
      }
    } catch {
      // Ignore if kyc status enum query error
    }

    // 4. New Contact Messages
    try {
      const unreadMessages = await (this.prisma as any).contactMessage.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      for (const msg of unreadMessages) {
        items.push({
          id: `msg_${msg.id}`,
          type: 'CONTACT_MESSAGE',
          category: 'MESSAGE',
          title: `New Message from ${msg.name || msg.email}`,
          body: msg.subject || msg.message?.substring(0, 60) || 'Customer contact message',
          link: '/admin/messages',
          createdAt: msg.createdAt,
          read: false,
        });
      }
    } catch {
      // Ignore if contactMessage table doesn't exist
    }

    // Sort by creation date descending
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalUnread = items.filter((i) => !i.read).length;

    return {
      success: true,
      unreadCount: totalUnread,
      notifications: items,
    };
  }

  async getUserNotifications(userId: string, companyId: string) {
    const items: AdminNotificationItem[] = [];

    const userBookings = await this.prisma.booking.findMany({
      where: { userId },
      include: {
        schedule: {
          include: { route: true },
        },
        tickets: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    for (const b of userBookings) {
      const routeStr = b.schedule?.route
        ? `${b.schedule.route.origin} → ${b.schedule.route.destination}`
        : 'Bus Route';

      if (b.status === BookingStatus.CONFIRMED) {
        items.push({
          id: `user_confirmed_${b.id}`,
          type: 'TICKET_CONFIRMED',
          category: 'USER_PAYMENT',
          title: `Payment Approved - Booking #${b.bookingRef}`,
          body: `Admin verified your payment! Your ticket for ${routeStr} is confirmed. Digital boarding pass ready.`,
          link: b.tickets?.[0]?.ticketNumber ? `/ticket/${b.tickets[0].ticketNumber}` : '/dashboard',
          createdAt: b.confirmedAt || b.updatedAt,
          read: false,
        });
      } else if (b.status === BookingStatus.HELD || b.status === BookingStatus.PENDING) {
        items.push({
          id: `user_pending_${b.id}`,
          type: 'PAYMENT_PENDING',
          category: 'USER_PAYMENT',
          title: `Payment Pending Verification - Booking #${b.bookingRef}`,
          body: `Your payment details for ${routeStr} (৳${b.totalAmount}) have been submitted and are awaiting Admin verification.`,
          link: '/dashboard',
          createdAt: b.updatedAt,
          read: false,
        });
      } else if (b.status === BookingStatus.CANCELLED) {
        items.push({
          id: `user_cancelled_${b.id}`,
          type: 'BOOKING_CANCELLED',
          category: 'USER_PAYMENT',
          title: `Booking #${b.bookingRef} Cancelled`,
          body: `Your booking for ${routeStr} was cancelled/rejected. ${(b as any).rejectionReason || ''}`,
          link: '/dashboard',
          createdAt: b.updatedAt,
          read: false,
        });
      }
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const unreadCount = items.filter((i) => !i.read).length;

    return {
      success: true,
      unreadCount,
      notifications: items,
    };
  }
}
