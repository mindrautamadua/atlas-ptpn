import { jwtVerify } from 'jose'

// Edge-safe session helpers (no next/headers, no server-only) — usable in middleware.
export const SESSION_COOKIE = 'atlas_session'
export const sessionSecret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? 'dev-insecure-secret-change-me',
)

export type SessionPayload = { uid: number }

export async function verifyToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, sessionSecret)
    return { uid: Number(payload.uid) }
  } catch {
    return null
  }
}
