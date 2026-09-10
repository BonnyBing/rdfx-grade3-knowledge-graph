/**
 * 重构脚本：把 index.html 里的纯计算逻辑抽到 graph-core.js，供网页与服务端共用。
 *
 * 按定义边界整块搬运源码，不改函数体，避免手工搬迁引入笔误。
 * 抽完后扫描剩余 HTML 仍引用的名字，据此生成薄封装，保证原有调用点不用改。
 *
 * 可反复运行：始终以 index.original.html 为输入，重新生成 core 与 index.html。
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const htmlPath = path.join(root, 'public/index.html')
const originalPath = path.join(root, 'public/index.original.html')
// core 必须能被浏览器直接 GET，所以放在 public 下，Node 端也从这里读，保证只有一份
const corePath = path.join(root, 'public/graph-core.js')

if (!fs.existsSync(originalPath)) {
  fs.copyFileSync(htmlPath, originalPath)
  console.log('已备份原始页面到 public/index.original.html')
}

// 模块级常量：与状态无关，放在 UMD 顶层
const CONSTANTS = [
  'TYPE_LABELS',
  'RELATION_LABELS',
  'TYPE_COLORS',
  'RELATION_COLORS',
  'SIZE_MAP',
  'STATUS_LABELS',
  'OVERVIEW_TYPES',
  'POS_STORAGE_KEY',
  'TYPE_LEVEL',
  'TYPE_ORDER',
  'LAYOUT',
  'MATH_LEVEL_COLORS',
  'SCIENCE_LEVEL_COLORS',
  'MATH_SHADES',
  'SCIENCE_SHADES',
  'SUBJECT_LABELS',
  'SUBJECT_COLORS',
  'STATUS_OPTIONS',
  'cloneGraphData',
]

// 工厂内函数：依赖图数据与视图状态，通过闭包读取
const FUNCTIONS = [
  'getSubjectGroup',
  'getThemeClusters',
  'buildKnowledgeCrossEdges',
  'buildBridgedTeachingEdges',
  'getCrossKnowledgePeers',
  'isCrossLinkedNode',
  'getCrossRelevantNodeIds',
  'isCrossViewNode',
  'isOverviewNode',
  'getNodeLevel',
  'getNodeColor',
  'getNodeBorderColor',
  'getNodeSymbol',
  'getNodeSize',
  'getNodeLabelStyle',
  'getTeachingParent',
  'resolveTeachingAnchor',
  'resolveVisibleAnchor',
  'getNodeVisualExtents',
  'measurePositionsExtent',
  'sortChildIds',
  'buildHierarchyChildrenMap',
  'getNodeLabel',
  'shouldShowLabel',
  'filterNodes',
  'filterEdges',
  'buildChildrenMap',
  'layoutTreeNoOverlap',
  'maxRowH',
  'knowledgeRowHeight',
  'columnKey',
  'snapToColumns',
  'separateColumnOverlaps',
  'reflowColumnStrict',
  'columnStartY',
  'shiftNodePositions',
  'sideBoundingBox',
  'boxesOverlap',
  'separateMathAndScience',
  'resolveVisualBoxOverlaps',
  'enforceSideSeparation',
  'layoutOverviewKnowledgeColumn',
  'finalizeOverviewSide',
  'placeCrossKnowledge',
  'buildOverviewPositions',
  'finalizeSubjectSide',
  'getGraphBounds',
  'recenterParents',
  'placeAuxHierarchyNodes',
  'placeLeftoverNodes',
  'finalizeHierarchyLayout',
  'computeHierarchyPositions',
  'nodeRowHeight',
  'hierarchyColumns',
  'colXForType',
  'assignFullHierarchyLayout',
  'attachSatelliteNodes',
  'estimateNodeSize',
  'buildNodeLabel',
  'resolveOverlaps',
  'getContainsDescendants',
  'getCrossCluster',
  'getTeachesCluster',
  'getDragGroup',
  'layoutSubtree',
  'assignSubjectTreeLayout',
  'assignSubjectForceSeeds',
  'styleEdge',
  'buildHierarchyGraphics',
  'buildGraphData',
]

const src = fs.readFileSync(originalPath, 'utf8')
const lines = src.split('\n')

const INDENT = '      '
const wanted = new Set([...CONSTANTS, ...FUNCTIONS])

/**
 * 从定义起始行开始做括号计数，定位定义的最后一行。
 *
 * 只有在遇到过块开启符（{ 或 [）之后深度归零才算结束，
 * 否则跨多行的参数列表 `) {` 会被误判成结尾。
 * 扫描时跳过字符串与注释内容。
 */
