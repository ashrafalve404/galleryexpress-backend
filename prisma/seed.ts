import { PrismaClient, UserRole, CoachStatus, SeatType, RouteStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/gallery_express?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting seed...');

  // ================================================
  // 1. Create Company: Gallery Express
  // ================================================
  const company = await prisma.company.upsert({
    where: { slug: 'gallery-express' },
    update: {},
    create: {
      name: 'Gallery Express',
      slug: 'gallery-express',
      email: 'info@galleryexpress.com',
      phone: '+880 1700-000000',
      address: 'Dhaka, Bangladesh',
      website: 'https://galleryexpress.com',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Company: ${company.name} (${company.id})`);

  // Store company ID as env for registrations
  process.env.DEFAULT_COMPANY_ID = company.id;

  // ================================================
  // 2. Create Super Admin
  // ================================================
  const adminPasswordHash = await argon2.hash('Admin@123456');
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@galleryexpress.com' },
    update: {},
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
  console.log(`✅ Super Admin: ${superAdmin.email}`);

  // Counter agent
  const agentHash = await argon2.hash('Agent@123456');
  const counterAgent = await prisma.user.upsert({
    where: { email: 'agent@galleryexpress.com' },
    update: {},
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

  // ================================================
  // 3. Coach Types
  // ================================================
  const acCoachType = await prisma.coachType.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      companyId: company.id,
      name: 'AC Sleeper',
      description: 'Air conditioned sleeper coach',
    },
  });

  const nonAcCoachType = await prisma.coachType.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      companyId: company.id,
      name: 'Non-AC Standard',
      description: 'Standard non-AC coach',
    },
  });
  console.log('✅ Coach types created');

  // ================================================
  // 4. Seat Layout: 2+2 arrangement (10 rows = 40 seats)
  // ================================================
  const layout2x2Config = [];
  const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 4; col++) {
      const label = `${rowLabels[row]}${col + 1}`;
      layout2x2Config.push({
        row: row + 1,
        column: col + 1,
        seatType: SeatType.REGULAR,
        label,
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
  console.log('✅ Seat layout created');

  // ================================================
  // 5. Coaches
  // ================================================
  const coach1 = await prisma.coach.upsert({
    where: { registrationNumber: 'DHAKA-AC-001' },
    update: {},
    create: {
      companyId: company.id,
      coachTypeId: acCoachType.id,
      seatLayoutId: seatLayout.id,
      name: 'Gallery Express AC 01',
      coachNumber: 'GE-AC-01',
      registrationNumber: 'DHAKA-AC-001',
      isAC: true,
      totalSeats: 40,
      status: CoachStatus.ACTIVE,
      description: 'Premium AC coach Dhaka-Chittagong route',
    },
  });

  // Generate seats for coach 1
  const existingSeats = await prisma.seat.count({ where: { coachId: coach1.id } });
  if (existingSeats === 0) {
    await prisma.seat.createMany({
      data: (layout2x2Config as Array<{ row: number; column: number; seatType: SeatType; label: string }>).map((cell) => ({
        coachId: coach1.id,
        seatNumber: cell.label,
        row: cell.row,
        column: cell.column,
        seatType: cell.seatType,
        status: 'AVAILABLE',
      })),
    });
  }

  const coach2 = await prisma.coach.upsert({
    where: { registrationNumber: 'DHAKA-NON-001' },
    update: {},
    create: {
      companyId: company.id,
      coachTypeId: nonAcCoachType.id,
      seatLayoutId: seatLayout.id,
      name: 'Gallery Express Standard 01',
      coachNumber: 'GE-STD-01',
      registrationNumber: 'DHAKA-NON-001',
      isAC: false,
      totalSeats: 40,
      status: CoachStatus.ACTIVE,
    },
  });

  const existingSeats2 = await prisma.seat.count({ where: { coachId: coach2.id } });
  if (existingSeats2 === 0) {
    await prisma.seat.createMany({
      data: (layout2x2Config as Array<{ row: number; column: number; seatType: SeatType; label: string }>).map((cell) => ({
        coachId: coach2.id,
        seatNumber: cell.label,
        row: cell.row,
        column: cell.column,
        seatType: cell.seatType,
        status: 'AVAILABLE',
      })),
    });
  }
  console.log('✅ Coaches created with seats');

  // ================================================
  // 6. Routes: Dhaka → Chittagong via stops
  // ================================================
  const route1 = await prisma.route.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      companyId: company.id,
      origin: 'Dhaka',
      destination: 'Chittagong',
      distanceKm: 264,
      durationMins: 270,
      status: RouteStatus.ACTIVE,
    },
  });

  // Route stops
  const existingStops = await prisma.routeStop.count({ where: { routeId: route1.id } });
  if (existingStops === 0) {
    await prisma.routeStop.createMany({
      data: [
        { routeId: route1.id, locationName: 'Dhaka (Sayedabad)', sequence: 1, arrivalOffset: 0, departureOffset: 0, boardingAllowed: true, droppingAllowed: false },
        { routeId: route1.id, locationName: 'Comilla', sequence: 2, arrivalOffset: 90, departureOffset: 95, boardingAllowed: true, droppingAllowed: true },
        { routeId: route1.id, locationName: 'Feni', sequence: 3, arrivalOffset: 150, departureOffset: 155, boardingAllowed: true, droppingAllowed: true },
        { routeId: route1.id, locationName: 'Chittagong (Dampara)', sequence: 4, arrivalOffset: 270, departureOffset: 270, boardingAllowed: false, droppingAllowed: true },
      ],
    });
  }

  // Route 2: Dhaka → Cox's Bazar
  const route2 = await prisma.route.upsert({
    where: { id: '00000000-0000-0000-0000-000000000021' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000021',
      companyId: company.id,
      origin: 'Dhaka',
      destination: "Cox's Bazar",
      distanceKm: 414,
      durationMins: 480,
      status: RouteStatus.ACTIVE,
    },
  });
  console.log('✅ Routes created');

  // ================================================
  // 7. Fares
  // ================================================
  const fareEffective = new Date('2026-01-01');

  await prisma.fare.upsert({
    where: { id: '00000000-0000-0000-0000-000000000030' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000030',
      companyId: company.id,
      routeId: route1.id,
      coachTypeId: acCoachType.id,
      baseAmount: 900,
      effectiveFrom: fareEffective,
      isActive: true,
    },
  });

  await prisma.fare.upsert({
    where: { id: '00000000-0000-0000-0000-000000000031' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000031',
      companyId: company.id,
      routeId: route1.id,
      coachTypeId: nonAcCoachType.id,
      baseAmount: 600,
      effectiveFrom: fareEffective,
      isActive: true,
    },
  });

  await prisma.fare.upsert({
    where: { id: '00000000-0000-0000-0000-000000000032' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000032',
      companyId: company.id,
      routeId: route2.id,
      coachTypeId: acCoachType.id,
      baseAmount: 1200,
      effectiveFrom: fareEffective,
      isActive: true,
    },
  });
  console.log('✅ Fares created');

  // ================================================
  // 8. Sample Schedules
  // ================================================
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  await prisma.schedule.upsert({
    where: { id: '00000000-0000-0000-0000-000000000040' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000040',
      companyId: company.id,
      coachId: coach1.id,
      routeId: route1.id,
      departureDate: tomorrow,
      departureTime: '22:30',
      arrivalTime: '06:00',
      isRecurring: false,
      status: 'ACTIVE',
      notes: 'Night service',
    },
  });

  await prisma.schedule.upsert({
    where: { id: '00000000-0000-0000-0000-000000000041' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000041',
      companyId: company.id,
      coachId: coach2.id,
      routeId: route1.id,
      departureDate: tomorrow,
      departureTime: '08:00',
      arrivalTime: '12:30',
      isRecurring: false,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Schedules created');

  // ================================================
  // 9. Counter
  // ================================================
  const counter = await prisma.counter.upsert({
    where: { id: '00000000-0000-0000-0000-000000000050' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000050',
      companyId: company.id,
      name: 'Dhaka Main Counter',
      location: 'Sayedabad, Dhaka',
      phone: '+880 1700-000010',
      status: 'ACTIVE',
    },
  });

  await prisma.counterUser.upsert({
    where: { counterId_userId: { counterId: counter.id, userId: counterAgent.id } },
    update: {},
    create: { counterId: counter.id, userId: counterAgent.id },
  });
  console.log('✅ Counter created');

  // ================================================
  // 10. Cancellation Policies
  // ================================================
  await prisma.cancellationPolicy.upsert({
    where: { id: '00000000-0000-0000-0000-000000000060' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000060',
      companyId: company.id,
      name: 'Standard Policy (>24h)',
      hoursBeforeDeparture: 24,
      chargePercentage: 10,
      isDefault: true,
      isActive: true,
    },
  });

  await prisma.cancellationPolicy.upsert({
    where: { id: '00000000-0000-0000-0000-000000000061' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000061',
      companyId: company.id,
      name: 'Last Minute (<6h)',
      hoursBeforeDeparture: 6,
      chargePercentage: 50,
      isDefault: false,
      isActive: true,
    },
  });
  console.log('✅ Cancellation policies created');

  // ================================================
  // 11. CMS Pages
  // ================================================
  const cmsPages = [
    { slug: 'about', title: 'About Gallery Express', content: '<h1>About Gallery Express</h1><p>Gallery Express is a leading bus transportation company...</p>' },
    { slug: 'terms', title: 'Terms & Conditions', content: '<h1>Terms & Conditions</h1><p>By booking with Gallery Express...</p>' },
    { slug: 'privacy', title: 'Privacy Policy', content: '<h1>Privacy Policy</h1><p>Gallery Express is committed to protecting your privacy...</p>' },
    { slug: 'cancellation-policy', title: 'Cancellation Policy', content: '<h1>Cancellation Policy</h1><p>You may cancel your ticket up to 6 hours before departure...</p>' },
    { slug: 'faq', title: 'Frequently Asked Questions', content: '<h1>FAQ</h1><p>Find answers to common questions...</p>' },
  ];

  for (const page of cmsPages) {
    await prisma.cmsPage.upsert({
      where: { companyId_slug: { companyId: company.id, slug: page.slug } },
      update: {},
      create: { companyId: company.id, ...page, isPublished: true },
    });
  }
  console.log('✅ CMS pages created');

  // ================================================
  // 12. Sample Slider
  // ================================================
  await prisma.slider.upsert({
    where: { id: '00000000-0000-0000-0000-000000000070' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000070',
      companyId: company.id,
      imageUrl: 'https://galleryexpress.com/images/hero-banner.jpg',
      title: 'Travel in Comfort',
      subtitle: 'Book your bus ticket online - Fast, Easy, Secure',
      ctaText: 'Book Now',
      ctaUrl: '/search',
      orderIndex: 1,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Slider created');

  // ================================================
  // 13. Sample Discount
  // ================================================
  await prisma.discount.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      companyId: company.id,
      code: 'WELCOME10',
      description: '10% off for first-time customers',
      type: 'PERCENTAGE',
      value: 10,
      minAmount: 500,
      maxUses: 1000,
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-12-31'),
      isActive: true,
    },
  });
  console.log('✅ Sample discount created');

  // ================================================
  // 14. System Settings
  // ================================================
  const settings = [
    { key: 'company_name', value: 'Gallery Express', label: 'Company Name' },
    { key: 'booking_hold_minutes', value: '5', label: 'Seat hold duration (minutes)' },
    { key: 'support_phone', value: '+880 1700-000000', label: 'Support Phone' },
    { key: 'support_email', value: 'support@galleryexpress.com', label: 'Support Email' },
    { key: 'currency', value: 'BDT', label: 'Currency' },
    { key: 'timezone', value: 'Asia/Dhaka', label: 'Timezone' },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { companyId_key: { companyId: company.id, key: setting.key } },
      update: {},
      create: { companyId: company.id, ...setting, type: 'STRING' },
    });
  }
  console.log('✅ System settings created');

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Login Credentials:');
  console.log('   Super Admin: admin@galleryexpress.com / Admin@123456');
  console.log('   Counter Agent: agent@galleryexpress.com / Agent@123456');
  console.log(`\n🏢 Company ID: ${company.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
