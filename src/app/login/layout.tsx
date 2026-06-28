/* Login berada DI LUAR grup (app), jadi tidak ikut memuat design token + reset
 * yang di-import oleh layout (app). Tanpa ini, semua var(--ptpn-green/--panel/
 * --surface-*) kosong → input/tombol/panel transparan, dan box-sizing default
 * (content-box) bikin input width:100%+padding overflow. Muat set minimalnya
 * di sini (token + reset), BUKAN seluruh index.css (30+ stylesheet komponen). */
import '@/legacy-styles/tokens.css'
import '@/legacy-styles/reset.css'

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
