import 'server-only'
import { NextResponse } from 'next/server'
import { getCurrentUser, type AuthUser } from '@/lib/auth'

/**
 * Mirror Laravel `abort($status, $message)` + validator (422) untuk route
 * handlers. Frontend `extractErrorMessage` membaca `message` + `errors`.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function abort(status: number, message: string): never {
  throw new HttpError(status, message)
}

/** Lempar 422 ala Laravel ValidationException. */
export function abortValidation(errors: Record<string, string[]>): never {
  const first = Object.values(errors)[0]?.[0] ?? 'The given data was invalid.'
  throw new HttpError(422, first, errors)
}

/**
 * Bungkus handler: inject user terautentikasi + map HttpError → JSON response
 * dengan status yang benar (401 bila belum login).
 */
export async function withUser(
  fn: (user: AuthUser) => Promise<NextResponse | Response>,
): Promise<NextResponse | Response> {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 })
    return await fn(user)
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json(
        { message: e.message, ...(e.errors ? { errors: e.errors } : {}) },
        { status: e.status },
      )
    }
    console.error('[assignments route]', e)
    return NextResponse.json({ message: 'Server error.' }, { status: 500 })
  }
}
