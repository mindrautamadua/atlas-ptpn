import 'server-only'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser, type AuthUser } from '@/lib/auth'

/**
 * Helper bersama untuk route handler Channels — port dari
 * ChannelController + ChannelMessageController (atlas-php).
 *
 * Pola: route handler `await requireApiUser()`, jalankan logic, dan bungkus
 * dalam try/catch yang memanggil `errorResponse(e)` untuk memetakan HttpError
 * → JSON status yang tepat (mirror `abort()` / validationError Laravel).
 */

const DM_RE = /^dm-\d+-\d+$/

export function isAdminRole(roleType: string | null | undefined): boolean {
  const r = (roleType ?? '').toLowerCase()
  return r === 'admin' || r === 'superadmin'
}

export function isDmName(name: string | null | undefined): boolean {
  return DM_RE.test(name ?? '')
}

// ── Error handling ───────────────────────────────────────────────────────────
export class HttpError extends Error {
  status: number
  errors?: Record<string, string[]>
  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.errors = errors
  }
}

/** Mirror ChannelController::validationError — 422 dgn errors.general. */
export function validationError(message: string): HttpError {
  return new HttpError(422, message, { general: [message] })
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return NextResponse.json(
      { message: e.message, error: e.message, ...(e.errors ? { errors: e.errors } : {}) },
      { status: e.status },
    )
  }
  console.error('[channels] unhandled error:', e)
  return NextResponse.json({ message: 'Server error', error: 'Server error' }, { status: 500 })
}

/** Auth untuk XHR JSON — 401 (bukan redirect) saat tidak login. */
export async function requireApiUser(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) throw new HttpError(401, 'Unauthenticated.')
  return user
}

// ── Access guards (mirror ChannelMessageController::requireChannelAccess) ──────
export async function getChannelMemberIds(channelId: number): Promise<number[]> {
  const rows = await prisma.channelMember.findMany({
    where: { channelId },
    select: { userId: true },
  })
  return rows.map((r) => r.userId)
}

async function isChannelMember(channelId: number, userId: number): Promise<boolean> {
  const row = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId } },
    select: { userId: true },
  })
  return row !== null
}

type ChannelRow = { id: number; name: string; type: string; isArchived: boolean; createdBy: number }

async function loadChannelOrThrow(channelId: number): Promise<ChannelRow> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, name: true, type: true, isArchived: true, createdBy: true },
  })
  if (!channel) throw new HttpError(404, 'Channel not found.')
  return channel
}

/**
 * Gate channel-scoped op. Reads → PUBLIC channel boleh utk siapa pun authed;
 * writes → wajib member (atau admin). Mirror requireChannelAccess.
 */
export async function requireChannelAccess(
  channelId: number,
  user: AuthUser,
  write: boolean,
): Promise<ChannelRow> {
  const channel = await loadChannelOrThrow(channelId)
  if (isAdminRole(user.roleType)) return channel
  const member = await isChannelMember(channelId, user.id)
  if (write) {
    if (!member) throw new HttpError(403, 'Only channel members can perform this action.')
    return channel
  }
  if (member) return channel
  if (channel.type === 'PUBLIC' && !channel.isArchived) return channel
  throw new HttpError(403, 'You do not have access to this channel.')
}

/** Mirror requireChannelReadAccess (ChannelController). */
export async function requireChannelReadAccess(channel: ChannelRow, user: AuthUser): Promise<void> {
  if (isAdminRole(user.roleType)) return
  if (channel.type === 'PUBLIC' && !channel.isArchived) return
  if (await isChannelMember(channel.id, user.id)) return
  throw new HttpError(403, 'You do not have access to this channel.')
}

/** Mirror requireChannelOwner — admin atau pembuat channel. */
export function requireChannelOwner(channel: ChannelRow, user: AuthUser): void {
  if (isAdminRole(user.roleType)) return
  if (channel.createdBy === user.id) return
  throw new HttpError(403, 'Only the channel creator or an admin can perform this action.')
}

export { loadChannelOrThrow, isChannelMember }

// ── Serializers ───────────────────────────────────────────────────────────────
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

type AuthorRel = { id: number; name: string; avatarUrl: string | null; roleType: string | null; positionTitle?: string | null } | null

export type RawMessage = {
  id: number
  channelId: number
  userId: number
  content: string
  attachments: unknown
  parentMessageId: number | null
  replyCount: number
  reactions: unknown
  mentionedUserIds: unknown
  isPinned: boolean
  isEdited: boolean
  editedAt: Date | null
  editedBy: number | null
  deletedForEveryoneAt: Date | null
  deletedForEveryoneBy: number | null
  createdAt: Date
  updatedAt: Date
  user?: AuthorRel
}

/**
 * Bentuk pesan yang dikonsumsi FE (ChannelMessage). Sertakan `author` (relasi)
 * DAN `authorName`/`authorRole` flat — workspace handler menormalkan keduanya.
 */
export function serializeMessage(m: RawMessage, replyCountOverride?: number) {
  const author = m.user ?? null
  return {
    id: m.id,
    channelId: m.channelId,
    userId: m.userId,
    content: m.content,
    attachments: m.attachments ?? null,
    parentMessageId: m.parentMessageId ?? undefined,
    replyCount: replyCountOverride ?? m.replyCount ?? 0,
    reactions: (m.reactions as Record<string, number[]>) ?? {},
    mentionedUserIds: (m.mentionedUserIds as number[]) ?? undefined,
    isPinned: m.isPinned,
    isEdited: m.isEdited,
    editedAt: iso(m.editedAt) ?? undefined,
    editedBy: m.editedBy ?? undefined,
    deletedForEveryoneAt: iso(m.deletedForEveryoneAt) ?? undefined,
    deletedForEveryoneBy: m.deletedForEveryoneBy ?? undefined,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    author: author
      ? {
          id: author.id,
          name: author.name,
          avatarUrl: author.avatarUrl,
          roleType: author.roleType,
          positionTitle: author.positionTitle ?? null,
        }
      : undefined,
    authorName: author?.name,
    authorRole: author?.roleType ?? undefined,
  }
}

/** Select untuk relasi author message. */
export const AUTHOR_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  roleType: true,
  positionTitle: true,
} as const

export const messageInclude = { user: { select: AUTHOR_SELECT } } as const
