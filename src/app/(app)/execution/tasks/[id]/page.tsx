import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Mirror of the source server-side redirect /execution/tasks/{id} →
 * /execution?task={id}. Workboard auto-opens the TaskDetailModal from ?task=.
 */
export default async function ExecutionTaskRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/execution?task=${encodeURIComponent(id)}`)
}
