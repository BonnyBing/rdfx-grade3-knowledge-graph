/**
 * 维度图库：把图谱按四种粒度穷举成单张图片，输出到 维度图库/。
 *
 *   1-学科层    全景、数学×科学跨学科总图、两个学科各自的分层图
 *   2-单元层    每个单元一张：它教哪些知识点、横向牵连到另一学科的什么
 *   3-单元对    有关联的数学单元 × 科学单元，每对一张
 *   4-知识点层  每个最细粒度知识点一张：它和另一学科的知识点怎么连
 *   5-知识点对  跨学科的知识点两两配对，每对一张
 *
 * 除学科层用整图视图外，其余各层都先裁出一份只含相关节点的数据，再交给
 * lib/render-png.js 渲染。裁剪而不是靠 focus+depth 猜，是因为 depth 是按跳数
 * 扩散的：同一个 depth 在有的节点上带不进对面学科的单元，在有的节点上又会把
 * 同学科的兄弟知识点全拖进来，出来的图库粒度不齐。
 *
 * 课时不进图：纵向布局里课时节点不显示标签，只是一堆无名圆点。它们承担的
 * teaches 关系改挂到最近的单元上，与页面隐藏课时后的桥接行为一致。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { renderGraph, measureGraph } = require(path.join(root, 'lib/render-png.js'))

const DATA_FILE = path.join(root, 'public/data.json')
const OUT_ROOT = path.join(root, '维度图库')

const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
const NODE = new Map(data.nodes.map((n) => [n.id, n]))
const TEACH_RELATIONS = ['teaches', 'uses_method']
const STRUCT_RELATIONS = ['contains', ...TEACH_RELATIONS]
const CONTAINER_TYPES = ['unit', 'domain', 'subject']

// ---- 图谱结构查询 ----

function subjectOf(id) {
  if (id.startsWith('X-')) return 'cross'
  if (id.startsWith('M')) return 'math'
  if (id.startsWith('S')) return 'science'
  return 'other'
}

/** 知识点向上找到最近的单元（科学的知识点挂在课时上，要多走一层） */
function anchorOf(id) {
  let cur = id
  for (let guard = 0; guard < 12; guard++) {
    const up = data.edges.find(
      (e) => e.target === cur && STRUCT_RELATIONS.includes(e.relation),
    )
    if (!up) return null
    const n = NODE.get(up.source)
    if (!n) return null
    if (CONTAINER_TYPES.includes(n.type)) return n.id
    cur = n.id
  }
  return null
}

/** 沿 contains 一路收到学科，用来给图补上「这在书的哪一部分」 */
function containerChain(id) {
  const out = []
  let cur = id
  for (let guard = 0; guard < 12; guard++) {
    const up = data.edges.find(
      (e) => e.target === cur && e.relation === 'contains',
    )
    if (!up) break
    out.push(up.source)
    cur = up.source
  }
  return out
}

function teachRelationOf(id) {
  const e = data.edges.find(
    (x) => x.target === id && TEACH_RELATIONS.includes(x.relation),
  )
  return e ? e.relation : 'teaches'
}

const KNOWLEDGE_NODES = data.nodes.filter((n) =>
  ['knowledge', 'method'].includes(n.type),
)
const UNIT_NODES = data.nodes.filter((n) => n.type === 'unit')

/** 单元直接或经课时教到的最细粒度知识点 */
function knowledgeOfUnit(unitId) {
  return KNOWLEDGE_NODES.filter((n) => anchorOf(n.id) === unitId).map((n) => n.id)
}

/** 跨学科主题 -> 它挂着的数学侧、科学侧知识点 */
const THEMES = data.nodes
  .filter((n) => n.type === 'cross_disciplinary_theme')
  .map((theme) => {
    const targets = data.edges
      .filter((e) => e.source === theme.id && e.relation === 'cross_links')
      .map((e) => e.target)
    return {
      id: theme.id,
      name: theme.name,
      math: targets.filter((id) => subjectOf(id) === 'math'),
      science: targets.filter((id) => subjectOf(id) === 'science'),
    }
  })
  .filter((t) => t.math.length && t.science.length)

