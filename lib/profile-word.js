/**
 * 出图样式档：把共用布局算出的坐标组装成 ECharts option。
 *
 * 面向 Word 排版做了几处针对性处理：
 *  - 收缩空列。分层布局的宽度由列数决定而非节点数，兜底列常常留下大片空白，
 *    去掉后整张图明显变窄，文字相对图片就变大了，这是页宽固定时唯一有效的手段。
 *    单纯放大字号并同步放大间距只是等比缩放，在 Word 里看不出任何差别。
 *  - 收紧行距，让图接近方形，插入 A4 后不至于纵向跨页。
 *  - 纯白不透明底、去掉阴影与高亮态：透明 PNG 在 Word 里会出问题，
 *    阴影属于 SVG 滤镜，矢量转位图时也无法还原。
 *  - 标题与图例画进图里。网页上这些信息在侧边栏，图片里没有侧边栏。
 */

const FONT_FAMILY = 'Noto Sans SC'

const PRESETS = {
  // A4 纵向插图，默认。转成纵向层级，图形接近方形，页宽固定时文字最大
  word: {
    orientation: 'vertical',
    padX: 48,
    padTop: 92,
    padBottom: 84,
    colPitch: 176,
    rowGap: 46,
    labelFontSize: 13,
    titleFontSize: 12,
  },
  // 内容多时用更宽的列距，适合 A4 横向或幻灯片
  'word-landscape': {
    orientation: 'vertical',
    padX: 56,
    padTop: 96,
    padBottom: 88,
    colPitch: 208,
    rowGap: 52,
    labelFontSize: 14,
    titleFontSize: 13,
  },
  // 保持网页的横向分层，仅用于和页面比对
  screen: {
    orientation: 'horizontal',
    padX: 48,
    padTop: 88,
    padBottom: 84,
    colGap: null,
    layoutOverrides: null,
  },
}

const VIEW_LABELS = {
  all: '全部概要',
  math: '数学',
  science: '科学',
  cross: '跨学科关联',
}

const RELATION_LEGEND = {
  contains: { label: '包含', color: '#64748b', dash: false },
  teaches: { label: '教学', color: '#93c5fd', dash: true },
  uses_method: { label: '使用方法', color: '#93c5fd', dash: true },
  cross_links: { label: '跨学科链接', color: '#ea580c', dash: true },
  aligns_to: { label: '对齐课标', color: '#78716c', dash: false },
  develops: { label: '培养素养', color: '#dc2626', dash: false },
  prerequisite_of: { label: '前置知识', color: '#f59e0b', dash: false },
  applies_to: { label: '应用于', color: '#10b981', dash: false },
}

/** 传对象时按对象用，供批量出图脚本临时收窄列距而不新增一档公开档位 */
function getPreset(name) {
  if (name && typeof name === 'object') return name
  return PRESETS[name] || PRESETS.word
}

/**
 * 把实际用到的列重新紧密排列，去掉兜底逻辑留下的空列。
 * 只改 x，同列内的相对顺序和 y 全部保持不变。
 */
function compactColumns(nodes, colGap) {
  if (!colGap) return nodes
  const xs = [...new Set(nodes.map((n) => Math.round(n.x)))].sort((a, b) => a - b)
  if (xs.length < 2) return nodes
  const remap = new Map(xs.map((x, i) => [x, i * colGap]))
  return nodes.map((n) => ({ ...n, x: remap.get(Math.round(n.x)) ?? n.x }))
}

/** 按列距估算标签占几行，用来推算这一层需要多高 */
function estimateLabelLines(text, fontSize, labelWidth) {
  const perLine = Math.max(4, Math.floor(labelWidth / fontSize))
  return Math.max(1, Math.ceil((text || '').length / perLine))
}

/*
 * 分层按节点类型，与共用布局的五列一一对应。
 *
 * 不能改用 x 坐标聚类：去重叠算法会把节点沿 x 推开几十到上百像素，
 * 同级的单元于是被拆到不同层，图上就会出现「第一单元挂在第七单元下面」这种错位。
 * 类型是层级的本来定义，不受布局微调影响。
 */
const TYPE_LAYER = {
  subject: 0,
  domain: 1,
  unit: 2,
  cross_disciplinary_theme: 2,
  lesson: 3,
}

function layerOf(core, id) {
  return TYPE_LAYER[core.nodeMap[id]?.type] ?? 4
}

