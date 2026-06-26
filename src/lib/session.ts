import 'server-only'
import { cookies } from 'next/headers'
import { SignJWT } from 'jose'
import { SESSION_COOKIE, sessionSecret, verifyToken, type SessionPayload } from './session-edge'

export type { SessionPayload }
export { SESSION_COOKIE, verifyToken }

export async function createSession(uid: number) {
  const token = await new SignJWT({ uid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(sessionSecret)

  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies()
  return verifyToken(jar.get(SESSION_COOKIE)?.value)
}

export async function destroySession() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}
