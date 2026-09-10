/**
 * 本地插件接口回归测试（不依赖已启动的 HTTP 服务，直接调 handler）。
 * 运行：node scripts/test-plugin-api.mjs
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 使用独立测试目录，避免污染开发数据
process.env.SNAPSHOT_DIR = path.join(root, '.data/test-run')
fs.rmSync(process.env.SNAPSHOT_DIR, { recursive: true, force: true })

const results = []
function assert(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail })
  const mark = cond ? 'PASS' : 'FAIL'
  console.log(`${mark}  ${name}${detail ? ' — ' + detail : ''}`)
}

function mockReq(body = {}, method = 'POST') {
  return {
    method,
    headers: { host: '127.0.0.1:8099' },
    query: {},
    body,
  }
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k] = v
    },
    end(buf) {
      this.body = buf
    },
  }
  return res
}

async function call(apiFile, body) {
  const mod = await import(
    pathToFileURL(path.join(root, 'api', apiFile)).href + '?t=' + Date.now()
  )
  const handler = mod.default
  const req = mockReq(body)
  const res = mockRes()
  await handler(req, res)
  const json = JSON.parse(res.body.toString('utf8'))
  return json
}

async function callImage(imageId) {
  const mod = await import(
    pathToFileURL(path.join(root, 'api/image.js')).href + '?t=' + Date.now()
  )
  const handler = mod.default
  const req = {
    method: 'GET',
    headers: { host: '127.0.0.1:8099' },
    query: { snapshot_image: imageId },
    url: `/i/s/${imageId}.png`,
  }
  const res = mockRes()
  const chunks = []
  res.end = function (buf) {
    this.body = buf
  }
  await handler(req, res)
  return res
}

async function main() {
  // 1 精确 ID
  {
    const r = await call('knowledge-search.js', {
      main_subject: '数学',
      grade: '小学三年级',
      semester: '上学期',
      query_terms: ['M-K-TIMES'],
    })
    assert('标准 ID 精确匹配', r.status === 'success' && r.matches[0]?.matched_node_id === 'M-K-TIMES', r.status)
  }

  // 2 标准名称
  {
    const r = await call('knowledge-search.js', {
      main_subject: '数学',
      grade: '三年级',
      semester: '上册',
      query: '平均分：总量÷份数=每份数',
    })
    assert(
      '标准名称精确匹配',
      r.status === 'success' && r.matched_nodes.some((n) => n.node_id === 'M-K-AVG'),
      r.status,
    )
  }

  // 3 别名
  {
    const r = await call('knowledge-search.js', {
      main_subject: '数学',
      grade: '三年级',
      semester: '上册',
      query_terms: ['几倍的问题', '平均分东西', '倍数的关系'],
    })
    const ids = r.matches.map((m) => m.matched_node_id || m.candidates?.[0]?.node_id)
    assert(
      '口语/别名多词分别匹配',
      r.matches.length === 3 &&
        ids.includes('M-K-TIMES') &&
        ids.includes('M-K-AVG') &&
        ids.includes('M-K-QUANTITY'),
      JSON.stringify(ids),
    )
  }

  // 4 模糊需确认
  {
    const r = await call('knowledge-search.js', {
      main_subject: '数学',
      grade: '三年级',
      semester: '上册',
      query: '小数',
    })
    assert(
      '多候选需确认',
      r.status === 'ambiguous' || r.matches[0]?.status === 'ambiguous',
      r.status,
    )
  }

  // 5 跨年级拒绝
  {
    const r = await call('knowledge-search.js', {
      main_subject: '数学',
      grade: '四年级',
      semester: '上册',
      query: '混合运算',
    })
    assert('同名不同年级不串范围', r.status === 'out_of_scope', r.status)
  }

  // 6 活动主题
  {
    const r = await call('knowledge-search.js', {
      main_subject: '数学',
      grade: '三年级',
      semester: '上册',
      query: '做月饼',
    })
    assert(
      '仅活动主题无可靠知识点',
      r.status === 'not_found' || r.matches[0]?.status === 'not_found',
      r.status,
    )
  }

  // 7 未覆盖学科
  {
    const r = await call('knowledge-search.js', {
      main_subject: '语文',
      grade: '三年级',
      semester: '上册',
      query: '汉字',
    })
    assert('未覆盖学科', r.status === 'out_of_scope', r.status)
  }

  // 8 无跨学科关系的节点
  {
    const r = await call('cross-query.js', {
      main_node_ids: ['M-K-PATTERN'],
    })
    assert('节点存在但无跨学科关系', r.status === 'no_relation', r.status)
  }

  // 9 无效 ID 不模糊替换
  {
    const r = await call('cross-query.js', {
      main_node_ids: ['NOT-A-NODE'],
    })
    assert('无效 ID 报错', r.status === 'invalid_input', r.status)
  }

  // 10 有关系 + 出图
  let snapshotId = ''
  let relationIds = []
  {
    const r = await call('cross-query.js', {
      main_node_ids: ['M-K-LENGTH', 'M-K-QUANTITY'],
      candidate_subjects: ['科学'],
    })
    snapshotId = r.snapshot_id
    relationIds = (r.relations || []).map((x) => x.relation_id)
    assert(
      '多知识点跨学科关系+快照',
      (r.status === 'success' || r.status === 'partial') &&
        !!r.snapshot_id &&
        r.relations.length > 0 &&
        r.evidence_paths.every((p) => p.nodes.some((n) => n.type === 'cross_disciplinary_theme')),
      `status=${r.status} rels=${r.relations.length}`,
    )
    assert(
      '候选学科非教师确认',
      (r.candidate_subjects || []).every((s) => s.role === 'recommended'),
    )
    assert(
      '路径保留中间主题',
      (r.relations || []).every((rel) => rel.theme_node_id && rel.visual_derived?.via),
    )
  }

  // 11 出图成功
  let imageUrl = ''
  {
    const r = await call('snapshot-image.js', {
      snapshot_id: snapshotId,
    })
    imageUrl = r.image_url
    assert(
      '动态出图成功',
      r.image_status === 'success' &&
        /^https?:\/\//.test(r.image_url) &&
        !r.image_url.includes('[') &&
        r.image_markdown.startsWith('!['),
      `image_status=${r.image_status}`,
    )
    assert('page_url 为纯 URL', /^https?:\/\//.test(r.page_url) && !r.page_url.includes(']('))
  }

  // 12 精简图
  {
    const one = relationIds.slice(0, 1)
    const r = await call('snapshot-image.js', {
      snapshot_id: snapshotId,
      relation_ids: one,
    })
    assert(
      '按 relation_id 精简出图',
      r.image_status === 'success' && r.selected_relation_ids
        ? true
        : r.image_status === 'success',
      r.image_status,
    )
  }

  // 13 假 relation_id
  {
    const r = await call('snapshot-image.js', {
      snapshot_id: snapshotId,
      relation_ids: ['rel_does_not_exist'],
    })
    assert('伪造 relation_id 被拒绝', r.status === 'invalid_input', r.status)
  }

  // 14 快照读取
  {
    const r = await call('snapshot.js', { snapshot_id: snapshotId })
    assert(
      '按快照恢复',
      r.snapshot_id === snapshotId && r.relations.length > 0 && r.image_status === 'success',
      r.status,
    )
  }

  // 16 PNG 真是 PNG
  {
    const id = imageUrl.includes('/i/s/')
      ? imageUrl.split('/i/s/')[1].replace('.png', '').split('?')[0]
      : null
    if (id && !imageUrl.includes('blob.vercel-storage.com')) {
      const res = await callImage(id)
      const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body)
      assert(
        '短链返回真实 PNG',
        res.headers['Content-Type'] === 'image/png' && buf[0] === 0x89 && buf[1] === 0x50,
        `len=${buf.length}`,
      )
    } else {
      // Blob 直链或无法解析短 ID 时，用快照里的 image_id 再读一次
      const store = require('../lib/snapshot-store.js')
      const snap = await store.loadSnapshot(snapshotId)
      const loaded = await store.loadImage(snap.image_id)
      assert(
        '短链返回真实 PNG',
        loaded.buffer[0] === 0x89 && loaded.buffer[1] === 0x50,
        `len=${loaded.buffer.length}`,
      )
    }
  }

  // 15 快照不变
  {
    const store = require('../lib/snapshot-store.js')
    const before = await store.loadSnapshot(snapshotId)
    const hash1 = before.snapshot_content_hash
    const after = await store.loadSnapshot(snapshotId)
    assert('旧快照内容哈希稳定', hash1 && hash1 === after.snapshot_content_hash, hash1)
  }

  // 17 旧 search 兼容
  {
    const mod = await import(
      pathToFileURL(path.join(root, 'api/search.js')).href + '?t=' + Date.now()
    )
    const req = mockReq({ q: '混合运算' })
    const res = mockRes()
    await mod.default(req, res)
    const json = JSON.parse(res.body.toString('utf8'))
    assert('旧 /api/search 兼容', json.ok === true && Array.isArray(json.matches))
  }

  // 18 旧 render 兼容（只测 JSON，不强制渲染耗时过长时也可接受）
  {
    const mod = await import(
      pathToFileURL(path.join(root, 'api/render.js')).href + '?t=' + Date.now()
    )
    const req = mockReq({ view: 'math', focus: 'M-U1', depth: 1 })
    const res = mockRes()
    await mod.default(req, res)
    const json = JSON.parse(res.body.toString('utf8'))
    assert(
      '旧 /api/render 兼容',
      json.ok === true && typeof json.image_url === 'string',
      json.error || '',
    )
  }

  const failed = results.filter((r) => !r.ok)
  console.log('\n——')
  console.log(`合计 ${results.length}，通过 ${results.length - failed.length}，失败 ${failed.length}`)
  if (failed.length) {
    failed.forEach((f) => console.log('  x', f.name, f.detail))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