function findBlockEnd(startLine) {
  let depth = 0
  let parenDepth = 0
  let seenBlockOpen = false
  let inString = null
  let inBlockComment = false

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]
      const next = line[c + 1]

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false
          c++
        }
        continue
      }
      if (inString) {
        if (ch === '\\') c++
        else if (ch === inString) inString = null
        continue
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true
        c++
        continue
      }
      if (ch === '/' && next === '/') break // 行注释，跳到下一行
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch
        continue
      }

      if (ch === '(') {
        parenDepth++
        depth++
      } else if (ch === '{' || ch === '[') {
        // 参数列表内的 [] {}（默认参数、解构）不算函数体开始
        if (parenDepth === 0) seenBlockOpen = true
        depth++
      } else if (ch === ')') {
        parenDepth--
        depth--
        if (depth === 0 && seenBlockOpen) return i
      } else if (ch === '}' || ch === ']') {
        depth--
        if (depth === 0 && seenBlockOpen) return i
      }
    }
    // 单行定义且无块开启符（例如 const STATUS_OPTIONS = Object.keys(...)）
    if (i === startLine && depth === 0 && !seenBlockOpen) return i
  }
  throw new Error(`未找到起始行 ${startLine + 1} 的定义结束位置`)
}

/** 找出所有目标定义的行区间（含紧邻上方的注释块） */
function collectBlocks() {
  const blocks = []
  const defRe = new RegExp(
    `^${INDENT}(?:function|const|let)\\s+([A-Za-z_$][\\w$]*)\\b`,
  )
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(defRe)
    if (!m || !wanted.has(m[1])) continue

    const end = findBlockEnd(i)

    // 带走紧邻上方的注释
    let start = i
    while (start > 0) {
      const prev = lines[start - 1].trim()
      if (
        prev.startsWith('/**') ||
        prev.startsWith('*') ||
        prev.startsWith('*/') ||
        prev.startsWith('//')
      ) {
        start--
      } else break
    }

    blocks.push({ name: m[1], start, end, isConst: CONSTANTS.includes(m[1]) })
    i = end
  }
  return blocks
}

const blocks = collectBlocks()

// 校验：每个目标至少命中一次
const found = new Set(blocks.map((b) => b.name))
const missing = [...wanted].filter((n) => !found.has(n))
if (missing.length) {
  console.error('未找到定义:', missing.join(', '))
  process.exit(1)
}

// 同名重复定义（本文件里 separateColumnOverlaps 有两处）保持原顺序全部搬走
const dupes = blocks
  .map((b) => b.name)
  .filter((n, i, a) => a.indexOf(n) !== i)
if (dupes.length) console.log('注意：同名重复定义（按原顺序保留）:', [...new Set(dupes)].join(', '))

const text = (b) => lines.slice(b.start, b.end + 1).join('\n')
const constBlocks = blocks.filter((b) => b.isConst)
const funcBlocks = blocks.filter((b) => !b.isConst)

// 剩余 HTML 中仍被引用的名字 -> 需要生成薄封装
const removedRanges = blocks.map((b) => [b.start, b.end])
const keptLines = lines.filter(
  (_, idx) => !removedRanges.some(([s, e]) => idx >= s && idx <= e),
)
const keptText = keptLines.join('\n')
const referenced = [...wanted].filter((name) =>
  new RegExp(`\\b${name}\\b`).test(keptText),
)

const dedentBy = (s, n) =>
  s
    .split('\n')
    .map((l) => (l.startsWith(' '.repeat(n)) ? l.slice(n) : l))
    .join('\n')

// 常量搬到 UMD 顶层（缩进 2），函数搬进 create 内（缩进 4）
const dedent = (s) => dedentBy(s, 4)
const dedentFn = (s) => dedentBy(s, 2)

