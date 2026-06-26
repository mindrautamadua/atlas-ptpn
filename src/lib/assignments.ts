import 'server-only'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import type { AuthUser } from '@/lib/auth'
import { resolveUserScope } from '@/lib/scope'
import { abort } from '@/lib/http-route'
import { canCreateAssignment, canAssignTo, canSetPrivate } from '@/lib/assignment-auth'
import {
  resolveChain, persistChain, resetForResubmit, markEntry, chainSize, CHAIN_STATUS,
  getCurrentReviewerUserId,
} from '@/lib/approval-chain'

// ── Status state machine ─────────────────────────────────────────────────────
export const STATUS = {
  DITUGASKAN: 'DITUGASKAN',
  DIKERJAKAN: 'DIKERJAKAN',
  IN_REVIEW: 'IN_REVIEW',
  SELESAI: 'SELESAI',
  REJECTED: 'REJECTED',
  DIBATALKAN: 'DIBATALKAN',
} as const
const TERMINAL: string[] = [STATUS.SELESAI, STATUS.REJECTED, STATUS.DIBATALKAN]

const isAdminRole = (role: string | null) => ['superadmin', 'admin'].includes((role ?? '').toLowerCase())
const isTerminal = (status: string) => TERMINAL.includes(status)

// ── Serialization (match shape AssignmentsView.tsx) ──────────────────────────
const ASSIGNMENT_INCLUDE = {
  assigner: { select: { id: true, name: true, positionTitle: true, roleType: true } },
  assignee: { select: { id: true, name: true, positionTitle: true, roleType: true } },
  relatedProgram: { select: { id: true, code: true, name: true } },
  approvalEntries: {
    orderBy: { order: 'asc' as const },
    select: {
      userId: true, role: true, name: true, positionTitle: true,
      order: true, status: true, actedAt: true, note: true,
    },
  },
  _count: { select: { attachmentsList: true } },
} satisfies Prisma.AssignmentInclude

type AssignmentRow = Prisma.AssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>

function serialize(a: AssignmentRow) {
  const { approvalEntries, _count, ...rest } = a
  return {
    ...rest,
    approvalChain: approvalEntries.map((e) => ({
      ...e,
      actedAt: e.actedAt ? e.actedAt.toISOString() : null,
    })),
    _count: { evidenceItems: _count.attachmentsList },
  }
}

function currentReviewerFromEntries(
  entries: AssignmentRow['approvalEntries'],
  idx: number | null,
): number | null {
  if (idx === null) return null
  return entries.find((e) => e.order === idx)?.userId ?? null
}

// ── Visibility (hormat isPrivate) ────────────────────────────────────────────
function canSeeAssignment(a: AssignmentRow, userId: number, isAdmin: boolean): boolean {
  if (!a.isPrivate) return true
  if (isAdmin) return true
  if (a.assigneeId === userId || a.assignerId === userId) return true
  const watchers = Array.isArray(a.watcherIds) ? (a.watcherIds as number[]) : []
  if (watchers.includes(userId)) return true
  return a.approvalEntries.some((e) => e.userId === userId)
}

// ── LIST ─────────────────────────────────────────────────────────────────────
type Filters = { scope?: string; status?: string; priority?: string }

export async function listForUser(user: AuthUser, filters: Filters = {}) {
  const preset = filters.scope ?? 'team'
  const isAdmin = isAdminRole(user.roleType)
  const scope = await resolveUserScope(user)
  const allowedIds = scope.userIds // null = lihat semua

  const where: Prisma.AssignmentWhereInput = {}
  if (preset === 'mine') {
    where.assigneeId = user.id
  } else if (preset === 'given') {
    where.assignerId = user.id
  } else if (preset === 'review') {
    // no scope filter — post-filter ke current reviewer
  } else if (preset === 'all') {
    if (allowedIds !== null) {
      where.OR = [{ assigneeId: { in: allowedIds } }, { assignerId: { in: allowedIds } }]
    }
  } else {
    // team (default)
    if (allowedIds !== null) {
      where.OR = [
        { assigneeId: { in: allowedIds } },
        { assignerId: { in: allowedIds } },
        { assigneeId: user.id },
        { assignerId: user.id },
      ]
    }
  }
  if (filters.status) where.status = filters.status
  if (filters.priority) where.priority = filters.priority

  const rows = await prisma.assignment.findMany({
    where,
    include: ASSIGNMENT_INCLUDE,
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
  })

  const visible = rows.filter((a) => {
    if (!canSeeAssignment(a, user.id, isAdmin)) return false
    if (preset === 'review') {
      return currentReviewerFromEntries(a.approvalEntries, a.currentReviewerIdx) === user.id
    }
    return true
  })

  return visible.map(serialize)
}

