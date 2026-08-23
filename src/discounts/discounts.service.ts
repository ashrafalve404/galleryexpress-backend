import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDiscountDto {
  @ApiProperty() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: ['PERCENTAGE', 'FIXED'] })
  @IsEnum(['PERCENTAGE', 'FIXED'])
  type: 'PERCENTAGE' | 'FIXED';
  @ApiProperty({ example: '10.00' }) value: string;
  @ApiPropertyOptional({ example: '500.00' }) @IsOptional() minAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxUses?: number;
  @ApiProperty() @IsDateString() validFrom: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validTo?: string;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Injectable()
export class DiscountsService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateDiscountDto) {
    return this.prisma.discount.create({
      data: {
        companyId,
        code: dto.code.toUpperCase(),
        description: dto.description,
        type: dto.type,
        value: new Prisma.Decimal(dto.value),
        minAmount: dto.minAmount ? new Prisma.Decimal(dto.minAmount) : null,
        maxUses: dto.maxUses,
        validFrom: new Date(dto.validFrom),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.discount.findMany({
      where: { companyId },
      include: { _count: { select: { usages: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const d = await this.prisma.discount.findFirst({
      where: { id, companyId },
      include: {
        usages: { include: { booking: { select: { bookingRef: true } } } },
      },
    });
    if (!d) throw new NotFoundException('Discount not found');
    return d;
  }

  async update(id: string, companyId: string, dto: Partial<CreateDiscountDto>) {
    await this.findOne(id, companyId);
    return this.prisma.discount.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.value && { value: new Prisma.Decimal(dto.value) }),
        ...(dto.minAmount && { minAmount: new Prisma.Decimal(dto.minAmount) }),
        ...(dto.maxUses !== undefined && { maxUses: dto.maxUses }),
        ...(dto.validFrom && { validFrom: new Date(dto.validFrom) }),
        ...(dto.validTo && { validTo: new Date(dto.validTo) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async validate(companyId: string, code: string, amount?: number) {
    const discount = await this.prisma.discount.findFirst({
      where: {
        companyId,
        code: code.toUpperCase(),
        isActive: true,
        validFrom: { lte: new Date() },
        OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
      },
    });

    if (!discount) throw new BadRequestException('Invalid or expired coupon');
    if (discount.maxUses && discount.usedCount >= discount.maxUses) {
      throw new BadRequestException('Coupon limit reached');
    }
    if (
      amount &&
      discount.minAmount &&
      new Prisma.Decimal(amount).lessThan(discount.minAmount)
    ) {
      throw new BadRequestException(
        `Minimum amount required: ${discount.minAmount.toString()}`,
      );
    }

    return discount;
  }
}