/** 按类型分层，层内暂按共用布局的上下顺序，之后再按连接位置微调 */
function groupLayers(nodes, core) {
  const layers = new Map()
  nodes.forEach((n) => {
    const k = layerOf(core, n.id)
    if (!layers.has(k)) layers.set(k, [])
    layers.get(k).push(n)
  })
  return [...layers.keys()]
    .sort((a, b) => a - b)
    .map((k) => layers.get(k).sort((a, b) => a.y - b.y))
}

/*
 * 层内折行的两条约束，都是为了不把同一层读成两级：
 *  - 少于这个数一律排一行。四个单元被切成 3+1，末行那个孤零零居中，
 *    看上去就像是挂在上一行某个节点下面的下一级。
 *  - 折行时每行数量取均值，宁可行数不变也不留一个尾巴。
 */
const NEVER_WRAP_BELOW = 5

function splitRows(items, maxPerRow) {
  if (items.length <= Math.max(maxPerRow, NEVER_WRAP_BELOW)) return [items]
  const rows = Math.ceil(items.length / maxPerRow)
  const per = Math.ceil(items.length / rows)
  const out = []
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per))
  return out
}

/** 无向邻接表，用于层内排序时找上一层的连接点 */
function buildAdjacency(edges) {
  const adj = new Map()
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a).push(b)
  }
  edges.forEach((e) => {
    add(e.source, e.target)
    add(e.target, e.source)
  })
  return adj
}

/**
 * 层内排序：把节点挪到它在上一层的连接点附近，减少连线交叉。
 * 在上一层没有连接点的（只连同层或下层）保持共用布局里的原顺序，排在后面。
 */
function orderLayer(items, prevX, adj) {
  return items
    .map((n, i) => {
      const xs = (adj.get(n.id) || [])
        .map((id) => prevX.get(id))
        .filter((v) => v !== undefined)
      const bary = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
      return { n, i, bary }
    })
    .sort(
      (a, b) =>
        (a.bary ?? Infinity) - (b.bary ?? Infinity) || a.i - b.i,
    )
    .map((e) => e.n)
}

/**
 * 去掉没有任何连线的节点。
 * 关系类型被筛掉后，课标、核心素养这类节点会孤零零地留在图里，
 * 在图片中既讲不出关系又白占篇幅。
 */
function dropIsolatedNodes(nodes, edges, keepId) {
  const linked = new Set()
  edges.forEach((e) => {
    linked.add(e.source)
    linked.add(e.target)
  })
  const kept = nodes.filter((n) => linked.has(n.id) || n.id === keepId)
  return kept.length ? kept : nodes
}

/** 一个节点连它下方的标签总共占多高 */
function nodeBlockHeight(n, core, preset) {
  const raw = core.nodeMap[n.id]
  const lines = estimateLabelLines(
    raw?.name,
    preset.labelFontSize,
    preset.colPitch - 22,
  )
  const lineHeight = Math.round(preset.labelFontSize * 1.32)
  return core.getNodeSize(raw) + lines * lineHeight + 14
}

/**
 * 纵向排布：层级自上而下，层内水平居中。
 *
 * 共用布局是横向铺开的，列数固定在四五列，宽度因此居高不下，
 * 而 Word 的页宽是死的，图越宽字就越小。转成纵向后宽度由层内节点数决定。
 * 层内节点太多时折行，否则数学全图那样一层塞进二十多个知识点会把图片拉到极宽。
 * 层级归属和层内顺序仍然来自共用布局，结构不变，只改呈现方向。
 */
function layoutVertical(nodes, core, preset, maxPerRow, adj = new Map()) {
  const { colPitch, rowGap, layerGap = 0 } = preset
  const layers = groupLayers(nodes, core)
  const placed = new Map()
  let cursorY = 0
  let maxRowW = 0
  let prevX = new Map()

  layers.forEach((raw, li) => {
    const items = li === 0 ? raw : orderLayer(raw, prevX, adj)
    const rowX = new Map()
    const rows = splitRows(items, maxPerRow)
    rows.forEach((row, ri) => {
      const rowH = Math.max(...row.map((n) => nodeBlockHeight(n, core, preset)))
      // 折行的第二行起半格错开，否则跨层的竖直连线会正好从上一行的节点上穿过
      const offset = ri % 2 ? colPitch / 2 : 0
      let x = (-(row.length - 1) * colPitch) / 2 + offset
      row.forEach((n) => {
        placed.set(n.id, { x, y: cursorY + rowH / 2 })
        rowX.set(n.id, x)
        x += colPitch
      })
      maxRowW = Math.max(maxRowW, row.length * colPitch + offset)
      // 同一层的折行贴紧，和层与层之间的间距区分开
      cursorY += rowH + (ri < rows.length - 1 ? Math.round(rowGap * 0.5) : rowGap)
    })
    if (li < layers.length - 1) cursorY += layerGap
    prevX = rowX
  })

  return {
    placed,
    width: maxRowW,
    height: Math.max(cursorY - rowGap, 1),
    layerCount: layers.length,
  }
}

