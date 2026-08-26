import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:password@postgres:5432/gallery_express?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Show ALL Chittagong→Dhaka schedules in DB
  const all = await prisma.schedule.findMany({
    where: {
      route: { origin: { contains: 'Chittagong', mode: 'insensitive' }, destination: { contains: 'Dhaka', mode: 'insensitive' } },
    },
    include: { route: true },
    orderBy: [{ departureDate: 'asc' }, { departureTime: 'asc' }],
  });
  console.log(`\nTotal Chittagong→Dhaka schedules in DB: ${all.length}`);
  for (const s of all) {
    console.log(`  ${s.departureDate.toISOString().split('T')[0]} | ${s.departureTime} | status=${s.status}`);
  }

  // 2. Now simulate the search for today 2026-08-26
  const dateStr = '2026-08-26';
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
  const startBuffer = new Date(startOfDay.getTime() - 14 * 3600 * 1000);
  const endBuffer = new Date(endOfDay.getTime() + 14 * 3600 * 1000);

  console.log(`\nDate range query for ${dateStr}:`);
  console.log(`  startBuffer: ${startBuffer.toISOString()}`);
  console.log(`  endBuffer:   ${endBuffer.toISOString()}`);

  const found = await prisma.schedule.findMany({
    where: {
      status: 'ACTIVE',
      departureDate: { gte: startBuffer, lte: endBuffer },
      route: { origin: { contains: 'Chittagong', mode: 'insensitive' }, destination: { contains: 'Dhaka', mode: 'insensitive' } },
    },
    include: { route: true },
    orderBy: [{ departureDate: 'asc' }, { departureTime: 'asc' }],
  });
  console.log(`\nFound ${found.length} buses with date range filter:`);
  for (const s of found) {
    console.log(`  ${s.departureDate.toISOString()} | depTime=${s.departureTime}`);
  }

  // 3. What does BDT time filter do?
  const bdNowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
  const bdDate = new Date(bdNowStr);
  const currentHH = bdDate.getHours().toString().padStart(2, '0');
  const currentMM = bdDate.getMinutes().toString().padStart(2, '0');
  const currentTimeStr = `${currentHH}:${currentMM}`;
  console.log(`\nCurrent BDT time: ${currentTimeStr}`);
  const afterFilter = found.filter((s) => s.departureTime >= currentTimeStr);
  console.log(`After time filter (>= ${currentTimeStr}): ${afterFilter.length} buses`);
  for (const s of afterFilter) {
    console.log(`  depTime=${s.departureTime}`);
  }
}

main().finally(() => prisma.$disconnect());
