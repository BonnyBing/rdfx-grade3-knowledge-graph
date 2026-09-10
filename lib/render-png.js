/**
 * 出图管线：共用布局 -> ECharts 服务端渲染成 SVG -> resvg 转 PNG。
 *
 * 全程不启动浏览器，一次调用几百毫秒，也就没有白图、超时、时序错乱这些问题。
 * 中文字体必须随包携带，服务器上没有预装中文字体，否则汉字会变成方框。
 */

const fs = require('node:fs')
const path = require('node:path')
const echarts = require('echarts')
const { Resvg } = require('@resvg/resvg-js')

const GraphCore = require('../public/graph-core.js')
const profile = require('./profile-word.js')

const FONT_DIR = path.join(__dirname, '../assets/fonts')
const FONT_FILES = [
  'NotoSansSC-Regular.otf',
  'NotoSansSC-Bold.otf',
]
  .map((f) => path.join(FONT_DIR, f))
  .filter((f) => fs.existsSync(f))

const DATA_FILE = path.join(__dirname, '../public/data.json')
const BASELINE_FILE = path.join(__dirname, '../public/data.baseline.json')

// 环境变量 GRAPH_DATA_URL 指向云端 data.json 时，出图会用云端的最新数据
const REMOTE_URL = process.env.GRAPH_DATA_URL || ''
const REMOTE_TTL_MS = 5 * 60 * 1000

let localData = null
let remoteCache = { data: null, at: 0 }

/** 数据内容指纹，用来给图片链接分版本：数据变了链接就变，旧链接的图保持不变 */
function revisionOf(data) {
  const seed = `${data?.metadata?.version || ''}|${data?.nodes?.length || 0}|${
    data?.edges?.length || 0
  }|${data?.metadata?.updated_at || data?.metadata?.date || ''}`
  let h = 5381
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0
  return (h >>> 0).toString(36).slice(0, 6)
}

/** 随包的图谱数据，永远可用 */
function loadGraphData() {
  if (localData) return localData
  const file = fs.existsSync(DATA_FILE) ? DATA_FILE : BASELINE_FILE
  localData = JSON.parse(fs.readFileSync(file, 'utf8'))
  return localData
}

/**
 * 优先用云端最新数据，失败就回退到随包数据。
 * 老师在页面上改完并同步后，出图能跟上，同时网络异常也不会让出图失败。
 */
async function loadGraphDataFresh() {
  if (!REMOTE_URL) return loadGraphData()
  if (remoteCache.data && Date.now() - remoteCache.at < REMOTE_TTL_MS) {
    return remoteCache.data
  }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(REMOTE_URL, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (!Array.isArray(json?.nodes) || !json.nodes.length) {
      throw new Error('云端数据格式不对')
    }
    remoteCache = { data: json, at: Date.now() }
    return json
  } catch {
    return loadGraphData()
  }
}

/** 各视图的默认筛选条件，与页面 applyLensAndScope 保持一致 */
function viewDefaults(view, data, showAllDetail, lens = 'structure') {
  const overview = [...GraphCore.OVERVIEW_TYPES]
  const effectiveLens = view === 'cross' ? 'cross' : lens
  const scope = view === 'cross' ? 'all' : view

  if (effectiveLens === 'progression') {
    return {
      layoutMode: 'progression',
      lens: 'progression',
      activeTypes: ['knowledge'],
      activeRelations: ['prerequisite_of'],
    }
  }
  if (effectiveLens === 'standards') {
    return {
      layoutMode: 'standards',
      lens: 'standards',
      activeTypes: ['knowledge', 'standard'],
      activeRelations: ['aligns_to'],
    }
  }
  if (effectiveLens === 'cross') {
    return {
      layoutMode: 'overview',
      lens: 'cross',
      activeTypes: [...overview, 'lesson', 'knowledge', 'method'],
      activeRelations: ['contains', 'teaches', 'uses_method', 'cross_links'],
    }
  }
  if (scope === 'math' || scope === 'science') {
    return {
      layoutMode: 'hierarchy',
      lens: 'structure',
      activeTypes: data.node_types.filter(
        (t) => t !== 'cross_disciplinary_theme',
      ),
      activeRelations: ['contains', 'teaches', 'uses_method'],
    }
  }
  if (showAllDetail) {
    return {
      layoutMode: 'hierarchy',
      lens: 'structure',
      activeTypes: data.node_types,
      activeRelations: data.relation_types,
    }
  }
  return {
    layoutMode: 'overview',
    lens: 'structure',
    activeTypes: [...overview, 'knowledge', 'method'],
    activeRelations: ['contains', 'teaches', 'uses_method', 'cross_links'],
  }
}

/**
 * 算出布局和 option，但不生成图片。
 * 出图接口只需要返回链接和图的规模，没必要为此渲染一遍 PNG。
 *
 * data / viewOverrides / metaOverride 只给批量出图脚本用：
 * 脚本要画的子图（如「两个知识点的跨学科关联」）是自己裁出来的，
 * 走同一套布局和样式才能保证图库里的图和接口出的图长得一样。
 */
