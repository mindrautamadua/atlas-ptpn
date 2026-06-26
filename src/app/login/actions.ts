'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { createSession } from '@/lib/session'

export type LoginState = { error?: string }

// In-memory throttle (per server instance): 5 failed attempts / identifier / minute.
const attempts = new Map<string, { count: number; first: number }>()
const WINDOW_MS = 60_000
const MAX = 5

function throttled(key: string): number {
  const rec = attempts.get(key)
  if (!rec) return 0
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(key)
    return 0
  }
  return rec.count >= MAX ? Math.ceil((WINDOW_MS - (Date.now() - rec.first)) / 1000) : 0
}

function hit(key: string) {
  const rec = attempts.get(key)
  if (!rec || Date.now() - rec.first > WINDOW_MS) attempts.set(key, { count: 1, first: Date.now() })
  else rec.count += 1
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get('identifier') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!identifier || !password) return { error: 'NIK / User ID and password are required.' }

  const key = identifier.toLowerCase()
  const wait = throttled(key)
  if (wait > 0) return { error: `Too many login attempts. Please try again in ${wait} seconds.` }

  // Email login is disabled — match NIK or User ID only.
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier)) {
    return { error: 'Use your NIK or User ID, not an email.' }
  }

  const user = await prisma.user.findFirst({
    where: { isActive: true, OR: [{ nik: identifier }, { userId: identifier }] },
    select: { id: true, passwordHash: true },
  })

  const ok = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false
  if (!user || !ok) {
    hit(key)
    return { error: 'Incorrect NIK, User ID, or password.' }
  }

  attempts.delete(key)
  await createSession(user.id)
  redirect('/')
}