export async function findForUser(user: AuthUser, id: number) {
  const a = await prisma.assignment.findUnique({ where: { id }, include: ASSIGNMENT_INCLUDE })
  if (!a) abort(404, 'Assignment not found.')
  if (!canSeeAssignment(a, user.id, isAdminRole(user.roleType))) {
    abort(403, 'You do not have access to this assignment.')
  }
  return serialize(a)
}

// ── CREATE ────────────────────────────────────────────────────────────────────
type CreatePayload = {
  title: string
  description?: string | null
  priority?: string
  dueDate?: string | null
  assigneeId: number
  watcherIds?: number[] | null
  relatedProgramId?: number | null
  tags?: unknown[] | null
  evidenceRequired?: boolean
  isPrivate?: boolean
}

async function nextCode(): Promise<string> {
  const last = await prisma.assignment.findFirst({ orderBy: { id: 'desc' }, select: { code: true } })
  let num = 1
  const m = last?.code.match(/^ASG-(\d+)$/)
  if (m) num = parseInt(m[1], 10) + 1
  return 'ASG-' + String(num).padStart(4, '0')
}

export async function createAssignment(user: AuthUser, payload: CreatePayload) {
  if (!canCreateAssignment(user.roleType)) {
    abort(403, 'Your role is not allowed to create assignments.')
  }
  if (!(await canAssignTo(user, payload.assigneeId))) {
    abort(403, 'You can only assign to direct reports or team members within your unit.')
  }
  if (payload.isPrivate && !canSetPrivate(user.roleType)) {
    abort(403, 'Only BOD or a Division Head can mark an assignment as private.')
  }

  const chain = await resolveChain(payload.assigneeId, user.id)
  const code = await nextCode()

  const created = await prisma.$transaction(async (tx) => {
    const a = await tx.assignment.create({
      data: {
        code,
        title: payload.title,
        description: payload.description ?? null,
        priority: payload.priority ?? 'MEDIUM',
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        assignerId: user.id,
        assigneeId: payload.assigneeId,
        watcherIds: (payload.watcherIds ?? undefined) as Prisma.InputJsonValue | undefined,
        relatedProgramId: payload.relatedProgramId ?? null,
        tags: (payload.tags ?? undefined) as Prisma.InputJsonValue | undefined,
        status: STATUS.DITUGASKAN,
        evidenceRequired: payload.evidenceRequired ?? true,
        isPrivate: payload.isPrivate ?? false,
        currentReviewerIdx: null,
        revisionCount: 0,
      },
    })
    if (chain.length > 0) await persistChain(tx, a.id, chain)
    return a
  })

  return reload(created.id)
}

// ── UPDATE (metadata) ─────────────────────────────────────────────────────────
type UpdatePayload = Partial<{
  title: string
  description: string | null
  priority: string
  dueDate: string | null
  assigneeId: number
  watcherIds: number[] | null
  relatedProgramId: number | null
  tags: unknown[] | null
}>

export async function updateAssignment(user: AuthUser, id: number, payload: UpdatePayload) {
  const existing = await prisma.assignment.findUnique({ where: { id } })
  if (!existing) abort(404, 'Assignment not found.')
  const isAdmin = isAdminRole(user.roleType)
  if (!isAdmin && existing.assignerId !== user.id) {
    abort(403, 'Only the assigner can change assignment metadata.')
  }
  if (isTerminal(existing.status)) {
    abort(400, 'A terminal assignment cannot be edited. Use REOPEN first.')
  }

  const data: Prisma.AssignmentUpdateInput = {}
  if (payload.title !== undefined) data.title = payload.title
  if (payload.description !== undefined) data.description = payload.description
  if (payload.priority !== undefined) data.priority = payload.priority
  if (payload.watcherIds !== undefined) data.watcherIds = (payload.watcherIds ?? undefined) as Prisma.InputJsonValue
  if (payload.tags !== undefined) data.tags = (payload.tags ?? undefined) as Prisma.InputJsonValue
  if (payload.relatedProgramId !== undefined) {
    data.relatedProgram = payload.relatedProgramId
      ? { connect: { id: payload.relatedProgramId } }
      : { disconnect: true }
  }
  if (payload.dueDate !== undefined) data.dueDate = payload.dueDate ? new Date(payload.dueDate) : null

  let newChainFor: number | null = null
  if (
    payload.assigneeId !== undefined
    && payload.assigneeId !== null
    && payload.assigneeId !== existing.assigneeId
  ) {
    if (!(await canAssignTo(user, payload.assigneeId))) {
      abort(403, 'The new assignee is outside your authority.')
    }
    data.assignee = { connect: { id: payload.assigneeId } }
    data.currentReviewerIdx = null
    data.revisionCount = 0
    newChainFor = payload.assigneeId
  }

  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({ where: { id }, data })
    if (newChainFor !== null) {
      const chain = await resolveChain(newChainFor, existing.assignerId)
      await persistChain(tx, id, chain)
    }
  })

  return reload(id)
}

