import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRouteDto,
  UpdateRouteDto,
  CreateRouteStopDto,
} from './dto/route.dto';
import {
  PaginationDto,
  getPaginationParams,
  paginatedResponse,
} from '../common/utils/pagination.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class RoutesService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateRouteDto) {
    return this.prisma.route.create({
      data: {
        companyId,
        origin: dto.origin,
        destination: dto.destination,
        distanceKm: dto.distanceKm,
        durationMins: dto.durationMins,
        status: dto.status ?? 'ACTIVE',
        stops: dto.stops
          ? {
              create: dto.stops.map((stop) => ({
                locationName: stop.locationName,
                sequence: stop.sequence,
                arrivalOffset: stop.arrivalOffset,
                departureOffset: stop.departureOffset,
                boardingAllowed: stop.boardingAllowed ?? true,
                droppingAllowed: stop.droppingAllowed ?? true,
              })),
            }
          : undefined,
      },
      include: { stops: { orderBy: { sequence: 'asc' } } },
    });
  }

  async findAll(companyId: string, query: PaginationDto) {
    const { skip, take } = getPaginationParams(query);

    const where: Prisma.RouteWhereInput = {
      companyId,
      ...(query.search && {
        OR: [
          { origin: { contains: query.search, mode: 'insensitive' } },
          { destination: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [routes, total] = await this.prisma.$transaction([
      this.prisma.route.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy || 'createdAt']: query.sort || 'desc' },
        include: {
          stops: { orderBy: { sequence: 'asc' } },
          _count: { select: { schedules: true } },
        },
      }),
      this.prisma.route.count({ where }),
    ]);

    return paginatedResponse(routes, total, query.page || 1, query.limit || 20);
  }

  async findOne(id: string, companyId: string) {
    const route = await this.prisma.route.findFirst({
      where: { id, companyId },
      include: {
        stops: { orderBy: { sequence: 'asc' } },
        fares: {
          where: { isActive: true },
          include: { coachType: true, fromStop: true, toStop: true },
        },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  async update(id: string, companyId: string, dto: UpdateRouteDto) {
    await this.findOne(id, companyId);
    return this.prisma.route.update({
      where: { id },
      data: dto,
      include: { stops: { orderBy: { sequence: 'asc' } } },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.route.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
    return { message: 'Route deactivated successfully' };
  }

  async addStop(routeId: string, companyId: string, dto: CreateRouteStopDto) {
    await this.findOne(routeId, companyId);
    return this.prisma.routeStop.create({
      data: {
        routeId,
        ...dto,
        boardingAllowed: dto.boardingAllowed ?? true,
        droppingAllowed: dto.droppingAllowed ?? true,
      },
    });
  }

  async updateStop(
    routeId: string,
    stopId: string,
    companyId: string,
    dto: Partial<CreateRouteStopDto>,
  ) {
    await this.findOne(routeId, companyId);
    return this.prisma.routeStop.update({ where: { id: stopId }, data: dto });
  }

  async removeStop(routeId: string, stopId: string, companyId: string) {
    await this.findOne(routeId, companyId);
    await this.prisma.routeStop.delete({ where: { id: stopId } });
    return { message: 'Stop removed' };
  }

  // Public API: search routes
  async searchRoutes(companyId: string, origin?: string, destination?: string) {
    return this.prisma.route.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        ...(origin && { origin: { contains: origin, mode: 'insensitive' } }),
        ...(destination && {
          destination: { contains: destination, mode: 'insensitive' },
        }),
      },
      include: { stops: { orderBy: { sequence: 'asc' } } },
    });
  }
}
