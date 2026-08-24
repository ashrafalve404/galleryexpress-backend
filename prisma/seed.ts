import { PrismaClient, UserRole, CoachStatus, SeatType, RouteStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/gallery_express?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting rich demo seed...');

  // 1. Company
  const company = await prisma.company.upsert({
    where: { slug: 'gallery-express' },
    update: {},
    create: {
      name: 'Gallery Express',
      slug: 'gallery-express',
      email: 'galleryexpresslimited@gmail.com',
      phone: '+8801700000000',
      address: 'Navana Shopping Centre, Gulshan Avenue 01, Gulshan, Dhaka, Bangladesh',
      website: 'https://galleryexpress.com',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Company: ${company.name} (${company.id})`);

  // 2. Super Admin & Counter Agent
  const adminPasswordHash = await argon2.hash('Admin@123456');
  await prisma.user.upsert({
    where: { email: 'admin@galleryexpress.com' },
    update: { phone: '+8801700000001' },
    create: {
      companyId: company.id,
      email: 'admin@galleryexpress.com',
      firstName: 'Super',
      lastName: 'Admin',
      phone: '+8801700000001',
      passwordHash: adminPasswordHash,
      role: UserRole.SUPER_ADMIN,
      status: 'ACTIVE',
    },
  });

  const agentHash = await argon2.hash('Agent@123456');
  await prisma.user.upsert({
    where: { email: 'agent@galleryexpress.com' },
    update: { phone: '+8801700000002' },
    create: {
      companyId: company.id,
      email: 'agent@galleryexpress.com',
      firstName: 'Counter',
      lastName: 'Agent',
      phone: '+8801700000002',
      passwordHash: agentHash,
      role: UserRole.COUNTER_AGENT,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Admin & Counter Agent users active');

  // 3. Coach Types
  const acCoachType = await prisma.coachType.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      companyId: company.id,
      name: 'AC Executive',
      description: 'Air conditioned premium executive coach',
    },
  });

  const nonAcCoachType = await prisma.coachType.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      companyId: company.id,
      name: 'Non-AC Deluxe',
      description: 'Comfortable non-AC deluxe coach',
    },
  });

  const vipCoachType = await prisma.coachType.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      companyId: company.id,
      name: 'VIP Sleeper',
      description: 'Luxury VIP business sleeper coach',
    },
  });
  console.log('✅ Coach types created');

  // 4. Seat Layout (2+2, 40 seats)
  const layout2x2Config = [];
  const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 4; col++) {
      layout2x2Config.push({
        row: row + 1,
        column: col + 1,
        seatType: SeatType.REGULAR,
        label: `${rowLabels[row]}${col + 1}`,
      });
    }
  }

  const seatLayout = await prisma.seatLayout.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      companyId: company.id,
      name: '2+2 Standard (40 seats)',
      rows: 10,
      columns: 4,
      layoutConfig: layout2x2Config,
      description: 'Standard 2+2 seating arrangement',
    },
  });

  // 5. Coaches
  const coachesData = [
    { num: 'GE-AC-01', reg: 'DHAKA-METRO-BA-11-1001', name: 'Gallery Express Scania AC 01', typeId: acCoachType.id, isAC: true },
    { num: 'GE-[#NAC-02]', reg: 'DHAKA-METRO-BA-11-1002', name: 'Gallery Express Hino Non-AC 02', typeId: nonAcCoachType.id, isAC: false },
    { num: 'GE-VIP-03', reg: 'DHAKA-METRO-BA-11-1003', name: 'Gallery Express Volvo VIP 03', typeId: vipCoachType.id, isAC: true },
    { num: 'GE-AC-04', reg: 'DHAKA-METRO-BA-11-1004', name: 'Gallery Express Hyundai AC 04', typeId: acCoachType.id, isAC: true },
    { num: 'GE-AC-05', reg: 'DHAKA-METRO-BA-11-1005', name: 'Gallery Express Scania AC 05', typeId: acCoachType.id, isAC: true },
  ];

  const createdCoaches = [];
  for (const c of coachesData) {
    const coach = await prisma.coach.upsert({
      where: { registrationNumber: c.reg },
      update: {},
      create: {
        companyId: company.id,
        coachTypeId: c.typeId,
        seatLayoutId: seatLayout.id,
        name: c.name,
        coachNumber: c.num,
        registrationNumber: c.reg,
        isAC: c.isAC,
        totalSeats: 40,
        status: CoachStatus.ACTIVE,
        description: 'Luxury intercity coach equipped with WiFi and charging ports',
      },
    });
    createdCoaches.push(coach);

    // Create 40 seats if not existing
    const count = await prisma.seat.count({ where: { coachId: coach.id } });
    if (count === 0) {
      await prisma.seat.createMany({
        data: layout2x2Config.map((item) => ({
          coachId: coach.id,
          seatNumber: item.label,
          row: item.row,
          column: item.column,
          seatType: SeatType.REGULAR,
          status: 'AVAILABLE',
        })),
      });
    }
  }
  console.log('✅ Coaches and seat maps created');

  // 6. Routes
  const routesInfo = [
    { id: '00000000-0000-0000-0000-000000000020', origin: 'Dhaka', dest: 'Chittagong', dist: 264, duration: 300 },
    { id: '00000000-0000-0000-0000-000000000021', origin: 'Chittagong', dest: 'Dhaka', dist: 264, duration: 300 },
    { id: '00000000-0000-0000-0000-000000000022', origin: 'Dhaka', dest: "Cox's Bazar", dist: 414, duration: 480 },
    { id: '00000000-0000-0000-0000-000000000023', origin: "Cox's Bazar", dest: 'Dhaka', dist: 414, duration: 480 },
    { id: '00000000-0000-0000-0000-000000000024', origin: 'Dhaka', dest: 'Sylhet', dist: 240, duration: 360 },
    { id: '00000000-0000-0000-0000-000000000025', origin: 'Sylhet', dest: 'Dhaka', dist: 240, duration: 360 },
    { id: '00000000-0000-0000-0000-000000000026', origin: 'Dhaka', dest: 'Rajshahi', dist: 245, duration: 330 },
    { id: '00000000-0000-0000-0000-000000000027', origin: 'Dhaka', dest: 'Khulna', dist: 270, duration: 390 },
  ];

  const createdRoutes = [];
  for (const r of routesInfo) {
    const route = await prisma.route.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        companyId: company.id,
        origin: r.origin,
        destination: r.dest,
        distanceKm: r.dist,
        durationMins: r.duration,
        status: RouteStatus.ACTIVE,
      },
    });
    createdRoutes.push(route);
  }
  console.log('✅ Routes created');

  // 7. Fares
  const fareEffective = new Date('2026-01-01');
  const faresConfig = [
    { routeId: createdRoutes[0].id, coachTypeId: acCoachType.id, base: 900 },
    { routeId: createdRoutes[0].id, coachTypeId: nonAcCoachType.id, base: 650 },
    { routeId: createdRoutes[0].id, coachTypeId: vipCoachType.id, base: 1200 },
    { routeId: createdRoutes[1].id, coachTypeId: acCoachType.id, base: 900 },
    { routeId: createdRoutes[2].id, coachTypeId: acCoachType.id, base: 1250 },
    { routeId: createdRoutes[2].id, coachTypeId: vipCoachType.id, base: 1600 },
    { routeId: createdRoutes[3].id, coachTypeId: acCoachType.id, base: 1250 },
    { routeId: createdRoutes[4].id, coachTypeId: acCoachType.id, base: 850 },
    { routeId: createdRoutes[5].id, coachTypeId: acCoachType.id, base: 850 },
    { routeId: createdRoutes[6].id, coachTypeId: acCoachType.id, base: 750 },
    { routeId: createdRoutes[7].id, coachTypeId: acCoachType.id, base: 800 },
  ];

  for (let idx = 0; idx < faresConfig.length; idx++) {
    const f = faresConfig[idx];
    await prisma.fare.upsert({
      where: { id: `00000000-0000-0000-0000-0000000000${30 + idx}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0000-0000000000${30 + idx}`,
        companyId: company.id,
        routeId: f.routeId,
        coachTypeId: f.coachTypeId,
        baseAmount: f.base,
        effectiveFrom: fareEffective,
        isActive: true,
      },
    });
  }
  console.log('✅ Fares created');

  // 8. Daily Schedules for Today, Tomorrow, and Next 7 Days
  const departureTimes = ['07:30', '11:00', '15:30', '21:00', '22:45'];

  let scheduleCounter = 100;
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dayOffset);
    targetDate.setHours(0, 0, 0, 0);

    for (let rIdx = 0; rIdx < createdRoutes.length; rIdx++) {
      const route = createdRoutes[rIdx];
      const coach = createdCoaches[rIdx % createdCoaches.length];
      const depTime = departureTimes[rIdx % departureTimes.length];

      const [h, m] = depTime.split(':').map(Number);
      const arrH = (h + 6) % 24;
      const arrTime = `${arrH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

      const scheduleId = `00000000-0000-0000-0000-${scheduleCounter.toString().padStart(12, '0')}`;
      scheduleCounter++;

      await prisma.schedule.upsert({
        where: { id: scheduleId },
        update: { departureDate: targetDate },
        create: {
          id: scheduleId,
          companyId: company.id,
          coachId: coach.id,
          routeId: route.id,
          departureDate: targetDate,
          departureTime: depTime,
          arrivalTime: arrTime,
          isRecurring: false,
          status: 'ACTIVE',
          notes: `Daily express service (${route.origin} to ${route.destination})`,
        },
      });
    }
  }
  console.log(`✅ ${scheduleCounter - 100} Daily Schedules created across Today and Next 7 Days!`);

  // 9. Counters
  await prisma.counter.upsert({
    where: { id: '00000000-0000-0000-0000-000000000080' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000080',
      companyId: company.id,
      name: 'Sayedabad Counter',
      location: 'Sayedabad Bus Terminal, Gate 2, Dhaka',
      phone: '01711002233',
      status: 'ACTIVE',
    },
  });
  console.log('✅ Counter created');

  console.log('\n🎉 Rich seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