let core = `/**
 * 知识图谱核心计算：节点筛选、分层布局、配色与标签样式。
 *
 * 网页和服务端出图共用这一份，坐标计算完全一致。
 * 不含任何 DOM / localStorage 依赖，可直接在 Node 中运行。
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.GraphCore = factory()
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
${constBlocks.map((b) => dedent(text(b))).join('\n\n')}

  const LAYOUT_DEFAULTS = LAYOUT

  /**
   * @param {object} graphData 图谱数据（nodes / edges / metadata）
   * @param {object} state 视图状态，取代原先散落在页面里的全局变量
   */
  function create(graphData, state = {}) {
    const GRAPH_DATA = graphData
    const nodeMap = Object.fromEntries(GRAPH_DATA.nodes.map((n) => [n.id, n]))

    // 出图时可以收紧间距，让文字相对整张图更大，在 Word 里更好读
    const LAYOUT = state.layoutOverrides
      ? {
          ...LAYOUT_DEFAULTS,
          ...state.layoutOverrides,
          rowH: {
            ...LAYOUT_DEFAULTS.rowH,
            ...(state.layoutOverrides.rowH || {}),
          },
        }
      : LAYOUT_DEFAULTS

    const currentView = state.view ?? 'all'
    const layoutMode = state.layoutMode ?? 'overview'
    const showAllDetail = state.showAllDetail ?? false
    const showScienceLessons = state.showScienceLessons ?? false
    const searchQuery = state.searchQuery ?? ''
    const selectedNodeId = state.selectedNodeId ?? null
    const activeTypes =
      state.activeTypes instanceof Set
        ? state.activeTypes
        : new Set(state.activeTypes ?? [...OVERVIEW_TYPES, 'knowledge', 'method'])
    const activeRelations =
      state.activeRelations instanceof Set
        ? state.activeRelations
        : new Set(
            state.activeRelations ?? [
              'contains',
              'teaches',
              'uses_method',
              'cross_links',
            ],
          )
    const savedPositions = state.savedPositions ?? {}

    /**
     * 以某个节点为中心裁剪子图：沿关系向外扩 depth 层，
     * 再补全到学科的 contains 父链，让图片既有细节也有上下文。
     */
    function computeFocusIds(rootId, depth) {
      if (!nodeMap[rootId]) return null
      const keep = new Set([rootId])
      let frontier = [rootId]
      for (let d = 0; d < depth; d++) {
        const next = []
        frontier.forEach((id) => {
          GRAPH_DATA.edges.forEach((e) => {
            if (e.source === id && !keep.has(e.target)) {
              keep.add(e.target)
              next.push(e.target)
            } else if (e.target === id && !keep.has(e.source)) {
              keep.add(e.source)
              next.push(e.source)
            }
          })
        })
        frontier = next
      }
      Array.from(keep).forEach((id) => {
        let cur = id
        for (let guard = 0; guard < 12; guard++) {
          const up = GRAPH_DATA.edges.find(
            (e) => e.target === cur && e.relation === 'contains',
          )
          if (!up || keep.has(up.source)) break
          keep.add(up.source)
          cur = up.source
        }
      })
      return keep
    }

    const focusIds = state.focus
      ? computeFocusIds(state.focus, state.depth ?? 2)
      : null

    // 概览模式下临时加宽列间距，与原页面行为一致
    let activeDepthX = LAYOUT.depthX

    // 原本读 localStorage，服务端由调用方显式传入
    function loadSavedPositions() {
      return savedPositions
    }

${funcBlocks.map((b) => dedentFn(text(b))).join('\n\n')}

    return {
      GRAPH_DATA,
      nodeMap,
      focusIds,
      computeFocusIds,
${[...new Set(funcBlocks.map((b) => b.name))]
  .map((n) => `      ${n},`)
  .join('\n')}
    }
  }

  return {
    create,
${constBlocks.map((b) => `    ${b.name},`).join('\n')}
  }
})
`

// focus 子图必须在筛选阶段就生效，否则布局会保留全图的空白
const filterHook = `    function filterNodes() {
      return GRAPH_DATA.nodes.filter((n) => {
        if (n.type === 'cross_disciplinary_theme') return false`
if (!core.includes(filterHook)) {
  console.error('未能在 filterNodes 中挂载 focus 裁剪，请检查源码是否变化')
  process.exit(1)
}
core = core.replace(
  filterHook,
  `    function filterNodes() {
      return GRAPH_DATA.nodes.filter((n) => {
        if (focusIds && !focusIds.has(n.id)) return false
        if (n.type === 'cross_disciplinary_theme') return false`,
)

fs.writeFileSync(corePath, core)

// ---- 生成改造后的 index.html ----

const constRefs = referenced.filter((n) => CONSTANTS.includes(n))
const funcRefs = referenced.filter((n) => !CONSTANTS.includes(n))

const shim = `      // ===== 以下计算逻辑已抽到 graph-core.js，网页与服务端出图共用同一份 =====
      // 这里保留同名薄封装，页面其余代码的调用方式保持不变。
      const {
${constRefs.map((n) => `        ${n},`).join('\n')}
      } = GraphCore

      let core = null
      let coreKey = ''

      /** 视图状态或数据变化时重建计算核心，否则复用上一次的 */
      function syncCore() {
        const key = JSON.stringify([
          currentView,
          layoutMode,
          showAllDetail,
          showScienceLessons,
          searchQuery,
          selectedNodeId,
          [...activeTypes].sort(),
          [...activeRelations].sort(),
        ])
        if (core && key === coreKey) return core
        coreKey = key
        core = GraphCore.create(GRAPH_DATA, {
          view: currentView,
          layoutMode,
          showAllDetail,
          showScienceLessons,
          searchQuery,
          selectedNodeId,
          activeTypes,
          activeRelations,
          savedPositions: loadSavedPositions(),
        })
        return core
      }

${funcRefs
  .map(
    (n) =>
      `      function ${n}(...args) {\n        return syncCore().${n}(...args)\n      }`,
  )
  .join('\n\n')}
`

