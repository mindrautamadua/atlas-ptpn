import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import NotificationSettings from '@/components/NotificationSettings'

export const metadata: Metadata = {
  title: 'Notifikasi',
}

export default async function NotificationsSettingsPage() {
  await requireUser()
  return (
    <div className="settings-page">
      <header className="settings-page__head">
        <h1 className="settings-page__title">Notifikasi</h1>
        <p className="settings-page__subtitle">
          Atur pengiriman notifikasi push ke perangkat Anda.
        </p>
      </header>
      <NotificationSettings />
    </div>
  )
}
