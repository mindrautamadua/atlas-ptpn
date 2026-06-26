import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Penyimpanan file privat lokal — mirror Laravel `Storage::disk('local')`
 * (root `storage/app/private`). Untuk lampiran assignment (download
 * ter-otentikasi). Saat multi-replica / serverless, ganti ke Supabase Storage
 * (TODO: parity dengan UPLOAD_PRIVATE_DISK=s3 di config/uploads.php).
 */
const PRIVATE_ROOT = path.join(process.cwd(), 'storage', 'app', 'private')

function resolveSafe(relativePath: string): string {
  const full = path.join(PRIVATE_ROOT, relativePath)
  // Guard path traversal — full harus di dalam PRIVATE_ROOT.
  if (!full.startsWith(PRIVATE_ROOT + path.sep) && full !== PRIVATE_ROOT) {
    throw new Error('Invalid storage path.')
  }
  return full
}

export async function putPrivateFile(relativePath: string, data: Buffer): Promise<void> {
  const full = resolveSafe(relativePath)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, data)
}

export async function readPrivateFile(relativePath: string): Promise<Buffer> {
  return fs.readFile(resolveSafe(relativePath))
}

export async function deletePrivateFile(relativePath: string): Promise<void> {
  try {
    await fs.unlink(resolveSafe(relativePath))
  } catch {
    /* best-effort, abaikan bila sudah hilang */
  }
}
