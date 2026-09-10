/**
 * 跨学科关系查询 + 创建子图快照。
 * POST /api/cross-query
 */

const { applyCors, sendJson, readParams, baseUrl } = require('../lib/respond.js')
const { checkApiKey } = require('../lib/auth.js')
const { emptyBase, withStatus } = require('../lib/contract.js')
const { queryCrossRelations } = require('../lib/cross-relations.js')
const { graphVersion, contentHash } = require('../lib/graph-meta.js')
const { saveSnapshot } = require('../lib/snapshot-store.js')
const { loadGraphDataFresh } = require('../lib/render-png.js')

module.exports = async function handler(req, res) {
  applyCors(res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  const base = emptyBase({
    matches: [],
    matched_nodes: [],
    unmatched_queries: [],
    candidate_subjects: [],
    relations: [],
    evidence_paths: [],
    sources: [],
    snapshot_id: '',
    image_status: 'not_requested',
    image_url: '',
    image_markdown: '',
    page_url: '',
    image_message: '',
    truncated: false,
  })

  const auth = checkApiKey(req)
  if (!auth.ok) {
    return sendJson(res, 200, withStatus(base, 'error', auth.error))
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
        withStatus(base, 'error', `图谱数据源不可用：${e.message || e}`),
      )
    }

    base.graph_version = graphVersion(data)

    const result = queryCrossRelations(
      {
        main_node_ids: raw.main_node_ids,
        candidate_subjects: raw.candidate_subjects,
        graph_version: raw.graph_version,
      },
      data,
    )

    if (result.status === 'invalid_input' || result.status === 'out_of_scope') {
      return sendJson(
        res,
        200,
        withStatus(
          {
            ...base,
            warnings: result.warnings || [],
            unmatched_queries: result.unmatched_queries || [],
          },
          result.status,
          result.message,
        ),
      )
    }

    if (result.status === 'no_relation') {
      return sendJson(
        res,
        200,
        withStatus(
          {
            ...base,
            warnings: result.warnings || [],
            matched_nodes: result.matched_nodes || [],
            unmatched_queries: result.unmatched_main_node_ids || [],
            candidate_subjects: [],
            relations: [],
            evidence_paths: [],
            sources: [],
            truncated: false,
          },
          'no_relation',
          result.message,
        ),
      )
    }

    let snapshot
    try {
      snapshot = await saveSnapshot({
        graph_version: base.graph_version,
        graph_content_hash: contentHash(data),
        main_node_ids: raw.main_node_ids,
        candidate_subjects: raw.candidate_subjects || [],
        matched_nodes: result.matched_nodes,
        unmatched_main_node_ids: result.unmatched_main_node_ids,
        candidate_subjects_result: result.candidate_subjects,
        relations: result.relations,
        evidence_paths: result.evidence_paths,
        sources: result.sources,
        subgraph: result.subgraph,
        display: {
          title: result.subgraph?.metadata?.title || '',
          view_label: '跨学科关联子图',
        },
        image_id: '',
        image_blob_url: '',
        selected_relation_ids: [],
      })
    } catch (e) {
      if (e.code === 'storage_unavailable') {
        return sendJson(
          res,
          200,
          withStatus(
            {
              ...base,
              warnings: [
                ...(result.warnings || []),
                e.message,
              ],
              matched_nodes: result.matched_nodes || [],
              unmatched_queries: result.unmatched_main_node_ids || [],
              candidate_subjects: result.candidate_subjects || [],
              relations: result.relations || [],
              evidence_paths: result.evidence_paths || [],
              sources: result.sources || [],
              truncated: !!result.truncated,
            },
            'error',
            `关系已算出，但快照无法保存：${e.message}`,
          ),
        )
      }
      throw e
    }

    const baseSite = baseUrl(req)
    const page_url = `${baseSite}/s/${snapshot.snapshot_id}`

    return sendJson(
      res,
      200,
      withStatus(
        {
          ...base,
          warnings: [
            ...(result.warnings || []),
            ...(result.truncate_message ? [result.truncate_message] : []),
          ],
          matched_nodes: result.matched_nodes || [],
          unmatched_queries: result.unmatched_main_node_ids || [],
          candidate_subjects: result.candidate_subjects || [],
          relations: result.relations || [],
          evidence_paths: result.evidence_paths || [],
          sources: result.sources || [],
          snapshot_id: snapshot.snapshot_id,
          page_url,
          image_status: 'not_requested',
          image_url: '',
          image_markdown: '',
          image_message: '',
          truncated: !!result.truncated || !!result.subgraph?.truncated,
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