/**
 * 试几种折行宽度，挑出最接近目标宽高比的一种。
 * A4 正文区大约 16cm 宽 24cm 高，所以默认目标略瘦于方形。
 */
function chooseMaxPerRow(nodes, core, preset, adj) {
  const target = preset.targetRatio || 0.72
  const widest = Math.max(...groupLayers(nodes, core).map((l) => l.length))
  let best = null
  for (let m = 3; m <= Math.max(3, widest); m++) {
    const { width, height } = layoutVertical(nodes, core, preset, m, adj)
    const score = Math.abs(Math.log(width / height / target))
    if (!best || score < best.score) best = { m, score }
  }
  return best.m
}

/** 套上纵向布局的坐标与标签样式 */
function applyVertical(nodes, core, preset, placed, focusId) {
  const labelWidth = preset.colPitch - 22
  const lineHeight = Math.round(preset.labelFontSize * 1.32)
  return nodes.map((n) => {
    const p = placed.get(n.id)
    if (!p) return n
    const raw = core.nodeMap[n.id]
    const lines = estimateLabelLines(raw?.name, preset.labelFontSize, labelWidth)
    // 聚焦节点和同层的兄弟节点样式一样，不标出来就看不出图是围绕谁展开的
    const focused = focusId && n.id === focusId
    return {
      ...n,
      x: p.x,
      y: p.y,
      // 图片里要能完整读到名称，不用网页上的截断版本
      name: raw?.name || n.name,
      symbolSize: focused
        ? Math.round(core.getNodeSize(raw) * 1.35)
        : n.symbolSize,
      itemStyle: focused
        ? { ...n.itemStyle, borderColor: '#f59e0b', borderWidth: 4 }
        : n.itemStyle,
      label: {
        ...n.label,
        show: true,
        position: 'bottom',
        align: 'center',
        distance: 6,
        width: labelWidth,
        overflow: 'break',
        lineHeight,
        fontSize: focused ? preset.labelFontSize + 1 : preset.labelFontSize,
        fontWeight: focused ? 'bold' : n.label?.fontWeight,
        color: focused ? '#b45309' : n.label?.color,
        fontFamily: FONT_FAMILY,
        // 纵向布局里连线是竖着走的，会从标签中间穿过，垫一层白底挡住
        backgroundColor: '#ffffff',
        padding: [2, 4, 2, 4],
        borderRadius: 3,
      },
      __labelLines: lines,
    }
  })
}

/**
 * 纵向布局下自己算包围盒。
 * core.getGraphBounds 用的是网页那套标签尺寸，和这里的标签宽度不一致。
 */
function verticalBounds(nodes, core, preset) {
  const lineHeight = Math.round(preset.labelFontSize * 1.32)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  nodes.forEach((n) => {
    const raw = core.nodeMap[n.id]
    const r = core.getNodeSize(raw) / 2
    const halfLabel = preset.colPitch / 2
    const labelH = (n.__labelLines || 1) * lineHeight + 8
    minX = Math.min(minX, n.x - halfLabel)
    maxX = Math.max(maxX, n.x + halfLabel)
    minY = Math.min(minY, n.y - r - 6)
    maxY = Math.max(maxY, n.y + r + labelH)
  })
  if (!isFinite(minX)) return null
  return { minX, maxX, minY, maxY }
}

/** 估算图片插入 Word 后正文标签的实际字号，用来提示是否该缩小范围 */
function estimatePointSize(imageWidth, labelFontSize, usableWidthMm = 160) {
  const mm = (labelFontSize / imageWidth) * usableWidthMm
  return Math.round((mm / 0.3528) * 10) / 10
}

