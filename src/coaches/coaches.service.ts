import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCoachDto, UpdateCoachDto } from './dto/coach.dto';
import {
  PaginationDto,
  getPaginationParams,
  paginatedResponse,
} from '../common/utils/pagination.util';
import { CoachStatus, Prisma } from '@prisma/client';

@Injectable()
export class CoachesService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateCoachDto) {
    // Check registration number uniqueness
    const existing = await this.prisma.coach.findFirst({
      where: { registrationNumber: dto.registrationNumber },
    });
    if (existing) {
      throw new ConflictException(
        'Coach with this registration number already exists',
      );
    }

    const coach = await this.prisma.coach.create({
      data: {
        companyId,
        name: dto.name,
        coachNumber: dto.coachNumber,
        registrationNumber: dto.registrationNumber,
        coachTypeId: dto.coachTypeId,
        seatLayoutId: dto.seatLayoutId,
        isAC: dto.isAC ?? false,
        totalSeats: dto.totalSeats,
        status: dto.status ?? CoachStatus.ACTIVE,
        description: dto.description,
      },
      include: {
        coachType: true,
        seatLayout: true,
        _count: { select: { seats: true } },
      },
    });

    return coach;
  }

  async findAll(
    companyId: string,
    query: PaginationDto & { status?: CoachStatus },
  ) {
    const { skip, take } = getPaginationParams(query);

    const where: Prisma.CoachWhereInput = {
      companyId,
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { coachNumber: { contains: query.search, mode: 'insensitive' } },
          {
            registrationNumber: { contains: query.search, mode: 'insensitive' },
          },
        ],
      }),
    };

    const [coaches, total] = await this.prisma.$transaction([
      this.prisma.coach.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy || 'createdAt']: query.sort || 'desc' },
        include: {
          coachType: true,
          seatLayout: { select: { id: true, name: true } },
          _count: { select: { seats: true } },
        },
      }),
      this.prisma.coach.count({ where }),
    ]);

    return paginatedResponse(
      coaches,
      total,
      query.page || 1,
      query.limit || 20,
    );
  }

  async findOne(id: string, companyId: string) {
    const coach = await this.prisma.coach.findFirst({
      where: { id, companyId },
      include: {
        coachType: true,
        seatLayout: true,
        seats: {
          orderBy: [{ row: 'asc' }, { column: 'asc' }],
        },
      },
    });

    if (!coach) throw new NotFoundException('Coach not found');
    return coach;
  }

  async update(id: string, companyId: string, dto: UpdateCoachDto) {
    await this.findOne(id, companyId);

    if (dto.registrationNumber) {
      const existing = await this.prisma.coach.findFirst({
        where: { registrationNumber: dto.registrationNumber, NOT: { id } },
      });
      if (existing)
        throw new ConflictException('Registration number already in use');
    }

    return this.prisma.coach.update({
      where: { id },
      data: dto,
      include: { coachType: true, seatLayout: true },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.coach.update({
      where: { id },
      data: { status: CoachStatus.INACTIVE },
    });
    return { message: 'Coach deactivated successfully' };
  }

  // Coach Types
  async createCoachType(companyId: string, name: string, description?: string) {
    return this.prisma.coachType.create({
      data: { companyId, name, description },
    });
  }

  async findAllCoachTypes(companyId: string) {
    return this.prisma.coachType.findMany({
      where: { companyId },
      include: { _count: { select: { coaches: true } } },
    });
  }

  // Seat Layouts
  async createSeatLayout(
    companyId: string,
    name: string,
    rows: number,
    columns: number,
    layoutConfig: object,
    description?: string,
  ) {
    return this.prisma.seatLayout.create({
      data: { companyId, name, rows, columns, layoutConfig, description },
    });
  }

  async findAllSeatLayouts(companyId: string) {
    return this.prisma.seatLayout.findMany({ where: { companyId } });
  }

  async generateSeatsForCoach(
    coachId: string,
    seatLayoutId: string,
    companyId: string,
  ) {
    await this.findOne(coachId, companyId);
    const layout = await this.prisma.seatLayout.findFirst({
      where: { id: seatLayoutId, companyId },
    });

    if (!layout) throw new NotFoundException('Seat layout not found');

    const layoutConfig = layout.layoutConfig as Array<{
      row: number;
      column: number;
      seatType: string;
      label: string;
    }>;

    // Delete existing seats and recreate
    await this.prisma.seat.deleteMany({ where: { coachId } });

    const seats = await this.prisma.seat.createMany({
      data: layoutConfig.map((cell) => ({
        coachId,
        seatNumber: cell.label,
        row: cell.row,
        column: cell.column,
        seatType: cell.seatType as never,
        status: 'AVAILABLE',
      })),
    });

    // Update coach with layout and seat count
    await this.prisma.coach.update({
      where: { id: coachId },
      data: { seatLayoutId, totalSeats: layoutConfig.length },
    });

    return { created: seats.count, message: 'Seats generated successfully' };
  }
}