function themesOfKnowledge(id) {
  return THEMES.filter((t) => t.math.includes(id) || t.science.includes(id))
}

/** 某知识点在另一学科的对应知识点 */
function peersOfKnowledge(id) {
  const side = subjectOf(id) === 'math' ? 'science' : 'math'
  const out = new Set()
  themesOfKnowledge(id).forEach((t) => t[side].forEach((p) => out.add(p)))
  return [...out]
}

// ---- 子图裁剪 ----

/**
 * 按显式给定的知识点、单元和主题裁出一份可渲染的数据。
 * @param {object} spec
 * @param {string[]} spec.knowledgeIds 要进图的最细粒度知识点
 * @param {string[]} spec.unitIds 额外要进图的单元（知识点所属单元会自动带上）
 * @param {Array<{id:string, math:string[], science:string[]}>} spec.themes
 *        跨学科主题；只保留连到 knowledgeIds 里的那些边，避免把无关的对面
 *        知识点也算成这张图的跨学科关系
 * @param {object[]} spec.extraEdges 额外要保留的原始边，端点自动进图
 */
function cutSubset({
  knowledgeIds = [],
  unitIds = [],
  themes = [],
  extraEdges = [],
}) {
  const ids = new Set()
  const edges = []
  const seen = new Set()
  const addEdge = (source, target, relation) => {
    const key = `${relation}|${source}|${target}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ source, target, relation })
  }

  const containers = new Set(unitIds)
  knowledgeIds.forEach((id) => {
    ids.add(id)
    const anchor = anchorOf(id)
    if (anchor) {
      containers.add(anchor)
      addEdge(anchor, id, teachRelationOf(id))
    }
  })
  containers.forEach((id) => {
    ids.add(id)
    containerChain(id).forEach((a) => ids.add(a))
  })
  data.edges.forEach((e) => {
    if (e.relation !== 'contains') return
    if (ids.has(e.source) && ids.has(e.target)) {
      addEdge(e.source, e.target, 'contains')
    }
  })

  extraEdges.forEach((e) => {
    ids.add(e.source)
    ids.add(e.target)
    addEdge(e.source, e.target, e.relation)
  })

  const kept = new Set(knowledgeIds)
  themes.forEach((t) => {
    const math = t.math.filter((id) => kept.has(id))
    const science = t.science.filter((id) => kept.has(id))
    if (!math.length || !science.length) return
    ids.add(t.id)
    ;[...math, ...science].forEach((id) => addEdge(t.id, id, 'cross_links'))
  })

  return {
    metadata: data.metadata,
    node_types: data.node_types,
    relation_types: data.relation_types,
    nodes: data.nodes.filter((n) => ids.has(n.id)),
    edges,
  }
}

// ---- 各层的出图任务 ----

function safeName(s, max = 26) {
  const t = String(s)
    .replace(/[\\/:*?"<>|\n\r\t]/g, '')
    .replace(/[、，,。．：:；;（）()【】[\]“”"'’‘]/g, '')
    .trim()
  return t.length > max ? t.slice(0, max) : t
}

export const tasks = []
const add = (dir, name, params, note) =>
  tasks.push({ dir, name, params, note })

// 第一层：学科
add('1-学科层', '01-全景-数学与科学总览', { view: 'all' }, '两个学科的整体骨架')
add(
  '1-学科层',
  '02-学科间-数学×科学跨学科总图',
  { view: 'cross' },
  '数学与科学之间的全部跨学科关联',
)
add('1-学科层', '03-学科-数学分层', { view: 'math' }, '数学一册的完整分层')
add('1-学科层', '04-学科-科学分层', { view: 'science' }, '科学一册的完整分层')

// 第二层：单元
UNIT_NODES.forEach((unit, i) => {
  const seq = String(i + 1).padStart(2, '0')
  const own = knowledgeOfUnit(unit.id)
  const themes = THEMES.filter((t) =>
    own.some((id) => t.math.includes(id) || t.science.includes(id)),
  )
  const peers = [...new Set(own.flatMap(peersOfKnowledge))]
  const fileName = `${seq}-${unit.id}-${safeName(unit.name)}`

  if (!themes.length) {
    add(
      '2-单元层',
      fileName,
      {
        view: subjectOf(unit.id),
        data: cutSubset({ knowledgeIds: own, unitIds: [unit.id] }),
        metaOverride: {
          viewLabel: '单元内部结构（本单元暂无跨学科关联）',
          focusName: unit.name,
        },
      },
      '本单元内部结构',
    )
    return
  }
  add(
    '2-单元层',
    fileName,
    {
      view: 'cross',
      data: cutSubset({
        knowledgeIds: [...own, ...peers],
        unitIds: [unit.id],
        themes,
      }),
      metaOverride: {
        viewLabel: `单元的跨学科关联（主题：${themes.map((t) => t.name).join('、')}）`,
        focusName: unit.name,
      },
    },
    `跨学科主题：${themes.map((t) => t.name).join('、')}`,
  )
})

// 第三层：单元对
const unitPairs = []
UNIT_NODES.filter((u) => subjectOf(u.id) === 'math').forEach((mu) => {
  const mathOwn = knowledgeOfUnit(mu.id)
  UNIT_NODES.filter((u) => subjectOf(u.id) === 'science').forEach((su) => {
    const sciOwn = knowledgeOfUnit(su.id)
    const shared = THEMES.map((t) => ({
      ...t,
      math: t.math.filter((id) => mathOwn.includes(id)),
      science: t.science.filter((id) => sciOwn.includes(id)),
    })).filter((t) => t.math.length && t.science.length)
    if (shared.length) unitPairs.push({ mu, su, shared })
  })
})
unitPairs.forEach(({ mu, su, shared }, i) => {
  const knowledgeIds = [
    ...new Set(shared.flatMap((t) => [...t.math, ...t.science])),
  ]
  const themeNames = shared.map((t) => t.name).join('、')
  add(
    '3-单元对',
    `${String(i + 1).padStart(2, '0')}-${safeName(mu.name, 16)}×${safeName(su.name, 16)}`,
    {
      view: 'cross',
      data: cutSubset({
        knowledgeIds,
        unitIds: [mu.id, su.id],
        themes: shared,
      }),
      metaOverride: {
        viewLabel: `单元对 · 跨学科主题：${themeNames}`,
        focusName: `${mu.name} × ${su.name}`,
      },
    },
    `跨学科主题：${themeNames}`,
  )
})

// 第四层：知识点
KNOWLEDGE_NODES.forEach((kp, i) => {
  const seq = String(i + 1).padStart(2, '0')
  const fileName = `${seq}-${kp.id}-${safeName(kp.name)}`
  const themes = themesOfKnowledge(kp.id)
  const peers = peersOfKnowledge(kp.id)

  if (!themes.length) {
    // 没有跨学科关联，画它在本单元里的位置和同单元的兄弟知识点
    const anchor = anchorOf(kp.id)
    if (anchor) {
      add(
        '4-知识点层',
        fileName,
        {
          view: subjectOf(kp.id),
          data: cutSubset({
            knowledgeIds: knowledgeOfUnit(anchor),
            unitIds: [anchor],
          }),
          metaOverride: {
            viewLabel: '本学科局部（该知识点暂无跨学科关联）',
            focusName: kp.name,
          },
        },
        '本学科局部，无跨学科关联',
      )
      return
    }
    // 少数通用科学方法没挂在任何单元下，只连着核心素养，那就画它培养什么素养
    const develops = data.edges.filter(
      (e) => e.source === kp.id && e.relation === 'develops',
    )
    add(
      '4-知识点层',
      fileName,
      {
        view: subjectOf(kp.id),
        data: cutSubset({ knowledgeIds: [kp.id], extraEdges: develops }),
        viewOverrides: {
          activeRelations: ['contains', 'teaches', 'uses_method', 'develops'],
        },
        metaOverride: {
          viewLabel: '通用方法（未挂在具体单元下，暂无跨学科关联）',
          focusName: kp.name,
        },
      },
      '贯通全册的通用方法，只连核心素养',
    )
    return
  }
  // 只保留它自己和对面学科的对应知识点，不带同学科的兄弟，图才是「它与另一学科」
  const trimmed = themes.map((t) => ({
    ...t,
    math: subjectOf(kp.id) === 'math' ? [kp.id] : t.math.filter((id) => peers.includes(id)),
    science:
      subjectOf(kp.id) === 'science'
        ? [kp.id]
        : t.science.filter((id) => peers.includes(id)),
  }))
  add(
    '4-知识点层',
    fileName,
    {
      view: 'cross',
      data: cutSubset({ knowledgeIds: [kp.id, ...peers], themes: trimmed }),
      metaOverride: {
        viewLabel: `知识点的跨学科关联（主题：${themes.map((t) => t.name).join('、')}）`,
        focusName: kp.name,
      },
    },
    `对应 ${peers.length} 个${subjectOf(kp.id) === 'math' ? '科学' : '数学'}知识点`,
  )
})

// 第五层：知识点对
const pairs = []
const pairSeen = new Set()
THEMES.forEach((t) => {
  t.math.forEach((m) => {
    t.science.forEach((s) => {
      const key = `${m}|${s}`
      if (pairSeen.has(key)) return
      pairSeen.add(key)
      const shared = THEMES.filter(
        (x) => x.math.includes(m) && x.science.includes(s),
      ).map((x) => ({ ...x, math: [m], science: [s] }))
      pairs.push({ m, s, shared })
    })
  })
})
pairs.forEach(({ m, s, shared }, i) => {
  const themeNames = shared.map((t) => t.name).join('、')
  add(
    '5-知识点对',
    `${String(i + 1).padStart(2, '0')}-${safeName(NODE.get(m).name, 14)}×${safeName(NODE.get(s).name, 14)}`,
    {
      view: 'cross',
      data: cutSubset({ knowledgeIds: [m, s], themes: shared }),
      metaOverride: {
        viewLabel: `知识点对 · 跨学科主题：${themeNames}`,
        focusName: `${NODE.get(m).name} × ${NODE.get(s).name}`,
      },
    },
    `跨学科主题：${themeNames}`,
  )
})

// ---- 出图 ----

/**
 * 图越窄，插进 Word 后文字相对整张图就越大，所以字号不够时的办法是把图收窄，
 * 而不是放大字号（等比缩放在页面上看不出差别）。两条路依次试：
 * 先换层内折行宽度，再收紧列距。层内节点少于 5 个时布局按设计不折行，
 * 这类图只有收列距一条路可走，代价是长标签多折一行、图变高一点。
 */
const GOOD_POINT_SIZE = 8
const MAX_ASPECT = 2.4
const COL_PITCHES = [176, 152, 132, 116]

async function pickLayout(params) {
  const base = await measureGraph(params)
  if (base.word_point_size >= GOOD_POINT_SIZE) return {}

  let best = { extra: {}, pt: base.word_point_size }
  for (const colPitch of COL_PITCHES) {
    for (let m = 3; m <= 8; m++) {
      const extra = {
        maxPerRow: m,
        ...(colPitch === COL_PITCHES[0] ? {} : { presetOverrides: { colPitch } }),
      }
      let info
      try {
        info = await measureGraph({ ...params, ...extra })
      } catch {
        continue // 该组合下布局不成立
      }
      if (info.logical_height / info.logical_width > MAX_ASPECT) continue
      if (info.word_point_size > best.pt) best = { extra, pt: info.word_point_size }
    }
    // 收到够用就不再继续收窄，改动越小越好
    if (best.pt >= GOOD_POINT_SIZE) break
  }
  return best.extra
}

async function generate() {
  fs.rmSync(OUT_ROOT, { recursive: true, force: true })
  const index = []
  let failed = 0

  console.log(`共 ${tasks.length} 张，输出到 ${path.relative(root, OUT_ROOT)}/\n`)
  for (const task of tasks) {
    const dir = path.join(OUT_ROOT, task.dir)
    fs.mkdirSync(dir, { recursive: true })
    const t0 = Date.now()
    try {
      const extra = await pickLayout(task.params)
      const { png, svg, info } = await renderGraph({ ...task.params, ...extra })
      fs.writeFileSync(path.join(dir, `${task.name}.png`), png)
      fs.writeFileSync(path.join(dir, `${task.name}.svg`), svg)
      index.push({
        层: task.dir,
        文件: task.name,
        说明: task.note,
        视图: info.view,
        主体: task.params.metaOverride?.focusName || info.graph_title,
        节点数: info.node_count,
        关系数: info.edge_count,
        像素: `${info.width}x${info.height}`,
        A4字号: info.word_point_size,
        可读性: info.word_point_size >= 8 ? 'good' : 'small',
      })
      console.log(
        `${task.dir}/${task.name}`.padEnd(52),
        `${info.node_count}/${info.edge_count}`.padEnd(8),
        `${info.word_point_size}pt`.padEnd(7),
        `${Date.now() - t0}ms`,
      )
    } catch (err) {
      failed++
      console.log(`${task.dir}/${task.name}`.padEnd(52), '失败:', err.message)
    }
  }

  fs.writeFileSync(
    path.join(OUT_ROOT, '索引.json'),
    JSON.stringify(
      {
        生成时间: new Date().toISOString().slice(0, 19).replace('T', ' '),
        图谱版本: data.metadata?.version || null,
        总数: index.length,
        条目: index,
      },
      null,
      2,
    ),
  )

  const md = [
    '# 维度图库索引',
    '',
    `图谱版本 ${data.metadata?.version || '—'}，共 ${index.length} 张图，每张都有 PNG 和 SVG 两份。`,
    '',
    '重新生成：在 `知识图谱/` 下执行 `npm run gallery`。',
    '',
    'A4 字号是把图按页宽插进 Word 后正文标签的估算磅值，8pt 以上记 good。',
    '',
  ]
  ;[...new Set(index.map((r) => r.层))].forEach((g) => {
    const rows = index.filter((r) => r.层 === g)
    md.push(`## ${g}（${rows.length} 张）`, '')
    md.push('| 文件 | 主体 | 说明 | 节点/关系 | A4 字号 | 可读性 |')
    md.push('| --- | --- | --- | --- | --- | --- |')
    rows.forEach((r) => {
      md.push(
        `| ${r.文件} | ${r.主体} | ${r.说明} | ${r.节点数}/${r.关系数} | ${r.A4字号}pt | ${r.可读性} |`,
      )
    })
    md.push('')
  })
  fs.writeFileSync(path.join(OUT_ROOT, '索引.md'), md.join('\n'))

  const small = index.filter((r) => r.可读性 === 'small').length
  console.log(
    `\n完成 ${index.length} 张${failed ? `，失败 ${failed} 张` : ''}；其中 ${small} 张 A4 字号不足 8pt`,
  )
  console.log(`索引：${path.relative(root, path.join(OUT_ROOT, '索引.md'))}`)
}

// 被别的脚本 import 时只暴露任务清单，不出图
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  await generate()
}