/** 图里实际出现了哪些学科和关系，据此生成图例 */
function collectLegend(core, rawNodes, rawEdges) {
  const subjects = new Set()
  rawNodes.forEach((n) => {
    const g = core.getSubjectGroup(n.id)
    if (g === 'math' || g === 'science') subjects.add(g)
  })
  const hasCross = rawEdges.some((e) => e.relation === 'cross_links')
  if (hasCross) subjects.add('cross')

  const relations = []
  const seen = new Set()
  rawEdges.forEach((e) => {
    if (seen.has(e.relation)) return
    seen.add(e.relation)
    if (RELATION_LEGEND[e.relation]) relations.push(e.relation)
  })
  // 教学与使用方法样式一致，图例里合并为一项
  const merged = relations.filter(
    (r) => !(r === 'uses_method' && relations.includes('teaches')),
  )
  return { subjects: [...subjects], relations: merged }
}

const SUBJECT_LEGEND = {
  math: { label: '数学', color: '#1d4ed8' },
  science: { label: '科学', color: '#047857' },
  cross: { label: '跨学科', color: '#ea580c' },
}

/*
 * 页眉页脚要按画布宽度折行。
 * 聚焦出的子图只有十来个节点，画布可能窄到六七百像素，而标题行和图例是定长的，
 * 一行排不下就会被画到画布外，在图片里直接消失。
 */
const TITLE_SIZE = 22
const CAPTION_SIZE = 13
const CAPTION_LINE_H = 18
const LEGEND_ROW_H = 24
const HEADER_BASE = 92
const LEGEND_BASE = 84

/** 粗估文本宽度：汉字按字号算满宽，半角字符折算 0.56 */
function measureTextWidth(text, fontSize) {
  let w = 0
  for (const ch of String(text)) {
    w += ch.charCodeAt(0) < 0x2e80 ? fontSize * 0.56 : fontSize
  }
  return Math.ceil(w)
}

function captionParts(meta) {
  const parts = []
  if (meta.viewLabel) parts.push(`视图：${meta.viewLabel}`)
  if (meta.focusName) parts.push(`聚焦：${meta.focusName}`)
  parts.push(`节点 ${meta.nodeCount} · 关系 ${meta.edgeCount}`)
  if (meta.version) parts.push(`版本 ${meta.version}`)
  if (meta.date) parts.push(meta.date)
  return parts
}

/** 按可用宽度把页眉信息折行，优先在分隔符处断开，单项本身超宽时按字硬折 */
function wrapParts(parts, maxWidth, fontSize) {
  const sep = '  ·  '
  const sepW = measureTextWidth(sep, fontSize)
  const lines = []
  let row = ''
  const flush = () => {
    if (row) lines.push(row)
    row = ''
  }

  parts.forEach((part) => {
    const w = measureTextWidth(part, fontSize)
    if (row && measureTextWidth(row, fontSize) + sepW + w > maxWidth) flush()
    if (w <= maxWidth) {
      row = row ? row + sep + part : part
      return
    }
    flush()
    let chunk = ''
    for (const ch of part) {
      if (measureTextWidth(chunk + ch, fontSize) > maxWidth) {
        lines.push(chunk)
        chunk = ''
      }
      chunk += ch
    }
    row = chunk
  })
  flush()
  return lines
}

function headerMetrics(meta, width, padX) {
  const lines = wrapParts(captionParts(meta), width - padX * 2, CAPTION_SIZE)
  return {
    lines,
    padTop: HEADER_BASE + (lines.length - 1) * CAPTION_LINE_H,
    minWidth: measureTextWidth(meta.title || '知识图谱', TITLE_SIZE) + padX * 2,
  }
}

function legendMetrics(legend, width, padX) {
  const entries = []
  legend.subjects.forEach((key) => {
    const item = SUBJECT_LEGEND[key]
    if (item) entries.push({ ...item, kind: 'subject', gap: 20 })
  })
  legend.relations.forEach((rel) => {
    const item = RELATION_LEGEND[rel]
    if (item) entries.push({ ...item, kind: 'relation', gap: 32 })
  })
  const avail = width - padX * 2
  const rows = []
  let row = []
  let rowW = 0
  entries.forEach((e) => {
    const w = e.gap + measureTextWidth(e.label, CAPTION_SIZE) + 24
    if (row.length && rowW + w > avail) {
      rows.push(row)
      row = [{ ...e, w }]
      rowW = w
      return
    }
    row.push({ ...e, w })
    rowW += w
  })
  if (row.length) rows.push(row)
  return {
    rows,
    padBottom: LEGEND_BASE + Math.max(0, rows.length - 1) * LEGEND_ROW_H,
  }
}

