import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCmsPageDto {
  @ApiProperty() @IsString() slug: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsString() metaTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() metaDesc?: string;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

@Injectable()
export class CmsService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateCmsPageDto) {
    return this.prisma.cmsPage.create({ data: { companyId, ...dto } });
  }

  async findAll(companyId: string) {
    return this.prisma.cmsPage.findMany({
      where: { companyId },
      orderBy: { slug: 'asc' },
    });
  }

  async findBySlug(slug: string, companyId: string) {
    const page = await this.prisma.cmsPage.findFirst({
      where: { slug, companyId, isPublished: true },
    });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  async findOne(id: string, companyId: string) {
    const page = await this.prisma.cmsPage.findFirst({
      where: { id, companyId },
    });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  async update(id: string, companyId: string, dto: Partial<CreateCmsPageDto>) {
    await this.findOne(id, companyId);
    return this.prisma.cmsPage.update({ where: { id }, data: dto });
  }
}