// 按倒序删除区间，避免行号位移
const outLines = [...lines]
const sorted = [...blocks].sort((a, b) => b.start - a.start)
const firstStart = Math.min(...blocks.map((b) => b.start))
for (const b of sorted) {
  outLines.splice(b.start, b.end - b.start + 1, ...(b.start === firstStart ? [shim] : []))
}

let html = outLines.join('\n')

const echartsTag =
  '<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"></script>'
if (!html.includes('src="./graph-core.js"')) {
  html = html.replace(
    echartsTag,
    `${echartsTag}\n    <script src="./graph-core.js"></script>`,
  )
}

// 数据变化后让计算核心失效
html = html.replace(
  `      function rebuildNodeMap() {
        nodeMap = Object.fromEntries(GRAPH_DATA.nodes.map((n) => [n.id, n]))
      }`,
  `      function rebuildNodeMap() {
        nodeMap = Object.fromEntries(GRAPH_DATA.nodes.map((n) => [n.id, n]))
        coreKey = ''
      }`,
)

// activeDepthX 已随布局逻辑搬进 graph-core.js，页面不再需要
html = html.replace('      let activeDepthX = LAYOUT.depthX\n', '')

// 本地开发时跳过远端数据源，避免逐个等待超时
html = html.replace(
  `      let DEFAULT_GRAPH_DATA = null`,
  `      if (['localhost', '127.0.0.1', ''].includes(location.hostname)) {
        REMOTE_SYNC.dataUrls = ['./data.json']
        REMOTE_SYNC.enabled = false
      }

      let DEFAULT_GRAPH_DATA = null`,
)

// URL 参数支持：让接口返回的 page_url 能直接打开对应视图
const urlParamFn = `      /**
       * 从 URL 读取视图参数，让智能体回答里的链接能直接定位到对应视图。
       * 支持 view / detail / lessons / search / focus，缺省时保持默认行为。
       * 一律走现有交互入口，避免和界面状态不同步。
       */
      function applyUrlParams() {
        const p = new URLSearchParams(location.search)

        const view = p.get('view')
        if (['all', 'math', 'science', 'cross'].includes(view)) {
          document.querySelectorAll('#viewTabs button').forEach((b) => {
            b.classList.toggle('active', b.dataset.view === view)
          })
          applyViewDefaults(view)
        }

        if (p.get('detail') === '1') {
          document.getElementById('btnToggleDetail').click()
        }

        if (p.get('lessons') === '1') {
          const chk = document.getElementById('chkShowLessons')
          chk.checked = true
          chk.dispatchEvent(new Event('change'))
        }

        const q = p.get('search')
        if (q) {
          searchQuery = q
          document.getElementById('searchInput').value = q
        }

        const focus = p.get('focus')
        if (focus && nodeMap[focus]) showNodeDetail(focus)
      }

`
html = html.replace(
  '      async function bootApp() {',
  urlParamFn + '      async function bootApp() {',
)
html = html.replace(
  `        updateHeaderMeta()
        updateMainDisplay()`,
  `        updateHeaderMeta()
        applyUrlParams()
        updateMainDisplay()`,
)

fs.writeFileSync(htmlPath, html)
console.log(
  `\n已生成 public/index.html（${html.split('\n').length} 行，原 ${lines.length} 行）`,
)

console.log(`已生成 ${path.relative(root, corePath)}`)
console.log(`  常量 ${constBlocks.length} 个，函数块 ${funcBlocks.length} 个`)
console.log(
  `  从 HTML 移除 ${removedRanges.reduce((s, [a, b]) => s + (b - a + 1), 0)} 行`,
)
console.log('\n剩余 HTML 仍引用（需要薄封装）:')
console.log(
  referenced
    .map((n) => `  ${n}${CONSTANTS.includes(n) ? ' (常量)' : ''}`)
    .join('\n'),
)

fs.writeFileSync(
  path.join(root, 'scripts/.extract-report.json'),
  JSON.stringify(
    {
      blocks: blocks.map((b) => ({
        name: b.name,
        lines: [b.start + 1, b.end + 1],
      })),
      referenced,
    },
    null,
    2,
  ),
)