function buildHeader(meta, lines, width, padX) {
  const dividerY = 82 + (lines.length - 1) * CAPTION_LINE_H
  return [
    {
      type: 'text',
      left: padX,
      top: 26,
      silent: true,
      style: {
        text: meta.title || '知识图谱',
        fontSize: TITLE_SIZE,
        fontWeight: 'bold',
        fontFamily: FONT_FAMILY,
        fill: '#111827',
      },
    },
    ...lines.map((text, i) => ({
      type: 'text',
      left: padX,
      top: 58 + i * CAPTION_LINE_H,
      silent: true,
      style: {
        text,
        fontSize: CAPTION_SIZE,
        fontFamily: FONT_FAMILY,
        fill: '#6b7280',
      },
    })),
    {
      type: 'line',
      silent: true,
      shape: { x1: padX, y1: dividerY, x2: width - padX, y2: dividerY },
      style: { stroke: '#e5e7eb', lineWidth: 1 },
    },
  ]
}

function buildLegend(rows, width, height, padX) {
  const items = []
  const firstY = height - 58 - (rows.length - 1) * LEGEND_ROW_H

  items.push({
    type: 'line',
    silent: true,
    shape: { x1: padX, y1: firstY - 22, x2: width - padX, y2: firstY - 22 },
    style: { stroke: '#e5e7eb', lineWidth: 1 },
  })

  rows.forEach((row, ri) => {
    const baseY = firstY + ri * LEGEND_ROW_H
    let x = padX
    row.forEach((item) => {
      if (item.kind === 'subject') {
        items.push({
          type: 'rect',
          silent: true,
          shape: { x, y: baseY, width: 14, height: 14, r: 3 },
          style: { fill: item.color },
        })
      } else {
        items.push({
          type: 'line',
          silent: true,
          shape: { x1: x, y1: baseY + 7, x2: x + 26, y2: baseY + 7 },
          style: {
            stroke: item.color,
            lineWidth: 2,
            lineDash: item.dash ? [5, 4] : undefined,
          },
        })
      }
      items.push({
        type: 'text',
        silent: true,
        x: x + item.gap,
        y: baseY + 1,
        style: {
          text: item.label,
          fontSize: CAPTION_SIZE,
          fontFamily: FONT_FAMILY,
          fill: '#374151',
        },
      })
      x += item.w
    })
  })

  return items
}

/*
 * 纵向布局下跨层连线一律直连：弧线会绕开父节点，反而显得凌乱。
 * 同层之间的连线（跨学科链接就是这种，它连的是两个知识点）是例外：
 * 同层节点 y 相同，直连就是一条水平线，多条会重叠成一根，
 * 看不出到底是哪几对相连。逐条给不同弧度错开，弧朝上凸，
 * 避开知识点下方的标签。
 */
function verticalLinks(links, nodes) {
  const yOf = new Map(nodes.map((n) => [n.id, n.y]))
  let sameLayer = 0
  return links.map((e) => {
    const dy = Math.abs((yOf.get(e.source) ?? 0) - (yOf.get(e.target) ?? 0))
    if (dy > 1) return { ...e, lineStyle: { ...e.lineStyle, curveness: 0 } }
    const step = sameLayer++
    return {
      ...e,
      lineStyle: { ...e.lineStyle, curveness: 0.08 + (step % 4) * 0.06 },
    }
  })
}

/** 去掉阴影和高亮态：阴影是 SVG 滤镜，矢量转位图时还原不了 */
function flattenNodeStyle(node) {
  const itemStyle = { ...node.itemStyle, shadowBlur: 0, shadowColor: 'transparent' }
  const label = node.label
    ? { ...node.label, fontFamily: FONT_FAMILY }
    : node.label
  return { ...node, itemStyle, label, emphasis: undefined }
}

/**
 * @param {object} core GraphCore 实例
 * @param {object} model core.buildGraphData() 的结果
 * @param {object} opts { preset, meta }
 */
