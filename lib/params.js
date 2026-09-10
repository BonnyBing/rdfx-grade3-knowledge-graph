/**
 * 出图参数的归一化、编码，以及把自然语言问法解析成节点。
 *
 * 图片链接里带的是参数本身而不是存储 ID：
 * 收到请求当场算图，不落任何存储，所以链接永久有效、不必配置图床或令牌。
 */

const VIEWS = ['all', 'math', 'science', 'cross']
const PRESETS = ['word', 'word-landscape', 'screen']

const DEFAULTS = {
  view: 'all',
  detail: false,
  lessons: false,
  focus: null,
  depth: 2,
  search: '',
  preset: 'word',
  scale: 2,
  rev: '',
}

function toBool(v) {
  if (typeof v === 'boolean') return v
  if (v == null) return false
  const s = String(v).toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
}

function clamp(n, min, max, fallback) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, v))
}

/** 把各种来源的原始入参收敛成一组合法参数 */
function normalize(raw = {}) {
  const view = VIEWS.includes(raw.view) ? raw.view : DEFAULTS.view
  const preset = PRESETS.includes(raw.preset) ? raw.preset : DEFAULTS.preset
  return {
    view,
    detail: toBool(raw.detail),
    lessons: toBool(raw.lessons),
    focus: raw.focus ? String(raw.focus).trim().slice(0, 64) : null,
    depth: Math.round(clamp(raw.depth, 1, 4, DEFAULTS.depth)),
    search: raw.search ? String(raw.search).trim().slice(0, 40) : '',
    preset,
    scale: clamp(raw.scale, 1, 4, DEFAULTS.scale),
    // 数据版本，不参与渲染，只让数据更新后的链接与旧链接区分开
    rev: raw.rev ? String(raw.rev).slice(0, 12) : '',
  }
}

// 编码时用短键，URL 才不至于太长
const KEY_MAP = {
  view: 'v',
  detail: 't',
  lessons: 'l',
  focus: 'f',
  depth: 'd',
  search: 'q',
  preset: 'p',
  scale: 'x',
  rev: 'r',
}

/** 只编码与默认值不同的项，默认参数的链接因此非常短 */
function encode(params) {
  const p = normalize(params)
  const obj = {}
  Object.entries(KEY_MAP).forEach(([long, short]) => {
    if (p[long] !== DEFAULTS[long] && p[long] !== null && p[long] !== '') {
      obj[short] = typeof p[long] === 'boolean' ? 1 : p[long]
    }
  })
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
}

function decode(token) {
  let obj
  try {
    obj = JSON.parse(Buffer.from(String(token), 'base64url').toString('utf8'))
  } catch {
    throw new Error('图片链接无法识别，请重新调用出图接口获取链接')
  }
  if (!obj || typeof obj !== 'object') throw new Error('图片链接参数为空')
  const raw = {}
  Object.entries(KEY_MAP).forEach(([long, short]) => {
    if (obj[short] !== undefined) raw[long] = obj[short]
  })
  return normalize(raw)
}

/** 拼出交互页面的深链，参数与图片保持一致 */
function pageQuery(params) {
  const p = normalize(params)
  const qs = new URLSearchParams()
  if (p.view !== DEFAULTS.view) qs.set('view', p.view)
  if (p.detail) qs.set('detail', '1')
  if (p.lessons) qs.set('lessons', '1')
  if (p.focus) qs.set('focus', p.focus)
  if (p.search) qs.set('search', p.search)
  const s = qs.toString()
  return s ? `?${s}` : ''
}

// ---- 自然语言解析 ----

const CN_NUM = {
  一: '1',
  二: '2',
  三: '3',
  四: '4',
  五: '5',
  六: '6',
  七: '7',
  八: '8',
  九: '9',
  十: '10',
}

/** 统一大小写、全角半角、中文数字，让「第1单元」也能匹配「第一单元」 */
function normalizeText(s) {
  let t = String(s || '')
    .toLowerCase()
    .replace(/[\uff01-\uff5e]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[\s\u3000]+/g, '')
    .replace(/[·、，,。．.：:；;（）()【】\[\]“”"'’‘?？!！/\\|-]/g, '')
  t = t.replace(/第([一二三四五六七八九十]+)/g, (_, d) => {
    const digits = [...d].map((c) => CN_NUM[c] || c).join('')
    return `第${digits}`
  })
  return t
}

const SUBJECT_HINTS = [
  { view: 'cross', words: ['跨学科', '学科融合', '跨科'] },
  { view: 'math', words: ['数学', '算数', '运算'] },
  { view: 'science', words: ['科学', '自然'] },
]

/** 从问法里判断该用哪个视图 */
function guessView(text) {
  const t = normalizeText(text)
  for (const hint of SUBJECT_HINTS) {
    if (hint.words.some((w) => t.includes(normalizeText(w)))) return hint.view
  }
  return null
}

// 越具体的层级越可能是用户想聚焦的对象
const TYPE_WEIGHT = {
  unit: 1.0,
  knowledge: 0.98,
  lesson: 0.94,
  method: 0.92,
  domain: 0.86,
  cross_disciplinary_theme: 0.86,
  standard: 0.7,
  competency: 0.7,
  subject: 0.6,
}

/** 两段文本的字符重合度，用于兜底打分 */
function overlapScore(a, b) {
  if (!a.length || !b.length) return 0
  const setB = new Set(b)
  let hit = 0
  for (const ch of new Set(a)) if (setB.has(ch)) hit++
  return hit / new Set(a).size
}

/**
 * 最长公共子串长度。
 * 「三年级上册数学第1单元」这类带修饰的问法和节点名不互相包含，
 * 但共有「第1单元」这段，靠它才能匹配上。
 */
function longestCommonSubstr(a, b) {
  if (!a.length || !b.length) return 0
  let best = 0
  const dp = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    let prev = 0
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : 0
      if (dp[j] > best) best = dp[j]
      prev = tmp
    }
  }
  return best
}

