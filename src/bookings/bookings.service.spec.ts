import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../redis/redis.module';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

const mockPrisma = {
  schedule: { findFirst: jest.fn() },
  booking: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  bookingSeat: { findMany: jest.fn() },
  seatLock: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  fare: { findFirst: jest.fn() },
  discount: { findFirst: jest.fn(), update: jest.fn() },
  discountUsage: { create: jest.fn() },
  passenger: { create: jest.fn() },
  ticket: { create: jest.fn(), updateMany: jest.fn() },
  payment: { create: jest.fn() },
  cancellationPolicy: { findFirst: jest.fn() },
  cancellation: { create: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

const mockRedis = {
  pipeline: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  eval: jest.fn(),
};

const mockPipeline = {
  set: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  eval: jest.fn().mockReturnThis(),
};

describe('BookingsService', () => {
  let service: BookingsService;
  const companyId = 'test-company-id';
  const scheduleId = 'test-schedule-id';

  beforeEach(async () => {
    mockRedis.pipeline.mockReturnValue(mockPipeline);
    mockPipeline.exec.mockResolvedValue([
      [null, 'OK'],
      [null, 'OK'],
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'app.seatLockTtl' ? 300 : 'test-secret',
          },
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('lockSeats', () => {
    it('should lock all seats when available', async () => {
      mockRedis.pipeline.mockReturnValue(mockPipeline);
      mockPipeline.exec.mockResolvedValue([
        [null, 'OK'],
        [null, 'OK'],
      ]);
      mockPrisma.seatLock.upsert.mockResolvedValue({});

      const result = await service.lockSeats(
        scheduleId,
        ['seat1', 'seat2'],
        'session-token',
      );

      expect(result.locked).toEqual(['seat1', 'seat2']);
      expect(result.failed).toEqual([]);
    });

    it('should fail all if any seat is already locked', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 'OK'],
        [null, null],
      ]); // second failed

      const result = await service.lockSeats(
        scheduleId,
        ['seat1', 'seat2'],
        'session-token',
      );

      expect(result.locked).toEqual([]);
      expect(result.failed).toEqual(['seat1', 'seat2']);
    });

    it('should fall back to DB when Redis is unavailable', async () => {
      mockPipeline.exec.mockResolvedValue(null);
      mockPrisma.seatLock.upsert.mockResolvedValue({});

      const result = await service.lockSeats(
        scheduleId,
        ['seat1'],
        'session-token',
      );

      expect(result.locked).toEqual(['seat1']);
    });
  });

  describe('createBooking', () => {
    const dto = {
      scheduleId,
      seats: [
        {
          seatId: 'seat-uuid-1',
          passenger: { name: 'John Doe', phone: '+8801700000001' },
        },
      ],
    };

    it('should throw NotFoundException when schedule not found', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      await expect(
        service.createBooking(companyId, dto as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when seats are unavailable', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue({
        id: scheduleId,
        status: 'ACTIVE',
        bookingCloseTime: null,
        coach: { coachTypeId: 'type-id' },
        route: {},
        routeId: 'route-id',
      });

      mockPipeline.exec.mockResolvedValue([[null, null]]); // seat lock fails

      await expect(
        service.createBooking(companyId, dto as never),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when booking window closed', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      mockPrisma.schedule.findFirst.mockResolvedValue({
        id: scheduleId,
        status: 'ACTIVE',
        bookingCloseTime: pastDate,
        coach: { coachTypeId: 'type-id' },
        route: {},
        routeId: 'route-id',
      });

      await expect(
        service.createBooking(companyId, dto as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('expireHeldBookings', () => {
    it('should expire held bookings past their expiry', async () => {
      const pastDate = new Date();
      pastDate.setMinutes(pastDate.getMinutes() - 10);

      mockPrisma.booking.findMany.mockResolvedValue([
        {
          id: 'booking-1',
          bookingRef: 'GE-REF-001',
          scheduleId,
          expiresAt: pastDate,
          bookingSeats: [{ seatId: 'seat-1' }],
        },
      ]);

      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          booking: { update: jest.fn().mockResolvedValue({}) },
          seatLock: { deleteMany: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      mockPrisma.seatLock.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.expireHeldBookings();
      expect(result.expired).toBe(1);
    });

    it('should return 0 when no bookings need expiration', async () => {
      mockPrisma.booking.findMany.mockResolvedValue([]);
      mockPrisma.seatLock.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.expireHeldBookings();
      expect(result.expired).toBe(0);
    });
  });

  describe('cancelBooking', () => {
    it('should throw NotFoundException when booking not found', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelBooking('nonexistent', companyId, {}, 'user-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when booking already cancelled', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        id: 'booking-1',
        status: 'CANCELLED',
        schedule: { departureDate: new Date(), departureTime: '22:00' },
        bookingSeats: [],
        cancellation: null,
      });

      await expect(
        service.cancelBooking('booking-1', companyId, {}, 'user-id'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
