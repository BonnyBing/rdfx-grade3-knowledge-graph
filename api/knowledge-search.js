/**
 * 知识点查询：供智启先匹配真实知识点，再交给教师确认。
 * POST /api/knowledge-search
 */

const { applyCors, sendJson, readParams } = require('../lib/respond.js')
const { checkApiKey } = require('../lib/auth.js')
const { emptyBase, withStatus } = require('../lib/contract.js')
const { resolveScope } = require('../lib/scope.js')
const { searchKnowledge, clampLimit } = require('../lib/knowledge-search.js')
const { graphVersion } = require('../lib/graph-meta.js')
const { loadGraphDataFresh } = require('../lib/render-png.js')

module.exports = async function handler(req, res) {
  applyCors(res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  const base = emptyBase()
  const auth = checkApiKey(req)
  if (!auth.ok) {
    return sendJson(
      res,
      200,
      withStatus(base, 'error', auth.error),
    )
  }

  try {
    const raw = readParams(req)
    let data
    try {
      data = await loadGraphDataFresh()
    } catch (e) {
      return sendJson(
        res,
        200,
        withStatus(
          { ...base, graph_version: '' },
          'error',
          `图谱数据源不可用：${e.message || e}`,
        ),
      )
    }

    base.graph_version = graphVersion(data)

    const scope = resolveScope({
      main_subject: raw.main_subject,
      grade: raw.grade,
      semester: raw.semester,
    })
    if (!scope.ok) {
      return sendJson(
        res,
        200,
        withStatus(
          {
            ...base,
            warnings: scope.warnings,
            matches: [],
            matched_nodes: [],
            unmatched_queries: [],
            image_status: 'not_requested',
            image_url: '',
            image_markdown: '',
            page_url: '',
            image_message: '',
            truncated: false,
          },
          scope.status,
          scope.message,
        ),
      )
    }

    const result = searchKnowledge(
      {
        main_subject: scope.scope.main_subject,
        query: raw.query,
        query_terms: raw.query_terms,
        limit: clampLimit(raw.limit),
        scope_label: scope.scope.label,
      },
      data,
    )

    return sendJson(
      res,
      200,
      withStatus(
        {
          ...base,
          warnings: [...scope.warnings, ...(result.warnings || [])],
          matches: result.matches || [],
          matched_nodes: result.matched_nodes || [],
          unmatched_queries: result.unmatched_queries || [],
          scope: scope.scope,
          image_status: 'not_requested',
          image_url: '',
          image_markdown: '',
          page_url: '',
          image_message: '',
          truncated: false,
        },
        result.status,
        result.message,
      ),
    )
  } catch (err) {
    return sendJson(
      res,
      200,
      withStatus(base, 'error', String(err.message || err)),
    )
  }
}
