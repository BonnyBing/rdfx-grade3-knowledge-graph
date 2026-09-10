/**
 * 出样图：把几种典型参数各渲染一张，用于人工检查中文、清晰度和构图。
 * 输出到 dist/samples/。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { renderGraph } = require(path.join(root, 'lib/render-png.js'))

const outDir = path.join(root, 'dist/samples')
fs.mkdirSync(outDir, { recursive: true })

const cases = [
  { name: '01-全部概要', params: { view: 'all' } },
  { name: '02-数学分层', params: { view: 'math' } },
  { name: '03-科学分层', params: { view: 'science' } },
  { name: '04-跨学科关联', params: { view: 'cross' } },
  {
    name: '05-聚焦单元-混合运算',
    params: { view: 'math', focus: 'M-U1', depth: 2 },
  },
  {
    name: '06-聚焦知识点-小数意义',
    params: { view: 'math', focus: 'M-K-DECIMAL', depth: 2 },
  },
  {
    name: '07-聚焦单元-横向页',
    params: { view: 'math', focus: 'M-U1', depth: 2, preset: 'word-landscape' },
  },
  { name: '08-全部概要-网页样式', params: { view: 'all', preset: 'screen' } },
]

console.log('参数'.padEnd(26), '像素'.padEnd(14), '节点/边'.padEnd(10), 'A4字号', '  耗时')
for (const c of cases) {
  const t0 = Date.now()
  try {
    const { png, svg, info } = await renderGraph(c.params)
    fs.writeFileSync(path.join(outDir, `${c.name}.png`), png)
    fs.writeFileSync(path.join(outDir, `${c.name}.svg`), svg)
    console.log(
      c.name.padEnd(24),
      `${info.width}x${info.height}`.padEnd(14),
      `${info.node_count}/${info.edge_count}`.padEnd(10),
      `${info.word_point_size}pt`.padEnd(7),
      `${Date.now() - t0}ms`,
    )
  } catch (err) {
    console.log(c.name.padEnd(24), '失败:', err.message)
  }
}
console.log(`\n输出目录: ${path.relative(root, outDir)}`)
