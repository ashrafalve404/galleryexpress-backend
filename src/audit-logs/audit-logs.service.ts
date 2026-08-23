import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaginationDto,
  getPaginationParams,
  paginatedResponse,
} from '../common/utils/pagination.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async log(
    companyId: string,
    userId: string,
    action: string,
    entity: string,
    entityId?: string,
    metadata?: object,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.prisma.auditLog.create({
      data: {
        companyId,
        userId,
        action,
        entity,
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
        ipAddress,
        userAgent,
      },
    });
  }

  async findAll(
    companyId: string,
    query: PaginationDto & { entity?: string; userId?: string },
  ) {
    const { skip, take } = getPaginationParams(query);
    const where: Prisma.AuditLogWhereInput = {
      companyId,
      ...(query.entity && { entity: query.entity }),
      ...(query.userId && { userId: query.userId }),
    };

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginatedResponse(logs, total, query.page || 1, query.limit || 20);
  }
}
