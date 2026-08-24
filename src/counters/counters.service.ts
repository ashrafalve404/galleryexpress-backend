import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCounterDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

@Injectable()
export class CountersService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateCounterDto) {
    return this.prisma.counter.create({ data: { companyId, ...dto } });
  }

  async findAll(companyId?: string) {
    return this.prisma.counter.findMany({
      where: companyId ? { companyId, status: 'ACTIVE' } : { status: 'ACTIVE' },
      include: {
        counterUsers: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        _count: { select: { bookings: true } },
      },
    });
  }

  async findOne(id: string, companyId: string) {
    const counter = await this.prisma.counter.findFirst({
      where: { id, companyId },
      include: {
        counterUsers: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });
    if (!counter) throw new NotFoundException('Counter not found');
    return counter;
  }

  async update(id: string, companyId: string, dto: Partial<CreateCounterDto>) {
    await this.findOne(id, companyId);
    return this.prisma.counter.update({ where: { id }, data: dto });
  }

  async assignUser(counterId: string, userId: string, companyId: string) {
    await this.findOne(counterId, companyId);
    return this.prisma.counterUser.upsert({
      where: { counterId_userId: { counterId, userId } },
      create: { counterId, userId },
      update: {},
    });
  }

  async removeUser(counterId: string, userId: string, companyId: string) {
    await this.findOne(counterId, companyId);
    await this.prisma.counterUser.delete({
      where: { counterId_userId: { counterId, userId } },
    });
    return { message: 'User removed from counter' };
  }
}
