import 'server-only'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'

/**
 * Port dari app/Services/ApprovalChainService.php.
 *
 * Approval WAJIB mengikuti rantai atasan langsung PIC naik sampai ketemu
 * pemberi (assigner). Self-assign → chain kosong (bypass). Cross-divisi →
 * chain sampai atasan tertinggi PIC, lalu assigner di-append sebagai final.
 *
 * Source of truth: tabel assignment_approval_entries.
 */
type Client = Prisma.TransactionClient | typeof prisma

const MAX_DEPTH = 10

export const CHAIN_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  RETURNED: 'RETURNED',
  REJECTED: 'REJECTED',
} as const

export type ChainEntry = {
  userId: number
  role: string
  name: string
  positionTitle: string | null
  order: number
  status: string
}

function buildEntry(
  user: { id: number; name: string; roleType: string | null; positionTitle: string | null },
  order: number,
): ChainEntry {
  return {
    userId: user.id,
    role: user.roleType ?? '',
    name: user.name,
    positionTitle: user.positionTitle,
    order,
    status: CHAIN_STATUS.PENDING,
  }
}

/** Bangun chain TANPA persist. */
export async function resolveChain(assigneeId: number, assignerId: number): Promise<ChainEntry[]> {
  if (assigneeId === assignerId) return [] // self-assign: bypass

  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { id: true, name: true, roleType: true, positionTitle: true, managerUserId: true },
  })
  const assigner = await prisma.user.findUnique({
    where: { id: assignerId },
    select: { id: true, name: true, roleType: true, positionTitle: true },
  })

  if (!assignee || !assigner) {
    return assigner ? [buildEntry(assigner, 0)] : []
  }

  const chain: ChainEntry[] = []
  const visited = new Set<number>([assignee.id])
  let currentManagerId = assignee.managerUserId
  let order = 0

  while (currentManagerId && !visited.has(currentManagerId) && order < MAX_DEPTH) {
    const manager = await prisma.user.findUnique({
      where: { id: currentManagerId },
      select: { id: true, name: true, roleType: true, positionTitle: true, managerUserId: true },
    })
    if (!manager) break

    visited.add(manager.id)
    chain.push(buildEntry(manager, order++))

    if (manager.id === assigner.id) break
    currentManagerId = manager.managerUserId
  }

  if (!chain.some((e) => e.userId === assigner.id)) {
    chain.push(buildEntry(assigner, order))
  }

  return chain
}

/** Persist chain ke tabel normalisasi (replace). */
export async function persistChain(
  client: Client,
  assignmentId: number,
  entries: ChainEntry[],
): Promise<void> {
  await client.assignmentApprovalEntry.deleteMany({ where: { assignmentId } })
  if (entries.length === 0) return
  await client.assignmentApprovalEntry.createMany({
    data: entries.map((e) => ({
      assignmentId,
      userId: e.userId,
      role: e.role,
      name: e.name,
      positionTitle: e.positionTitle,
      order: e.order,
      status: e.status ?? CHAIN_STATUS.PENDING,
    })),
  })
}

/** Reset semua entry ke PENDING (saat SUBMIT setelah RETURN, atau REOPEN). */
export async function resetForResubmit(client: Client, assignmentId: number): Promise<void> {
  await client.assignmentApprovalEntry.updateMany({
    where: { assignmentId },
    data: { status: CHAIN_STATUS.PENDING, actedAt: null, note: null },
  })
}

export async function markEntry(
  client: Client,
  assignmentId: number,
  order: number,
  status: string,
  note: string | null,
  actedAt: Date,
): Promise<void> {
  await client.assignmentApprovalEntry.updateMany({
    where: { assignmentId, order },
    data: { status, note, actedAt },
  })
}

export async function getCurrentReviewerUserId(
  assignmentId: number,
  currentIdx: number | null,
  client: Client = prisma,
): Promise<number | null> {
  if (currentIdx === null) return null
  const entry = await client.assignmentApprovalEntry.findFirst({
    where: { assignmentId, order: currentIdx },
    select: { userId: true },
  })
  return entry?.userId ?? null
}

export async function isCurrentReviewer(
  assignmentId: number,
  currentIdx: number | null,
  userId: number,
  client: Client = prisma,
): Promise<boolean> {
  const rid = await getCurrentReviewerUserId(assignmentId, currentIdx, client)
  return rid !== null && rid === userId
}

export async function chainSize(assignmentId: number, client: Client = prisma): Promise<number> {
  return client.assignmentApprovalEntry.count({ where: { assignmentId } })
}