async function prepare(params = {}) {
  const {
    view = 'all',
    lens = 'structure',
    detail = false,
    lessons = false,
    focus = null,
    depth = 2,
    search = '',
    preset = 'word',
    scale = 2,
    data: injectedData = null,
    viewOverrides = null,
    metaOverride = null,
    maxPerRow = null,
    presetOverrides = null,
    highlight = null,
  } = params

  const data = injectedData || (await loadGraphDataFresh())
  const defaults = {
    ...viewDefaults(view, data, detail, lens),
    ...(viewOverrides || {}),
  }
  const presetConf = presetOverrides
    ? { ...profile.getPreset(preset), ...presetOverrides }
    : profile.getPreset(preset)

  const effectiveLens = defaults.lens || lens
  const scopeView = view === 'cross' ? 'all' : view

  const core = GraphCore.create(data, {
    view: scopeView,
    lens: effectiveLens,
    layoutMode: defaults.layoutMode,
    showAllDetail: detail,
    showScienceLessons: lessons,
    searchQuery: search,
    activeTypes: defaults.activeTypes,
    activeRelations: defaults.activeRelations,
    focus,
    depth,
    layoutOverrides: presetConf.layoutOverrides,
  })

  const model = core.buildGraphData()
  if (!model.nodes.length) {
    throw new Error('筛选条件下没有任何节点，请放宽 view / focus / search')
  }

  const focusNode = focus ? core.nodeMap[focus] : null
  const meta = data.metadata || {}
  const lensLabel = profile.LENS_LABELS?.[effectiveLens] || effectiveLens
  const scopeLabel = profile.VIEW_LABELS[scopeView] || scopeView
  const built = profile.buildOption(core, model, {
    preset: presetOverrides ? presetConf : preset,
    // 子图是调用方自己裁好的，focus 只用来标出图是围绕谁展开的
    focus: highlight || focus,
    maxPerRow,
    meta: {
      title: meta.title,
      version: meta.version,
      date: new Date().toISOString().slice(0, 10),
      viewLabel:
        `${lensLabel} · ${scopeLabel}` + (detail ? '（含详细节点）' : ''),
      focusName: focusNode ? focusNode.name : '',
      ...(metaOverride || {}),
    },
  })

  return {
    built,
    info: {
      view: scopeView,
      lens: effectiveLens,
      detail,
      lessons,
      focus,
      focus_name: focusNode ? focusNode.name : null,
      depth: focus ? depth : null,
      preset,
      scale,
      max_per_row: built.maxPerRow,
      width: Math.round(built.width * scale),
      height: Math.round(built.height * scale),
      logical_width: built.width,
      logical_height: built.height,
      node_count: built.nodeCount,
      edge_count: built.edgeCount,
      word_point_size: built.wordPointSize,
      word_point_size_landscape: built.wordPointSizeLandscape,
      graph_title: meta.title || '知识图谱',
      graph_version: meta.version || null,
      revision: revisionOf(data),
    },
  }
}

/** ECharts 服务端渲染出 SVG，再由 resvg 栅格化成 PNG */
function rasterize(built, scale) {
  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: built.width,
    height: built.height,
  })
  chart.setOption(built.option)
  const svg = chart.renderToSVGString()
  chart.dispose()

  const resvg = new Resvg(svg, {
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: profile.FONT_FAMILY,
    },
    fitTo: { mode: 'width', value: Math.round(built.width * scale) },
    background: '#ffffff',
  })
  return { png: resvg.render().asPng(), svg }
}

/**
 * @param {object} params 归一化后的出图参数
 * @returns {Promise<{ png: Buffer, svg: string, info: object }>}
 */
async function renderGraph(params = {}) {
  const { built, info } = await prepare(params)
  const { png, svg } = rasterize(built, info.scale)
  return { png, svg, info }
}

/** 只要图的规模与可读性信息，不生成图片 */
async function measureGraph(params = {}) {
  return (await prepare(params)).info
}

/** 出错时也返回一张图。链接是直接插进文档的，返回 JSON 会显示成破图 */
function renderErrorImage(message, width = 900) {
  const height = 260
  const lines = String(message).match(/.{1,26}/g) || ['未知错误']
  const text = lines
    .slice(0, 4)
    .map(
      (l, i) =>
        `<text x="48" y="${132 + i * 30}" font-family="${profile.FONT_FAMILY}" font-size="19" fill="#b91c1c">${l
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</text>`,
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<rect width="${width}" height="${height}" fill="#fff7f7" stroke="#fecaca" stroke-width="2"/>
<text x="48" y="76" font-family="${profile.FONT_FAMILY}" font-size="24" font-weight="bold" fill="#991b1b">知识图谱出图失败</text>
${text}</svg>`
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: profile.FONT_FAMILY,
    },
    background: '#fff7f7',
  })
  return resvg.render().asPng()
}

module.exports = {
  renderGraph,
  measureGraph,
  renderErrorImage,
  loadGraphData,
  loadGraphDataFresh,
  revisionOf,
  viewDefaults,
  FONT_FILES,
}
