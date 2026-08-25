import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateContactMessageDto {
  name: string;
  email: string;
  phone?: string;
  message: string;
  companyId?: string;
}

@Injectable()
export class ContactMessagesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateContactMessageDto) {
    return this.prisma.contactMessage.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone || null,
        message: dto.message,
        companyId: dto.companyId || null,
      },
    });
  }

  async findAllAdmin() {
    return this.prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(id: string) {
    const msg = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!msg) throw new NotFoundException('Message not found');

    return this.prisma.contactMessage.update({
      where: { id },
      data: { status: 'READ' },
    });
  }

  async remove(id: string) {
    const msg = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!msg) throw new NotFoundException('Message not found');

    return this.prisma.contactMessage.delete({ where: { id } });
  }
}