/** 学科归属，用于按问法里的学科提示加权 */
function subjectOf(id) {
  if (id.startsWith('X-')) return 'cross'
  if (id.startsWith('M')) return 'math'
  if (id.startsWith('S')) return 'science'
  return 'other'
}

/**
 * 把自然语言问法匹配到图谱节点。
 * 先按 ID、完整包含、被包含逐级判定，都不中再看最长公共子串和字符重合度。
 */
function matchNodes(text, graphData, limit = 5, preferView = null) {
  const q = normalizeText(text)
  if (!q) return []

  const scored = graphData.nodes.map((n) => {
    const name = normalizeText(n.name)
    const id = normalizeText(n.id)
    let score = 0

    if (id === q || name === q) score = 1
    else if (q.includes(name) && name.length >= 2) score = 0.9
    else if (name.includes(q) && q.length >= 2) score = 0.82
    else if (id.includes(q) && q.length >= 3) score = 0.7
    else {
      const lcs = longestCommonSubstr(q, name)
      const lcsScore = lcs >= 2 ? (lcs / name.length) * 0.86 : 0
      score = Math.max(lcsScore, overlapScore(q, name) * 0.5)
    }

    // 名字越短而命中越完整，越可能是用户说的那个
    const lengthBonus = name.length
      ? Math.min(q.length, name.length) / Math.max(q.length, name.length)
      : 0
    score = score * (TYPE_WEIGHT[n.type] ?? 0.8) + lengthBonus * 0.08

    // 问法里点明了学科，同学科的节点优先
    if (preferView && preferView !== 'all') {
      const sub = subjectOf(n.id)
      if (sub === preferView) score *= 1.18
      else if (preferView !== 'cross') score *= 0.72
    }

    return { node: n, score }
  })

  return scored
    .filter((s) => s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      id: s.node.id,
      name: s.node.name,
      type: s.node.type,
      score: Math.round(s.score * 1000) / 1000,
    }))
}

// 这些词说明的是「哪本书、哪个学科」，对定位具体节点没有帮助，先剥掉
const MODIFIER_WORDS = [
  '三年级上册',
  '三年级上',
  '小学三年级',
  '三年级',
  '3年级',
  '上册',
  '上学期',
  '第一学期',
  '数学',
  '科学',
  '跨学科',
  '知识图谱',
  '图谱',
  '知识点',
  '思维导图',
  '课程',
  '教材',
]

function stripModifiers(text) {
  let t = normalizeText(text)
  MODIFIER_WORDS.map(normalizeText).forEach((w) => {
    if (w) t = t.split(w).join('')
  })
  // 去掉连接词和提问句式，剩下的才是真正要找的内容
  t = t.replace(/[的和与及里中在里面关于请帮我看下出张图片一下有哪些是什么怎么样吗呢]/g, '')
  // 只剩一两个虚字时按「没有指定具体节点」处理，避免乱聚焦
  return t.length >= 2 ? t : ''
}

/**
 * 把一句话变成出图参数：认出学科决定视图，认出具体节点作为聚焦点。
 * 只说了学科名（剥掉修饰词后没剩内容）就出整张学科图，不要硬聚焦到某个节点。
 */
function resolveQuery(text, graphData) {
  const view = guessView(text)
  const rest = stripModifiers(text)

  const matches = rest
    ? matchNodes(rest, graphData, 5, view)
    : matchNodes(text, graphData, 5, view)

  const best = matches[0] || null
  let resolvedView = view
  if (!resolvedView && best) {
    const g = subjectOf(best.id)
    if (g === 'math' || g === 'science') resolvedView = g
  }

  // 剥完修饰词没剩下什么，说明用户只想看整个学科
  const focus = rest && best && best.score >= 0.5 ? best.id : null

  return {
    view: resolvedView || 'all',
    focus,
    matches,
    matched_name: focus ? best.name : null,
  }
}

module.exports = {
  VIEWS,
  PRESETS,
  DEFAULTS,
  normalize,
  encode,
  decode,
  pageQuery,
  normalizeText,
  guessView,
  matchNodes,
  resolveQuery,
}