function buildOption(core, model, opts = {}) {
  const preset = getPreset(opts.preset)
  const vertical = preset.orientation === 'vertical'

  let maxPerRow = null
  let nodes
  if (vertical) {
    const linked = dropIsolatedNodes(model.nodes, model.edges, opts.focus)
    const adj = buildAdjacency(model.edges)
    maxPerRow = opts.maxPerRow || chooseMaxPerRow(linked, core, preset, adj)
    const { placed } = layoutVertical(linked, core, preset, maxPerRow, adj)
    nodes = applyVertical(linked, core, preset, placed, opts.focus).map(
      flattenNodeStyle,
    )
  } else {
    nodes = compactColumns(model.nodes, preset.colGap).map(flattenNodeStyle)
  }
  const keptIds = new Set(nodes.map((n) => n.id))
  const links = model.edges.filter(
    (e) => keptIds.has(e.source) && keptIds.has(e.target),
  )

  const bounds = vertical
    ? verticalBounds(nodes, core, preset)
    : core.getGraphBounds(nodes)
  if (!bounds) throw new Error('图中没有可定位的节点')

  // 图例只列出图里真正出现的学科和关系
  const rawEdges = core
    .filterEdges(core.filterNodes().map((n) => n.id))
    .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
  const legend = collectLegend(core, nodes, rawEdges)

  const meta = {
    nodeCount: nodes.length,
    edgeCount: links.length,
    ...opts.meta,
  }

  const boundsW = bounds.maxX - bounds.minX
  const boundsH = bounds.maxY - bounds.minY
  // 页眉页脚要折几行取决于画布多宽，所以先定宽再算上下留白
  const header = headerMetrics(meta, Math.ceil(boundsW + preset.padX * 2), preset.padX)
  const width = Math.max(Math.ceil(boundsW + preset.padX * 2), header.minWidth)
  const headerFinal = headerMetrics(meta, width, preset.padX)
  const legendLayout = legendMetrics(legend, width, preset.padX)
  const padTop = Math.max(preset.padTop, headerFinal.padTop)
  const padBottom = Math.max(preset.padBottom, legendLayout.padBottom)
  const height = Math.ceil(boundsH + padTop + padBottom)

  /*
   * 精确对齐画布，让标题和图例能按像素定位。
   *
   * graph 系列会把节点范围等比适配到视图区，四周默认还留 10% 边距，
   * 所以坐标不是 1:1。把边距设为 0 能得到 1:1，但这时 x/y 会各自拉伸填满画布，
   * 圆形节点会被压成椭圆。于是补两个隐形角标节点，把数据范围正好撑成画布大小，
   * 两个方向的缩放比就都是 1，既不变形也不偏移。
   */
  // 画布被标题撑宽时，多出来的宽度要平分到两侧，否则图会被横向拉伸
  const extraX = (width - (boundsW + preset.padX * 2)) / 2
  const anchors = [
    [bounds.minX - preset.padX - extraX, bounds.minY - padTop],
    [bounds.maxX + preset.padX + extraX, bounds.maxY + padBottom],
  ].map(([x, y], i) => ({
    id: `__anchor_${i}`,
    x,
    y,
    symbolSize: 0.01,
    silent: true,
    itemStyle: { opacity: 0 },
    label: { show: false },
  }))

  const graphic = [
    ...buildHeader(meta, headerFinal.lines, width, preset.padX),
    ...buildLegend(legendLayout.rows, width, height, preset.padX),
  ]

  const option = {
    animation: false,
    backgroundColor: '#ffffff',
    textStyle: { fontFamily: FONT_FAMILY },
    graphic,
    series: [
      {
        id: 'kg-graph',
        type: 'graph',
        layout: 'none',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        zoom: 1,
        roam: false,
        draggable: false,
        animation: false,
        data: [...nodes, ...anchors],
        links: vertical ? verticalLinks(links, nodes) : links,
        label: { show: true },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 6],
        lineStyle: { color: '#cbd5e1', curveness: 0 },
      },
    ],
  }

  // 概览与详细视图的正文标签字号不同，取实际用到的最小值来估算
  const labelSizes = nodes
    .map((n) => n.label?.fontSize)
    .filter((v) => typeof v === 'number')
  const minLabel = labelSizes.length ? Math.min(...labelSizes) : 10

  return {
    option,
    width,
    height,
    bounds,
    legend,
    maxPerRow,
    nodeCount: nodes.length,
    edgeCount: links.length,
    wordPointSize: estimatePointSize(width, minLabel),
    wordPointSizeLandscape: estimatePointSize(width, minLabel, 257),
  }
}

module.exports = {
  PRESETS,
  VIEW_LABELS,
  FONT_FAMILY,
  getPreset,
  buildOption,
  compactColumns,
  estimatePointSize,
  layoutVertical,
  chooseMaxPerRow,
}
