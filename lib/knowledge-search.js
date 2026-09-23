/**
 * 知识点查询：范围限定 + 标准名/ID/别名/关键词/模糊匹配。
 * 分数仅用于排序，不是语义置信度。
 */

const params = require('./params.js')
const { subjectOfNodeId, subjectKeyOfNodeId } = require('./scope.js')
const { loadAliases } = require('./graph-meta.js')
const GraphCore = require('../public/graph-core.js')

const SEARCHABLE_TYPES = new Set([
  'knowledge',
  'method',
  'unit',
  'lesson',
  'domain',
])

const LIMITS = {
  max_query_len: 80,
  max_terms: 12,
  max_limit: 10,
  default_limit: 5,
}

function clampLimit(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return LIMITS.default_limit
  return Math.min(LIMITS.max_limit, Math.max(1, Math.round(v)))
}

function nodeScopeLabel(node, graphMeta) {
  const grade = node?.grade || '三年级'
  const semester = node?.semester || graphMeta?.semester || '上册'
  const subject = subjectOfNodeId(node.id)
  return {
    grade,
    semester,
    subject,
    label: `${grade}${semester}·${subject || '未分类'}`,
  }
}

function buildAliasIndex(aliasesDoc, nodeMap) {
  const byAlias = []
  const byKeyword = []
  for (const entry of aliasesDoc.entries || []) {
    const node = nodeMap.get(entry.node_id)
    if (!node) continue
    for (const a of entry.aliases || []) {
      byAlias.push({
        node_id: entry.node_id,
        text: a,
        norm: params.normalizeText(a),
      })
    }
    for (const k of entry.keywords || []) {
      byKeyword.push({
        node_id: entry.node_id,
        text: k,
        norm: params.normalizeText(k),
      })
    }
  }
  return { byAlias, byKeyword }
}

function filterBySubject(nodes, mainSubject) {
  if (!mainSubject) return nodes
  const key =
    mainSubject === '数学' ? 'math' : mainSubject === '科学' ? 'science' : null
  if (!key) return nodes
  return nodes.filter((n) => subjectKeyOfNodeId(n.id) === key)
}

function scoreCandidate({
  match_method,
  score,
  hit_term,
  reason,
  definite,
  node,
  graphMeta,
}) {
  return {
    node_id: node.id,
    name: node.name,
    type: node.type,
    type_label: GraphCore.TYPE_LABELS?.[node.type] || node.type,
    status: node.status || '',
    scope: nodeScopeLabel(node, graphMeta),
    hit_term,
    match_method,
    score: Math.round(score * 1000) / 1000,
    match_reason: reason,
    definite: !!definite,
    needs_confirmation: !definite,
  }
}

/**
 * 对单个查询词在已限定范围内匹配。
 */