// ── TRANSITION (state machine) ─────────────────────────────────────────────────
const ACTIONS = [
  'ACKNOWLEDGE', 'CLARIFY', 'SUBMIT', 'APPROVE', 'RETURN', 'REJECT', 'CANCEL', 'REOPEN',
] as const
export type Action = (typeof ACTIONS)[number]

function normalizeAction(raw: string): string {
  if (raw === 'SUBMIT_REVIEW') return 'SUBMIT'
  if (raw === 'COMPLETE') return 'APPROVE'
  return raw
}

async function assertEvidenceIfRequired(tx: Prisma.TransactionClient, assignmentId: number, required: boolean) {
  if (!required) return
  const count = await tx.assignmentAttachment.count({ where: { assignmentId } })
  if (count === 0) {
    abort(400, 'This assignment requires evidence attachments. Upload at least 1 file / link / note first.')
  }
}

export async function transitionAssignment(user: AuthUser, id: number, rawAction: string, note: string | null) {
  const action = normalizeAction(rawAction)
  const existing = await prisma.assignment.findUnique({ where: { id } })
  if (!existing) abort(404, 'Assignment not found.')

  const isAdmin = isAdminRole(user.roleType)
  const isAssigner = existing.assignerId === user.id
  const isAssignee = existing.assigneeId === user.id
  const isSelfAssign = existing.assignerId === existing.assigneeId
  const size = await chainSize(id)
  const currentIdx = existing.currentReviewerIdx
  const currentReviewerId = await getCurrentReviewerUserId(id, currentIdx)
  const isCurrentReviewer = currentReviewerId !== null && currentReviewerId === user.id
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    let nextStatus = existing.status
    const data: Prisma.AssignmentUpdateInput = {}
    let reviewAction: { action: string; note: string | null; revisionAt: number } | null = null

    switch (action) {
      case 'ACKNOWLEDGE':
        if (!isAssignee && !isAdmin) abort(403, 'Only the PIC can accept the assignment.')
        if (existing.status !== STATUS.DITUGASKAN) abort(400, 'The assignment is not in the DITUGASKAN status.')
        nextStatus = STATUS.DIKERJAKAN
        data.acknowledgedAt = now
        data.startedAt = now
        data.needsClarification = false
        data.clarificationNote = null
        break

      case 'CLARIFY':
        if (!isAssignee && !isAdmin) abort(403, 'Only the PIC can request clarification.')
        if (existing.status !== STATUS.DITUGASKAN) abort(400, 'Clarification can only be requested while in DITUGASKAN.')
        data.needsClarification = true
        data.clarificationNote = note
        break

      case 'SUBMIT':
        if (!isAssignee && !isAdmin) abort(403, 'Only the PIC can submit.')
        if (existing.status !== STATUS.DIKERJAKAN) abort(400, 'Only DIKERJAKAN assignments can be submitted.')
        await assertEvidenceIfRequired(tx, id, existing.evidenceRequired)
        if (isSelfAssign || size === 0) {
          nextStatus = STATUS.SELESAI
          data.completedAt = now
          data.currentReviewerIdx = null
        } else {
          nextStatus = STATUS.IN_REVIEW
          await resetForResubmit(tx, id)
          data.currentReviewerIdx = 0
        }
        break

      case 'APPROVE':
        // Legacy self-assign COMPLETE langsung dari DIKERJAKAN
        if (
          existing.status === STATUS.DIKERJAKAN
          && (isSelfAssign || size === 0)
          && (isAssignee || isAdmin)
        ) {
          await assertEvidenceIfRequired(tx, id, existing.evidenceRequired)
          nextStatus = STATUS.SELESAI
          data.completedAt = now
          data.currentReviewerIdx = null
          break
        }
        if (existing.status !== STATUS.IN_REVIEW) abort(400, 'The assignment is not in review status.')
        if (!isCurrentReviewer && !isAdmin) abort(403, 'Only the current reviewer in turn can approve.')
        if (currentIdx === null) abort(500, 'The approval chain state is not valid.')
        await markEntry(tx, id, currentIdx, CHAIN_STATUS.APPROVED, note, now)
        reviewAction = { action: 'APPROVED', note, revisionAt: existing.revisionCount }
        if (currentIdx + 1 < size) {
          data.currentReviewerIdx = currentIdx + 1
        } else {
          nextStatus = STATUS.SELESAI
          data.completedAt = now
          data.currentReviewerIdx = null
        }
        break

      case 'RETURN':
        if (existing.status !== STATUS.IN_REVIEW) abort(400, 'Return is only available for IN_REVIEW assignments.')
        if (!isCurrentReviewer && !isAdmin) abort(403, 'Only the current reviewer in turn can return.')
        if (currentIdx === null) abort(500, 'The approval chain state is not valid.')
        await markEntry(tx, id, currentIdx, CHAIN_STATUS.RETURNED, note, now)
        reviewAction = { action: 'RETURNED', note, revisionAt: existing.revisionCount }
        nextStatus = STATUS.DIKERJAKAN
        data.currentReviewerIdx = null
        data.revisionCount = existing.revisionCount + 1
        break

      case 'REJECT':
        if (existing.status !== STATUS.IN_REVIEW) abort(400, 'Reject is only available for IN_REVIEW assignments.')
        if (!isCurrentReviewer && !isAdmin) abort(403, 'Only the current reviewer in turn can reject.')
        if (currentIdx === null) abort(500, 'The approval chain state is not valid.')
        await markEntry(tx, id, currentIdx, CHAIN_STATUS.REJECTED, note, now)
        reviewAction = { action: 'REJECTED', note, revisionAt: existing.revisionCount }
        nextStatus = STATUS.REJECTED
        data.currentReviewerIdx = null
        data.rejectedAt = now
        data.rejectionReason = note
        break

      case 'CANCEL':
        if (!isAssigner && !isAdmin) abort(403, 'Only the assigner can cancel.')
        if (isTerminal(existing.status)) abort(400, 'The assignment is already in a terminal status.')
        nextStatus = STATUS.DIBATALKAN
        data.cancelledAt = now
        data.cancelReason = note
        data.currentReviewerIdx = null
        break

      case 'REOPEN':
        if (!isAssigner && !isAdmin) abort(403, 'Only the assigner can reopen.')
        if (!isTerminal(existing.status)) abort(400, 'Only terminal assignments can be reopened.')
        nextStatus = STATUS.DIKERJAKAN
        data.completedAt = null
        data.cancelledAt = null
        data.cancelReason = null
        data.rejectedAt = null
        data.rejectionReason = null
        data.currentReviewerIdx = null
        if (size > 0) await resetForResubmit(tx, id)
        break

      default:
        abort(400, `Unrecognized action: ${action}`)
    }

    data.status = nextStatus
    await tx.assignment.update({ where: { id }, data })

    if (reviewAction) {
      await tx.assignmentReviewAction.create({
        data: {
          assignmentId: id,
          reviewerId: user.id,
          action: reviewAction.action,
          note: reviewAction.note,
          revisionAt: reviewAction.revisionAt,
        },
      })
    }
  })

  return reload(id)
}

