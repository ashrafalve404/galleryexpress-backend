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
      id: '00000000-0000-4000-a000-000000000001',
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

  await prisma.user.upsert({
    where: { email: 'abc@abctravels.com' },
    update: { phone: '+8801800000000' },
    create: {
      companyId: company.id,
      email: 'abc@abctravels.com',
      firstName: 'ABC Travels',
      lastName: 'Agent',
      phone: '+8801800000000',
      passwordHash: agentHash,
      role: UserRole.COUNTER_AGENT,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Admin & Counter Agent (ABC Travels) users active');

  // 3. Coach Types
  const acCoachType = await prisma.coachType.upsert({
    where: { id: '00000000-0000-4000-a000-000000000001' },
    update: { name: 'AC Executive' },
    create: {
      id: '00000000-0000-4000-a000-000000000001',
      companyId: company.id,
      name: 'AC Executive',
      description: 'Air conditioned premium executive coach',
    },
  });

  const nonAcCoachType = await prisma.coachType.upsert({
    where: { id: '00000000-0000-4000-a000-000000000002' },
    update: { name: 'Non-AC Deluxe' },
    create: {
      id: '00000000-0000-4000-a000-000000000002',
      companyId: company.id,
      name: 'Non-AC Deluxe',
      description: 'Comfortable non-AC deluxe coach',
    },
  });

  const vipCoachType = await prisma.coachType.upsert({
    where: { id: '00000000-0000-4000-a000-000000000003' },
    update: { name: 'VIP Sleeper' },
    create: {
      id: '00000000-0000-4000-a000-000000000003',
      companyId: company.id,
      name: 'VIP Sleeper',
      description: 'Luxury VIP business sleeper coach',
    },
  });
  console.log('✅ Coach types created');

  // 4. Seat Layout (1+2 Double Deck, 30 seats total: L1..L15, U1..U15)
  const layoutDoubleDeck1x2Config = [
    // Lower Deck (15 Seats: L1..L15)
    { label: 'L1', row: 1, column: 1, deck: 'LOWER' },
    { label: 'L2', row: 1, column: 2, deck: 'LOWER' },
    { label: 'L3', row: 1, column: 3, deck: 'LOWER' },

    { label: 'L4', row: 2, column: 1, deck: 'LOWER' },
    { label: 'L5', row: 2, column: 2, deck: 'LOWER' },
    { label: 'L6', row: 2, column: 3, deck: 'LOWER' },

    { label: 'L7', row: 3, column: 1, deck: 'LOWER' },
    { label: 'L8', row: 3, column: 2, deck: 'LOWER' },
    { label: 'L9', row: 3, column: 3, deck: 'LOWER' },

    { label: 'L10', row: 4, column: 1, deck: 'LOWER' },
    { label: 'L11', row: 4, column: 2, deck: 'LOWER' },
    { label: 'L12', row: 4, column: 3, deck: 'LOWER' },

    { label: 'L13', row: 5, column: 1, deck: 'LOWER' },
    { label: 'L14', row: 5, column: 2, deck: 'LOWER' },
    { label: 'L15', row: 5, column: 3, deck: 'LOWER' },

    // Upper Deck (15 Seats: U1..U15)
    { label: 'U1', row: 1, column: 1, deck: 'UPPER' },
    { label: 'U2', row: 1, column: 2, deck: 'UPPER' },
    { label: 'U3', row: 1, column: 3, deck: 'UPPER' },

    { label: 'U4', row: 2, column: 1, deck: 'UPPER' },
    { label: 'U5', row: 2, column: 2, deck: 'UPPER' },
    { label: 'U6', row: 2, column: 3, deck: 'UPPER' },

    { label: 'U7', row: 3, column: 1, deck: 'UPPER' },
    { label: 'U8', row: 3, column: 2, deck: 'UPPER' },
    { label: 'U9', row: 3, column: 3, deck: 'UPPER' },

    { label: 'U10', row: 4, column: 1, deck: 'UPPER' },
    { label: 'U11', row: 4, column: 2, deck: 'UPPER' },
    { label: 'U12', row: 4, column: 3, deck: 'UPPER' },

    { label: 'U13', row: 5, column: 1, deck: 'UPPER' },
    { label: 'U14', row: 5, column: 2, deck: 'UPPER' },
    { label: 'U15', row: 5, column: 3, deck: 'UPPER' },
  ];

  const seatLayout = await prisma.seatLayout.upsert({
    where: { id: '00000000-0000-4000-a000-000000000010' },
    update: {
      name: '1+2 Double Deck (30 seats)',
      rows: 5,
      columns: 3,
      layoutConfig: layoutDoubleDeck1x2Config,
    },
    create: {
      id: '00000000-0000-4000-a000-000000000010',
      companyId: company.id,
      name: '1+2 Double Deck (30 seats)',
      rows: 5,
      columns: 3,
      layoutConfig: layoutDoubleDeck1x2Config,
      description: 'Double deck 1+2 seating arrangement (15 Lower, 15 Upper)',
    },
  });

  // 5. Coaches — All AC Double Deck 30-Seat Fleet
  const coachesData = [
    { num: 'GE-AC-01', reg: 'DHAKA-METRO-BA-11-1001', name: 'Gallery Express Scania AC 01', typeId: acCoachType.id, isAC: true },
    { num: 'GE-AC-02', reg: 'DHAKA-METRO-BA-11-1002', name: 'Gallery Express Scania AC 02', typeId: acCoachType.id, isAC: true },
    { num: 'GE-AC-03', reg: 'DHAKA-METRO-BA-11-1003', name: 'Gallery Express Volvo AC 03',  typeId: acCoachType.id, isAC: true },
    { num: 'GE-AC-04', reg: 'DHAKA-METRO-BA-11-1004', name: 'Gallery Express Hyundai AC 04', typeId: acCoachType.id, isAC: true },
    { num: 'GE-AC-05', reg: 'DHAKA-METRO-BA-11-1005', name: 'Gallery Express Scania AC 05', typeId: acCoachType.id, isAC: true },
  ];

  const createdCoaches = [];
  for (const c of coachesData) {
    const coach = await prisma.coach.upsert({
      where: { registrationNumber: c.reg },
      update: { coachTypeId: c.typeId, totalSeats: 30, name: c.name, isAC: true },
      create: {
        companyId: company.id,
        coachTypeId: c.typeId,
        seatLayoutId: seatLayout.id,
        name: c.name,
        coachNumber: c.num,
        registrationNumber: c.reg,
        isAC: c.isAC,
        totalSeats: 30,
        status: CoachStatus.ACTIVE,
        description: 'Luxury double deck intercity coach equipped with WiFi and charging ports',
      },
    });
    createdCoaches.push(coach);

    // Create or update 30 seats (15 Lower + 15 Upper)
    for (const item of layoutDoubleDeck1x2Config) {
      const existingSeat = await prisma.seat.findFirst({
        where: { coachId: coach.id, seatNumber: item.label },
      });
      if (existingSeat) {
        await prisma.seat.update({
          where: { id: existingSeat.id },
          data: { row: item.row, column: item.column, position: item.column === 1 || item.column === 3 ? 'window' : 'aisle' },
        });
      } else {
        await prisma.seat.create({
          data: {
            coachId: coach.id,
            seatNumber: item.label,
            row: item.row,
            column: item.column,
            position: item.column === 1 || item.column === 3 ? 'window' : 'aisle',
            seatType: SeatType.REGULAR,
            status: 'AVAILABLE',
          },
        });
      }
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

  // 7. Fares — per route AC Business Class
  const fareEffective = new Date('2026-01-01');
  const faresConfig = [
    // Dhaka ↔ Cox's Bazar: 2000 TK
    { routeId: createdRoutes[0].id, coachTypeId: acCoachType.id, base: 2000 },
    { routeId: createdRoutes[1].id, coachTypeId: acCoachType.id, base: 2000 },
    // Dhaka ↔ Chittagong: 1200 TK
    { routeId: createdRoutes[2].id, coachTypeId: acCoachType.id, base: 1200 },
    { routeId: createdRoutes[3].id, coachTypeId: acCoachType.id, base: 1200 },
    // Chittagong ↔ Cox's Bazar: 800 TK
    { routeId: createdRoutes[4].id, coachTypeId: acCoachType.id, base: 800 },
    { routeId: createdRoutes[5].id, coachTypeId: acCoachType.id, base: 800 },
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
    // Dhaka → Cox's Bazar (5 daily buses including night coach)
    { routeIdx: 0, coachIdx: 0, depTime: '07:00' },
    { routeIdx: 0, coachIdx: 2, depTime: '10:00' },
    { routeIdx: 0, coachIdx: 3, depTime: '15:30' },
    { routeIdx: 0, coachIdx: 4, depTime: '21:00' },
    { routeIdx: 0, coachIdx: 1, depTime: '23:30' },
    // Cox's Bazar → Dhaka (4 daily buses)
    { routeIdx: 1, coachIdx: 0, depTime: '07:00' },
    { routeIdx: 1, coachIdx: 3, depTime: '14:00' },
    { routeIdx: 1, coachIdx: 4, depTime: '22:00' },
    { routeIdx: 1, coachIdx: 2, depTime: '23:45' },
    // Dhaka → Chittagong (4 daily buses including night coach)
    { routeIdx: 2, coachIdx: 1, depTime: '08:00' },
    { routeIdx: 2, coachIdx: 2, depTime: '14:00' },
    { routeIdx: 2, coachIdx: 4, depTime: '20:00' },
    { routeIdx: 2, coachIdx: 0, depTime: '23:30' },
    // Chittagong → Dhaka (3 daily)
    { routeIdx: 3, coachIdx: 1, depTime: '07:30' },
    { routeIdx: 3, coachIdx: 3, depTime: '15:00' },
    { routeIdx: 3, coachIdx: 4, depTime: '23:15' },
    // Chittagong → Cox's Bazar (2 daily)
    { routeIdx: 4, coachIdx: 2, depTime: '09:00' },
    { routeIdx: 4, coachIdx: 3, depTime: '16:00' },
    // Cox's Bazar → Chittagong (2 daily)
    { routeIdx: 5, coachIdx: 2, depTime: '08:00' },
    { routeIdx: 5, coachIdx: 4, depTime: '15:00' },
  ];

  let scheduleCounter = 100;
  const now = new Date();
  for (let dayOffset = 0; dayOffset <= 10; dayOffset++) {
    const d = new Date(now.getTime() + dayOffset * 86400000);
    const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

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

  // 10. Promotional Offers (1:1 aspect ratio posters)
  const sampleOffers = [
    {
      id: '00000000-0000-4000-a000-000000000080',
      title: "Cox's Bazar Beach Getaway",
      subtitle: "Flat 15% instant discount on all AC Business Class tickets to Cox's Bazar",
      tag: 'EID SPECIAL',
      imageUrl: '/dest-coxsbazar.png',
      ctaText: 'Book Ticket',
      ctaUrl: "/search?from=Dhaka&to=Cox's+Bazar",
      discountCode: 'COX15',
      orderIndex: 1,
    },
    {
      id: '00000000-0000-4000-a000-000000000081',
      title: 'Chittagong Express Saver',
      subtitle: 'Save ৳200 on return journey bookings between Dhaka and Chittagong',
      tag: 'POPULAR DEAL',
      imageUrl: '/dest-chittagong.png',
      ctaText: 'Claim Offer',
      ctaUrl: '/search?from=Dhaka&to=Chittagong',
      discountCode: 'CTG200',
      orderIndex: 2,
    },
    {
      id: '00000000-0000-4000-a000-000000000082',
      title: 'bKash Online Cashback',
      subtitle: 'Get up to 20% instant cashback when paying with bKash online payment gateway',
      tag: 'CASHBACK',
      imageUrl: '/dest-sylhet.png',
      ctaText: 'Pay & Save',
      ctaUrl: '/search?from=Dhaka&to=Cox%27s+Bazar',
      discountCode: 'BKASH20',
      orderIndex: 3,
    },
    {
      id: '00000000-0000-4000-a000-000000000083',
      title: 'Early Bird Weekend Travel',
      subtitle: 'Book 3 days in advance and get premium window seat priority with extra reward points',
      tag: 'LIMITED TIME',
      imageUrl: '/dest-comilla.png',
      ctaText: 'Explore Offer',
      ctaUrl: '/search?from=Chittagong&to=Cox%27s+Bazar',
      discountCode: 'EARLY2026',
      orderIndex: 4,
    },
  ];

  for (const offer of sampleOffers) {
    await (prisma as any).offer.upsert({
      where: { id: offer.id },
      update: { title: offer.title, subtitle: offer.subtitle, imageUrl: offer.imageUrl, ctaUrl: offer.ctaUrl },
      create: {
        id: offer.id,
        companyId: company.id,
        title: offer.title,
        subtitle: offer.subtitle,
        tag: offer.tag,
        imageUrl: offer.imageUrl,
        ctaText: offer.ctaText,
        ctaUrl: offer.ctaUrl,
        discountCode: offer.discountCode,
        orderIndex: offer.orderIndex,
        status: 'ACTIVE',
      },
    });
  }
  console.log('✅ Promotional Offers seeded (4 posters)');

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
