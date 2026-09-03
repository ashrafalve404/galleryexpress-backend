import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaginationDto,
  getPaginationParams,
  paginatedResponse,
} from '../common/utils/pagination.util';
import { UserRole, UserStatus, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await argon2.hash(dto.password);
    return this.prisma.user.create({
      data: {
        companyId,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        role: dto.role ?? UserRole.STAFF,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async findAll(
    companyId: string,
    query: PaginationDto & { role?: UserRole; status?: UserStatus },
  ) {
    const { skip, take } = getPaginationParams(query);
    const where: Prisma.UserWhereInput = {
      companyId,
      ...(query.role && { role: query.role }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
        ],
      }),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy || 'createdAt']: query.sort || 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginatedResponse(users, total, query.page || 1, query.limit || 20);
  }

  async findOne(id: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, companyId: string, dto: UpdateUserDto) {
    await this.findOne(id, companyId);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
      },
    });
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        lastLoginAt: true,
      },
    });
  }

  async remove(id: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.$transaction(async (tx) => {
      // 1. Delete associated agent commissions and bulk ticket orders if counter agent
      await (tx as any).counterAgentCommission?.deleteMany({
        where: { OR: [{ agentId: id }, { triggerBookingId: id }] },
      });
      await (tx as any).bulkTicketOrder?.deleteMany({ where: { agentId: id } });

      // 2. Delete user sessions, refresh tokens, audit logs, notifications
      await (tx as any).userSession?.deleteMany({ where: { userId: id } });
      await (tx as any).refreshToken?.deleteMany({ where: { userId: id } });
      await (tx as any).notification?.deleteMany({ where: { userId: id } });
      await (tx as any).auditLog?.deleteMany({ where: { userId: id } });

      // 3. Delete user
      return tx.user.delete({ where: { id } });
    });
  }
}
