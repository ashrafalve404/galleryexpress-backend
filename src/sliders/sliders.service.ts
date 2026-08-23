import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsString, IsOptional, IsInt, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSliderDto {
  @ApiProperty() @IsString() imageUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ctaText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ctaUrl?: string;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  orderIndex?: number;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

@Injectable()
export class SlidersService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateSliderDto) {
    return this.prisma.slider.create({ data: { companyId, ...dto } });
  }

  async findAll(companyId: string, activeOnly = false) {
    return this.prisma.slider.findMany({
      where: { companyId, ...(activeOnly && { status: 'ACTIVE' }) },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const slider = await this.prisma.slider.findFirst({
      where: { id, companyId },
    });
    if (!slider) throw new NotFoundException('Slider not found');
    return slider;
  }

  async update(id: string, companyId: string, dto: Partial<CreateSliderDto>) {
    await this.findOne(id, companyId);
    return this.prisma.slider.update({ where: { id }, data: dto });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.slider.delete({ where: { id } });
    return { message: 'Slider deleted' };
  }
}
