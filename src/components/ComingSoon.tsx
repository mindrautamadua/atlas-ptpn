import Link from 'next/link'

/** Placeholder untuk halaman yang belum diport dari atlas-php (Inertia).
 *  Menjaga seluruh menu sidebar punya tujuan valid (tidak 404) selama migrasi
 *  incremental. Ganti dengan view asli saat modul terkait diport. */
export default function ComingSoon({
  title,
  description,
  phpRoute,
}: {
  title: string
  description?: string
  phpRoute?: string
}) {
  return (
    <div className="coming-soon">
      <span className="coming-soon__badge">Belum diport</span>
      <h1 className="coming-soon__title">{title}</h1>
      <p className="coming-soon__desc">
        {description ?? 'Modul ini sudah ada di ATLAS (Laravel) dan akan diport ke versi Next.js.'}
      </p>
      {phpRoute ? (
        <code className="coming-soon__route">{phpRoute}</code>
      ) : null}
      <Link href="/" className="coming-soon__home">
        ← Kembali ke Home
      </Link>
    </div>
  )
}
