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

  private get model() {
    return (this.prisma as any).contactMessage;
  }

  async create(dto: CreateContactMessageDto) {
    return this.model.create({
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
    return this.model.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(id: string) {
    const msg = await this.model.findUnique({ where: { id } });
    if (!msg) throw new NotFoundException('Message not found');

    return this.model.update({
      where: { id },
      data: { status: 'READ' },
    });
  }

  async remove(id: string) {
    const msg = await this.model.findUnique({ where: { id } });
    if (!msg) throw new NotFoundException('Message not found');

    return this.model.delete({ where: { id } });
  }
}