// ── EVIDENCE rule ──────────────────────────────────────────────────────────────
export function canUploadEvidence(
  a: { assigneeId: number; status: string },
  userId: number,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true
  if (a.assigneeId !== userId) return false
  const uploadable: string[] = [STATUS.DIKERJAKAN, STATUS.IN_REVIEW, STATUS.DITUGASKAN]
  return uploadable.includes(a.status)
}

// ── DELETE ──────────────────────────────────────────────────────────────────────
export async function deleteAssignment(user: AuthUser, id: number) {
  const existing = await prisma.assignment.findUnique({ where: { id }, select: { assignerId: true } })
  if (!existing) abort(404, 'Assignment not found.')
  if (!isAdminRole(user.roleType) && existing.assignerId !== user.id) {
    abort(403, 'Only the assigner can delete.')
  }
  await prisma.assignment.delete({ where: { id } })
}

// ── PREVIEW CHAIN ────────────────────────────────────────────────────────────────
export async function previewChain(user: AuthUser, assigneeId: number) {
  if (!(await canAssignTo(user, assigneeId))) return { chain: [], allowed: false }
  return { chain: await resolveChain(assigneeId, user.id), allowed: true }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────
async function reload(id: number) {
  const a = await prisma.assignment.findUniqueOrThrow({ where: { id }, include: ASSIGNMENT_INCLUDE })
  return serialize(a)
}

export type SerializedAssignment = Awaited<ReturnType<typeof reload>>
export { isAdminRole }
