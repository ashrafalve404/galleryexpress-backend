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
    where: { id: '00000000-0000-4000-a000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-a000-000000000001',
      companyId: company.id,
      name: 'AC Executive',
      description: 'Air conditioned premium executive coach',
    },
  });

  const nonAcCoachType = await prisma.coachType.upsert({
    where: { id: '00000000-0000-4000-a000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-a000-000000000002',
      companyId: company.id,
      name: 'Non-AC Deluxe',
      description: 'Comfortable non-AC deluxe coach',
    },
  });

  const vipCoachType = await prisma.coachType.upsert({
    where: { id: '00000000-0000-4000-a000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-4000-a000-000000000003',
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
    where: { id: '00000000-0000-4000-a000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-4000-a000-000000000010',
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

  // 6. Routes — Dhaka ↔ Cox's Bazar corridor (no Comilla passenger stop)
  const routesInfo = [
    // Full corridor
    { id: '00000000-0000-4000-a000-000000000020', origin: 'Dhaka',       dest: "Cox's Bazar",  dist: 414, duration: 480 }, // 0
    { id: '00000000-0000-4000-a000-000000000021', origin: "Cox's Bazar", dest: 'Dhaka',         dist: 414, duration: 480 }, // 1
    // Dhaka ↔ Chittagong
    { id: '00000000-0000-4000-a000-000000000022', origin: 'Dhaka',       dest: 'Chittagong',    dist: 264, duration: 300 }, // 2
    { id: '00000000-0000-4000-a000-000000000023', origin: 'Chittagong',  dest: 'Dhaka',         dist: 264, duration: 300 }, // 3
    // Chittagong ↔ Cox's Bazar
    { id: '00000000-0000-4000-a000-000000000026', origin: 'Chittagong',  dest: "Cox's Bazar",   dist: 150, duration: 180 }, // 4
    { id: '00000000-0000-4000-a000-000000000027', origin: "Cox's Bazar", dest: 'Chittagong',    dist: 150, duration: 180 }, // 5
  ];

  const createdRoutes = [];
  for (const r of routesInfo) {
    const route = await prisma.route.upsert({
      where: { id: r.id },
      update: { origin: r.origin, destination: r.dest, distanceKm: r.dist, durationMins: r.duration },
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
  console.log('✅ Routes created (Dhaka–Cox\'s Bazar corridor, no Comilla stop)');

  // 7. Fares — per route per coach type (no Comilla)
  const fareEffective = new Date('2026-01-01');
  const faresConfig = [
    // Dhaka ↔ Cox's Bazar (full route)
    { routeId: createdRoutes[0].id, coachTypeId: acCoachType.id,    base: 1250 },
    { routeId: createdRoutes[0].id, coachTypeId: nonAcCoachType.id, base: 850  },
    { routeId: createdRoutes[0].id, coachTypeId: vipCoachType.id,   base: 1800 },
    { routeId: createdRoutes[1].id, coachTypeId: acCoachType.id,    base: 1250 },
    { routeId: createdRoutes[1].id, coachTypeId: nonAcCoachType.id, base: 850  },
    // Dhaka ↔ Chittagong
    { routeId: createdRoutes[2].id, coachTypeId: acCoachType.id,    base: 900  },
    { routeId: createdRoutes[2].id, coachTypeId: nonAcCoachType.id, base: 650  },
    { routeId: createdRoutes[2].id, coachTypeId: vipCoachType.id,   base: 1200 },
    { routeId: createdRoutes[3].id, coachTypeId: acCoachType.id,    base: 900  },
    { routeId: createdRoutes[3].id, coachTypeId: nonAcCoachType.id, base: 650  },
    // Chittagong ↔ Cox's Bazar
    { routeId: createdRoutes[4].id, coachTypeId: acCoachType.id,    base: 500  },
    { routeId: createdRoutes[4].id, coachTypeId: nonAcCoachType.id, base: 350  },
    { routeId: createdRoutes[5].id, coachTypeId: acCoachType.id,    base: 500  },
    { routeId: createdRoutes[5].id, coachTypeId: nonAcCoachType.id, base: 350  },
  ];

  for (let idx = 0; idx < faresConfig.length; idx++) {
    const f = faresConfig[idx];
    await prisma.fare.upsert({
      where: { id: `00000000-0000-4000-a000-0000000000${(30 + idx).toString().padStart(2, '0')}` },
      update: { baseAmount: f.base },
      create: {
        id: `00000000-0000-4000-a000-0000000000${(30 + idx).toString().padStart(2, '0')}`,
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

  // 8. Daily Schedules — today + next 7 days (no Comilla routes)
  const scheduleMatrix: { routeIdx: number; coachIdx: number; depTime: string }[] = [
    // Dhaka → Cox's Bazar (4 daily buses)
    { routeIdx: 0, coachIdx: 0, depTime: '07:00' },
    { routeIdx: 0, coachIdx: 2, depTime: '10:00' },
    { routeIdx: 0, coachIdx: 3, depTime: '15:30' },
    { routeIdx: 0, coachIdx: 4, depTime: '21:00' },
    // Cox's Bazar → Dhaka (3 daily buses)
    { routeIdx: 1, coachIdx: 0, depTime: '07:00' },
    { routeIdx: 1, coachIdx: 3, depTime: '14:00' },
    { routeIdx: 1, coachIdx: 4, depTime: '22:00' },
    // Dhaka → Chittagong (3 daily)
    { routeIdx: 2, coachIdx: 1, depTime: '08:00' },
    { routeIdx: 2, coachIdx: 2, depTime: '14:00' },
    { routeIdx: 2, coachIdx: 4, depTime: '20:00' },
    // Chittagong → Dhaka (2 daily)
    { routeIdx: 3, coachIdx: 1, depTime: '07:30' },
    { routeIdx: 3, coachIdx: 3, depTime: '15:00' },
    // Chittagong → Cox's Bazar (2 daily)
    { routeIdx: 4, coachIdx: 2, depTime: '09:00' },
    { routeIdx: 4, coachIdx: 3, depTime: '16:00' },
    // Cox's Bazar → Chittagong (2 daily)
    { routeIdx: 5, coachIdx: 2, depTime: '08:00' },
    { routeIdx: 5, coachIdx: 4, depTime: '15:00' },
  ];

  let scheduleCounter = 100;
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dayOffset);
    targetDate.setHours(0, 0, 0, 0);

    for (const s of scheduleMatrix) {
      const route = createdRoutes[s.routeIdx];
      const coach = createdCoaches[s.coachIdx];
      const [h, m] = s.depTime.split(':').map(Number);
      const durMins = route.durationMins ?? 480;
      const arrivalTotalMins = h * 60 + m + durMins;
      const arrH = Math.floor(arrivalTotalMins / 60) % 24;
      const arrM = arrivalTotalMins % 60;
      const arrTime = `${arrH.toString().padStart(2, '0')}:${arrM.toString().padStart(2, '0')}`;

      const scheduleId = `00000000-0000-4000-a000-${scheduleCounter.toString().padStart(12, '0')}`;
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
          departureTime: s.depTime,
          arrivalTime: arrTime,
          isRecurring: false,
          status: 'ACTIVE',
          notes: `Daily express service (${route.origin} to ${route.destination})`,
        },
      });
    }
  }
  console.log(`✅ ${scheduleCounter - 100} Daily Schedules created across Today and Next 7 Days!`);

  // 9. Counters — 20 Dhaka boarding counters + Chittagong + Cox's Bazar
  const countersData = [
    // ── Dhaka boarding counters (20) ──
    { id: '00000000-0000-4000-a000-000000000080', name: 'Dhaka - Abdullahpur',         location: 'Abdullahpur Bus Stop, Uttara, Dhaka',                  phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000081', name: 'Dhaka - Uttara Azampur',       location: 'Azampur Bus Stop, Uttara, Dhaka',                      phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000082', name: 'Dhaka - Uttara Jasimuddin',    location: 'Jasimuddin Road, Uttara, Dhaka',                       phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000083', name: 'Dhaka - Uttara Airport',       location: 'Airport Road, Uttara, Dhaka',                          phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000084', name: 'Dhaka - Bashundhara',          location: 'Bashundhara R/A Gate, Dhaka-1229',                     phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000085', name: 'Dhaka - Nadda',                location: 'Nadda Bus Stop, Badda, Dhaka',                         phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000086', name: 'Dhaka - Notun Bazar',          location: 'Notun Bazar Bus Stop, Badda, Dhaka',                   phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000087', name: 'Dhaka - Uttar Badda',          location: 'Uttar Badda Bus Stop, Dhaka',                          phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000088', name: 'Dhaka - Moddho Badda',         location: 'Moddho Badda Bus Stop, Dhaka',                         phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000089', name: 'Dhaka - Rampura',              location: 'Rampura Bus Stop, DIT Road, Dhaka',                    phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000090', name: 'Dhaka - Malibagh',             location: 'Malibagh Chowdhurypara, Dhaka',                        phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000091', name: 'Dhaka - Fakirerpool',          location: 'Fakirerpool Bus Stop, Motijheel, Dhaka',               phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000092', name: 'Dhaka - Arambagh',             location: 'Arambagh Bus Stop, Motijheel, Dhaka',                  phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000093', name: 'Dhaka - Sayedabad',            location: 'Sayedabad Bus Terminal, Gate 7, Demra Road, Dhaka-1362', phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000094', name: 'Dhaka - Soniakora',            location: 'Soniakora Bus Stop, Jatrabari, Dhaka',                 phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000095', name: 'Dhaka - Matuail',              location: 'Matuail Bus Stop, Jatrabari, Dhaka',                   phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000096', name: 'Dhaka - Signboard',            location: 'Signboard Bus Stop, Demra, Dhaka',                     phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000097', name: 'Dhaka - Chittagong Road',      location: 'Chittagong Road, Demra, Dhaka',                        phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000098', name: 'Dhaka - Kanchpur',             location: 'Kanchpur Bridge, Narayanganj–Dhaka Highway',           phone: '01826-110036' },
    { id: '00000000-0000-4000-a000-000000000099', name: 'Dhaka - Madanpur',             location: 'Madanpur Bus Stop, Narayanganj, Dhaka Highway',        phone: '01826-110036' },
    // ── Chittagong & Cox's Bazar drop-off ──
    { id: '00000000-0000-4000-a000-000000000100', name: "Chittagong - Dampara",         location: 'Dampara Bus Terminal, Station Road, Chittagong-4000',  phone: '01826-110038' },
    { id: '00000000-0000-4000-a000-000000000101', name: "Cox's Bazar - Kolatoli",       location: "Kolatoli Road, Near Sea Beach, Cox's Bazar-4700",      phone: '01826-110039' },
  ];

  for (const c of countersData) {
    await prisma.counter.upsert({
      where: { id: c.id },
      update: { name: c.name, location: c.location, phone: c.phone },
      create: {
        id: c.id,
        companyId: company.id,
        name: c.name,
        location: c.location,
        phone: c.phone,
        status: 'ACTIVE',
      },
    });
  }
  console.log('✅ Counters created: 20 Dhaka boarding counters + Chittagong + Cox\'s Bazar');

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