function matchOneTerm(term, graphData, opts = {}) {
  const limit = clampLimit(opts.limit)
  const mainSubject = opts.main_subject || null
  const graphMeta = graphData.metadata || {}
  const qRaw = String(term || '').trim().slice(0, LIMITS.max_query_len)
  const q = params.normalizeText(qRaw)
  if (!q) {
    return {
      query_term: qRaw,
      status: 'invalid_input',
      message: '查询词为空',
      candidates: [],
    }
  }

  const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]))
  let pool = graphData.nodes.filter((n) => SEARCHABLE_TYPES.has(n.type))
  pool = filterBySubject(pool, mainSubject)
  if (opts.grade || opts.semester) {
    pool = pool.filter((n) => {
      const g = n.grade || '三年级'
      const s = n.semester || '上册'
      if (opts.grade && g !== opts.grade) return false
      if (opts.semester && s !== opts.semester) return false
      return true
    })
  }
  const poolIds = new Set(pool.map((n) => n.id))

  const aliasesDoc = opts.aliasesDoc || loadAliases()
  const aliasIndex = buildAliasIndex(aliasesDoc, nodeMap)

  const candidates = []
  const push = (c) => {
    const existing = candidates.find((x) => x.node_id === c.node_id)
    if (existing) {
      if (c.score > existing.score) Object.assign(existing, c)
      return
    }
    candidates.push(c)
  }

  // 1) 精确节点 ID
  const byId = pool.find((n) => n.id === qRaw || params.normalizeText(n.id) === q)
  if (byId) {
    push(
      scoreCandidate({
        match_method: 'exact_id',
        score: 1,
        hit_term: qRaw,
        reason: `节点 ID 精确匹配：${byId.id}`,
        definite: true,
        node: byId,
        graphMeta,
      }),
    )
  }

  // 2) 标准名称精确匹配
  for (const n of pool) {
    if (params.normalizeText(n.name) === q) {
      push(
        scoreCandidate({
          match_method: 'exact_name',
          score: 0.99,
          hit_term: n.name,
          reason: `标准名称精确匹配：「${n.name}」`,
          definite: true,
          node: n,
          graphMeta,
        }),
      )
    }
  }

  // 3) 可靠别名精确匹配
  for (const a of aliasIndex.byAlias) {
    if (a.norm !== q) continue
    const n = nodeMap.get(a.node_id)
    if (!n || !poolIds.has(n.id)) continue
    push(
      scoreCandidate({
        match_method: 'alias',
        score: 0.96,
        hit_term: a.text,
        reason: `别名精确匹配：「${a.text}」→「${n.name}」`,
        definite: true,
        node: n,
        graphMeta,
      }),
    )
  }

  // 4) 关键词包含（需确认）
  for (const k of aliasIndex.byKeyword) {
    if (!k.norm || k.norm.length < 2) continue
    if (!(q.includes(k.norm) || k.norm.includes(q))) continue
    const n = nodeMap.get(k.node_id)
    if (!n || !poolIds.has(n.id)) continue
    const score =
      q === k.norm ? 0.88 : q.includes(k.norm) ? 0.8 : 0.72
    push(
      scoreCandidate({
        match_method: 'keyword',
        score,
        hit_term: k.text,
        reason: `关键词匹配：「${k.text}」，对应「${n.name}」，需教师确认`,
        definite: false,
        node: n,
        graphMeta,
      }),
    )
  }

  // 5) 模糊：名称包含 / 被包含 / LCS（需确认）
  for (const n of pool) {
    const name = params.normalizeText(n.name)
    let score = 0
    let reason = ''
    if (q.includes(name) && name.length >= 2) {
      score = 0.86
      reason = `查询包含标准名称片段「${n.name}」`
    } else if (name.includes(q) && q.length >= 2) {
      score = 0.78
      reason = `标准名称包含查询词「${qRaw}」`
    } else {
      const lcs = longestCommonSubstr(q, name)
      if (lcs >= 3) {
        score = (lcs / Math.max(name.length, 1)) * 0.7
        reason = `与标准名称有较长公共片段（长度 ${lcs}）`
      }
    }
    if (score > 0.35) {
      push(
        scoreCandidate({
          match_method: 'fuzzy',
          score,
          hit_term: qRaw,
          reason: `${reason}，属模糊匹配，需教师确认`,
          definite: false,
          node: n,
          graphMeta,
        }),
      )
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh'))
  const top = candidates.slice(0, limit)

  if (!top.length) {
    return {
      query_term: qRaw,
      status: 'not_found',
      message: `未在「${opts.scope_label || '本图谱'}」范围内找到与「${qRaw}」匹配的知识点。活动主题或口语描述若无法对应到真实知识点，请先由智启拆解后再查。`,
      candidates: [],
    }
  }

  const definiteOnes = top.filter((c) => c.definite)
  const uniqueDefinite = [...new Set(definiteOnes.map((c) => c.node_id))]

  // 唯一明确匹配
  if (uniqueDefinite.length === 1 && definiteOnes[0].score >= 0.96) {
    const best = definiteOnes[0]
    // 若同时存在其他高分模糊候选，仍标 ambiguous
    const rivals = top.filter(
      (c) => c.node_id !== best.node_id && c.score >= 0.75,
    )
    if (rivals.length) {
      return {
        query_term: qRaw,
        status: 'ambiguous',
        message: `「${qRaw}」有明确候选「${best.name}」，但仍有相近知识点，请确认`,
        candidates: top,
      }
    }
    return {
      query_term: qRaw,
      status: 'success',
      message: '',
      candidates: top,
      matched_node_id: best.node_id,
    }
  }

  if (uniqueDefinite.length > 1 || top.length > 1) {
    return {
      query_term: qRaw,
      status: 'ambiguous',
      message: `「${qRaw}」匹配到 ${top.length} 个候选，请确认标准名称`,
      candidates: top,
    }
  }

  // 仅一个模糊候选
  return {
    query_term: qRaw,
    status: 'ambiguous',
    message: `「${qRaw}」为模糊匹配，请确认是否为「${top[0].name}」`,
    candidates: top,
  }
}

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

/**
 * 多词查询入口。
 */
function searchKnowledge(input, graphData) {
  const {
    main_subject,
    grade,
    semester,
    query,
    query_terms,
    limit,
    scope_label,
  } = input

  const terms = []
  if (Array.isArray(query_terms)) {
    for (const t of query_terms) {
      const s = String(t || '').trim()
      if (s) terms.push(s.slice(0, LIMITS.max_query_len))
    }
  }
  if (query && String(query).trim()) {
    const q = String(query).trim().slice(0, LIMITS.max_query_len)
    if (!terms.includes(q)) terms.unshift(q)
  }

  if (!terms.length) {
    return {
      status: 'invalid_input',
      message: '请提供 query 或 query_terms（知识点候选词）。接口不会把活动主题自行当成课程知识点。',
      matches: [],
      matched_nodes: [],
      unmatched_queries: [],
    }
  }

  if (terms.length > LIMITS.max_terms) {
    return {
      status: 'invalid_input',
      message: `一次最多查询 ${LIMITS.max_terms} 个词，当前 ${terms.length} 个`,
      matches: [],
      matched_nodes: [],
      unmatched_queries: terms,
    }
  }

  const aliasesDoc = loadAliases()
  const matches = terms.map((term) =>
    matchOneTerm(term, graphData, {
      main_subject,
      grade,
      semester,
      limit,
      scope_label,
      aliasesDoc,
    }),
  )

  const matched_nodes = []
  const unmatched_queries = []
  const seenNodes = new Set()

  for (const m of matches) {
    if (m.status === 'not_found' || m.status === 'invalid_input') {
      unmatched_queries.push(m.query_term)
      continue
    }
    if (m.matched_node_id) {
      const c = m.candidates.find((x) => x.node_id === m.matched_node_id)
      if (c && !seenNodes.has(c.node_id)) {
        seenNodes.add(c.node_id)
        matched_nodes.push(c)
      }
    }
  }

  const anyAmbiguous = matches.some((m) => m.status === 'ambiguous')
  const anyFound = matches.some(
    (m) => m.status === 'success' || m.status === 'ambiguous',
  )
  const allSuccess = matches.every((m) => m.status === 'success')
  const allMissing = matches.every(
    (m) => m.status === 'not_found' || m.status === 'invalid_input',
  )

  let status = 'success'
  let message = ''
  if (allMissing) {
    status = 'not_found'
    message = '所有查询词均未匹配到本范围内的知识点'
  } else if (anyAmbiguous && unmatched_queries.length) {
    status = 'partial'
    message = '部分查询词需确认或未匹配，请查看 matches'
  } else if (anyAmbiguous) {
    status = 'ambiguous'
    message = '存在需教师确认的候选知识点'
  } else if (unmatched_queries.length && anyFound) {
    status = 'partial'
    message = '部分查询词已明确匹配，部分未找到'
  } else if (allSuccess) {
    status = 'success'
    message = ''
  }

  return {
    status,
    message,
    matches,
    matched_nodes,
    unmatched_queries,
  }
}

module.exports = {
  LIMITS,
  searchKnowledge,
  matchOneTerm,
  clampLimit,
}
