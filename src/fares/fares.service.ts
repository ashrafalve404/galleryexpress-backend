import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFareDto, UpdateFareDto } from './dto/fare.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class FaresService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateFareDto) {
    return this.prisma.fare.create({
      data: {
        companyId,
        routeId: dto.routeId,
        coachTypeId: dto.coachTypeId,
        fromStopId: dto.fromStopId,
        toStopId: dto.toStopId,
        baseAmount: new Prisma.Decimal(dto.baseAmount),
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        isActive: dto.isActive ?? true,
      },
      include: { route: true, coachType: true, fromStop: true, toStop: true },
    });
  }

  async findAll(companyId: string, routeId?: string) {
    return this.prisma.fare.findMany({
      where: {
        companyId,
        ...(routeId && { routeId }),
      },
      include: { route: true, coachType: true, fromStop: true, toStop: true },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const fare = await this.prisma.fare.findFirst({
      where: { id, companyId },
      include: { route: true, coachType: true, fromStop: true, toStop: true },
    });
    if (!fare) throw new NotFoundException('Fare not found');
    return fare;
  }

  async update(id: string, companyId: string, dto: UpdateFareDto) {
    await this.findOne(id, companyId);
    return this.prisma.fare.update({
      where: { id },
      data: {
        ...(dto.baseAmount && {
          baseAmount: new Prisma.Decimal(dto.baseAmount),
        }),
        ...(dto.effectiveFrom && {
          effectiveFrom: new Date(dto.effectiveFrom),
        }),
        ...(dto.effectiveTo && { effectiveTo: new Date(dto.effectiveTo) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { route: true, coachType: true },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.fare.update({ where: { id }, data: { isActive: false } });
    return { message: 'Fare deactivated' };
  }

  async getActiveFareForSchedule(
    routeId: string,
    coachTypeId: string,
    companyId: string,
    fromStopId?: string,
    toStopId?: string,
  ) {
    const now = new Date();
    // Try to find segment fare first, then fall back to full route fare
    const fare = await this.prisma.fare.findFirst({
      where: {
        companyId,
        routeId,
        coachTypeId,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        ...(fromStopId && toStopId
          ? { fromStopId, toStopId }
          : { fromStopId: null, toStopId: null }),
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!fare && (fromStopId || toStopId)) {
      // Fall back to full route fare
      return this.prisma.fare.findFirst({
        where: {
          companyId,
          routeId,
          coachTypeId,
          isActive: true,
          fromStopId: null,
          toStopId: null,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
    }

    return fare;
  }
}
