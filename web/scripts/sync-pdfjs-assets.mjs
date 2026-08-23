/**
 * pdf.js 의 cMap·표준 폰트 데이터를 public/pdfjs 로 복사한다.
 *
 * **이게 없으면 발표 화면에서 한글이 네모나 엉뚱한 글자로 나온다.** pdf.js 는
 * 이 데이터가 없으면 폰트가 통짜로 임베드되지 않아 CID 매핑이 필요하거나
 * 표준 폰트로 대체해야 하는 글자를 제대로 못 그린다. CHICODE 가 실기기에서
 * 확인한 증상이다(PdfViewer.tsx 주석 참고).
 *
 * 외부 CDN 을 쓰지 않는 원칙과 같은 이유로 자체 호스팅한다 — 다만 이건
 * 네트워크로 새로 받아올 필요가 없다. npm install 로 받은 pdfjs-dist 안에
 * 이미 다 들어 있어서 복사만 하면 된다.
 */
import { cp, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_ROOT = join(ROOT, 'node_modules', 'pdfjs-dist')
const TARGET_ROOT = join(ROOT, 'public', 'pdfjs')

const DIRS = ['cmaps', 'standard_fonts']

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  )

if (!(await exists(SOURCE_ROOT))) {
  console.warn('[sync-pdfjs-assets] node_modules 에 pdfjs-dist 가 없어 건너뜁니다.')
  process.exit(0)
}

await mkdir(TARGET_ROOT, { recursive: true })
for (const dir of DIRS) {
  await cp(join(SOURCE_ROOT, dir), join(TARGET_ROOT, dir), { recursive: true })
}
console.log('[sync-pdfjs-assets] public/pdfjs 로 복사 완료')
