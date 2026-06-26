import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: 'ptpn_kmr_app' })
const prisma = new PrismaClient({ adapter })

const users = await prisma.user.count()
const programs = await prisma.program.count()
const sample = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true, name: true, nik: true, userId: true, roleType: true } })
console.log(JSON.stringify({ ok: true, users, programs, sample }, null, 2))
await prisma.$disconnect()
