import { chromium } from 'playwright'

const OUT = process.env.OUT || '/private/tmp/claude-501/-Users-muhammadindrautama-Aplikasi-atlas-php/18d9821e-dbb4-4420-8ab7-2337eb017c4d/scratchpad'
const NIK = '999900000001'
const PW = 'DKMR2026'

const targets = [
  { name: 'php',  base: 'https://atlas.dev.ptpn.id' },
  { name: 'next', base: 'http://localhost:9100' },
]
const pages = (process.env.PAGES ? JSON.parse(process.env.PAGES) : [
  { slug: 'home', path: '/' },
  { slug: 'programs', path: '/programs' },
])

async function shoot(browser, t) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  try {
    await page.goto(`${t.base}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.fill('#identifier', NIK)
    await page.fill('#password', PW)
    await Promise.all([
      page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}),
      page.click('button[type=submit]'),
    ])
    await page.waitForTimeout(2500)
    for (const pg of pages) {
      await page.goto(`${t.base}${pg.path}`, { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {})
      await page.waitForTimeout(3000)
      const file = `${OUT}/${pg.slug}_${t.name}.png`
      await page.screenshot({ path: file, fullPage: true })
      console.log(`OK ${t.name} ${pg.slug} -> ${file}`)
    }
  } catch (e) {
    console.log(`ERR ${t.name}: ${e.message}`)
  } finally {
    await ctx.close()
  }
}

const browser = await chromium.launch()
for (const t of targets) await shoot(browser, t)
await browser.close()
console.log('done')
