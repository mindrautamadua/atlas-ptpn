import { NextRequest, NextResponse } from 'next/server'
import { withUser } from '@/lib/http-route'
import { findForUser, updateAssignment, deleteAssignment } from '@/lib/assignments'
import { broadcastAssignment } from '@/lib/broadcast'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    return NextResponse.json({ data: await findForUser(user, Number(id)) })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const assignment = await updateAssignment(user, Number(id), body)
    await broadcastAssignment(assignment.id, 'updated')
    return NextResponse.json({ data: assignment })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    await deleteAssignment(user, Number(id))
    await broadcastAssignment(Number(id), 'deleted')
    return NextResponse.json({ ok: true })
  })
}
