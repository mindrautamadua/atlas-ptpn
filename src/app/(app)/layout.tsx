import type { ReactNode } from 'react'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import '@/legacy-styles/index.css'
import '@/design-system/tokens.css'
import '@/styles/shell.css'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()
  const programCount = await prisma.program.count().catch(() => 0)
  return (
    <div className="atlas-shell">
      <Sidebar user={user} programCount={programCount} />
      <div className="atlas-main">
        <Topbar user={user} />
        <main className="atlas-content">{children}</main>
      </div>
    </div>
  )
}
