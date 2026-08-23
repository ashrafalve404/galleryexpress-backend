import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.systemSetting.findMany({ where: { companyId } });
  }

  async get(companyId: string, key: string) {
    return this.prisma.systemSetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
  }

  async upsert(
    companyId: string,
    key: string,
    value: string,
    type = 'STRING',
    label?: string,
  ) {
    return this.prisma.systemSetting.upsert({
      where: { companyId_key: { companyId, key } },
      create: { companyId, key, value, type: type as never, label },
      update: { value, type: type as never, label },
    });
  }

  async bulkUpsert(
    companyId: string,
    settings: Array<{
      key: string;
      value: string;
      type?: string;
      label?: string;
    }>,
  ) {
    return Promise.all(
      settings.map((s) =>
        this.upsert(companyId, s.key, s.value, s.type, s.label),
      ),
    );
  }
}
