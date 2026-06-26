import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

// Single Prisma client across hot-reloads (dev) and warm lambdas (prod).
// Connection pooling = Supabase TRANSACTION pooler (port 6543) via DATABASE_URL.
// search_path is pinned to the app schema so unqualified queries resolve.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: 'ptpn_kmr_app' },
  )
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
