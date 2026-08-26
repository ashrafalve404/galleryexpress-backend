import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsString, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOfferDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiProperty() @IsString() imageUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ctaText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ctaUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() discountCode?: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() orderIndex?: number;
  @ApiPropertyOptional({ default: 'ACTIVE' }) @IsOptional() @IsString() status?: 'ACTIVE' | 'INACTIVE';
}

@Injectable()
export class OffersService {
  constructor(private prisma: PrismaService) {}

  private get offerModel() {
    return (this.prisma as any).offer;
  }

  async create(companyId: string, dto: CreateOfferDto) {
    return this.offerModel.create({
      data: {
        companyId,
        title: dto.title,
        subtitle: dto.subtitle,
        tag: dto.tag,
        imageUrl: dto.imageUrl,
        ctaText: dto.ctaText || 'Book Now',
        ctaUrl: dto.ctaUrl,
        discountCode: dto.discountCode,
        orderIndex: dto.orderIndex ?? 0,
        status: dto.status || 'ACTIVE',
      },
    });
  }

  async findAll(companyId?: string, activeOnly = false) {
    return this.offerModel.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        ...(activeOnly ? { status: 'ACTIVE' } : {}),
      },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async findOne(id: string, companyId?: string) {
    const offer = await this.offerModel.findFirst({
      where: { id, ...(companyId ? { companyId } : {}) },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }

  async update(id: string, companyId: string, dto: Partial<CreateOfferDto>) {
    await this.findOne(id, companyId);
    return this.offerModel.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.offerModel.delete({ where: { id } });
    return { message: 'Offer deleted' };
  }
}
