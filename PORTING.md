# ATLAS — Migrasi Laravel/Inertia → Next.js

Status: **Fase 0 (skeleton) selesai & terverifikasi end-to-end** terhadap database Supabase hasil clone.

## Stack target
- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript strict
- **Prisma 7** (`prisma-client-js`) + driver adapter `@prisma/adapter-pg`
- **Supabase PostgreSQL** (project `atlas`, ref `qpvinxqniqctogdvmhzu`, ap-northeast-1)
- Auth: session JWT (`jose`) di httpOnly cookie + `bcryptjs` (hash `$2y$12$` warisan Laravel)

## Database
Sumber `erin.dev.ptpn.id:13306/atlas-fullstack-dev` (PostgreSQL 18, schema `ptpn_kmr_app`,
80 tabel, ~12 MB) **di-clone penuh ke Supabase** via `pg_dump 18 → psql`. Verifikasi: jumlah
tabel & baris cocok 100% (80 tabel, 42 user, 97 program, 279 work item, dst).

Koneksi (lihat `.env` / `.env.local`, **gitignored**):
- `DATABASE_URL` → **transaction pooler** `aws-1-ap-northeast-1.pooler.supabase.com:6543`
  (connection pooling — dipakai runtime app). User pooler = `postgres.<ref>`.
- `DIRECT_URL` → **session pooler** `:5432` (hanya untuk `prisma db pull` / migrasi).

> Host direct `db.<ref>.supabase.co` TIDAK dipakai (IPv6-only, tak resolve di jaringan IPv4).

### Catatan schema penting
`prisma db pull` menghasilkan mismatch tipe FK: PK `id` = `int8` (BigInt) tapi kolom FK = `int4` (Int).
Setelah setiap `db pull`, jalankan transform **`BigInt → Int`** di `prisma/schema.prisma`
(`perl -pi -e 's/\bBigInt\b/Int/g' prisma/schema.prisma`) lalu `npx prisma generate`.
Ini juga menghindari masalah serialisasi `BigInt` ke React client components. Data id kecil (ratusan),
aman sebagai Int.

## Yang sudah diport
- `src/lib/db.ts` — Prisma singleton + adapter pg (search_path `ptpn_kmr_app`)
- `src/lib/session.ts` / `session-edge.ts` — buat/baca/hapus sesi (edge-safe untuk middleware)
- `src/lib/auth.ts` — `getCurrentUser()` (mirror shape `auth.user` Inertia) + `requireUser()`
- `src/middleware.ts` — proteksi route (unauth → /login)
- `src/app/login/` — halaman Login (port `Auth/Login.tsx`) + server action (NIK/userId, bcrypt, throttle 5/menit)
- `src/app/logout/route.ts`
- `src/lib/nav-config.ts` — disalin apa adanya dari sumber
- `src/components/Sidebar.tsx` + `src/app/(app)/layout.tsx` — app shell (sidebar intent-based)
- `src/app/(app)/page.tsx` — **Home** (data agregat live: program/health/workitem/kpi)

## Menjalankan
```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # validasi typecheck + build
node scripts/smoke.mjs   # smoke test koneksi Prisma → Supabase
```
Login uji: NIK `3023276` (atau userId mana pun) / password `DKMR2026` (default 41/42 user).

## Resep port modul berikutnya (incremental)
1. Buat `src/app/(app)/<route>/page.tsx` (server component) — ambil data via `prisma` langsung.
2. Salin komponen view React dari `atlas-php/resources/js/Pages/<View>.tsx`; ubah mekanis:
   - `usePage().props` → props dari server component / `getCurrentUser()`
   - `<Link href>` Inertia → `next/link`; `router.visit()` → `next/navigation`
   - `useForm().post` → server action / `fetch` ke route handler
   - `Head` → `metadata` export atau `document.title`
3. Tandai `'use client'` hanya pada komponen interaktif; fetch di server.
4. Port controller logic (`app/Http/Controllers/*`) jadi query Prisma di server component / `app/api/*`.

Urutan disarankan: Programs → Workboard → Assignment → Performance → Channels.
