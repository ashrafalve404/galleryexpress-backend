-- AlterTable
ALTER TABLE "counter_agent_commissions" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "counter_agent_commissions" ALTER COLUMN "triggerBookingId" DROP NOT NULL;
