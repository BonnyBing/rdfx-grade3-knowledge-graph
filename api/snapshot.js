/**
 * 按 snapshot_id 读取已保存的关系与图片信息。
 * GET/POST /api/snapshot
 */

const { applyCors, sendJson, readParams, baseUrl } = require('../lib/respond.js')
const { checkApiKey } = require('../lib/auth.js')
const { emptyBase, withStatus } = require('../lib/contract.js')
const { loadSnapshot } = require('../lib/snapshot-store.js')

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
    const snapshot_id = String(raw.snapshot_id || raw.id || '').trim()
    if (!snapshot_id) {
      return sendJson(
        res,
        200,
        withStatus(base, 'invalid_input', '缺少 snapshot_id'),
      )
    }

    let snapshot
    try {
      snapshot = await loadSnapshot(snapshot_id)
    } catch (e) {
      const st =
        e.code === 'storage_unavailable'
          ? 'error'
          : e.code === 'not_found'
            ? 'not_found'
            : 'invalid_input'
      return sendJson(res, 200, withStatus(base, st, e.message))
    }

    const site = baseUrl(req)
    const hasImage = !!snapshot.image_id
    const image_url = hasImage
      ? snapshot.image_blob_url || `${site}/i/s/${snapshot.image_id}.png`
      : ''
    const alt = snapshot.display?.title || '知识图谱跨学科子图'
    const includeSubgraph =
      raw.include_subgraph === true ||
      raw.include_subgraph === '1' ||
      raw.include_subgraph === 1

    return sendJson(
      res,
      200,
      withStatus(
        {
          ...base,
          graph_version: snapshot.graph_version || '',
          snapshot_id: snapshot.snapshot_id,
          snapshot_content_hash: snapshot.snapshot_content_hash || '',
          matched_nodes: snapshot.matched_nodes || [],
          unmatched_queries: snapshot.unmatched_main_node_ids || [],
          candidate_subjects: snapshot.candidate_subjects_result || [],
          relations: snapshot.relations || [],
          evidence_paths: snapshot.evidence_paths || [],
          sources: snapshot.sources || [],
          selected_relation_ids: snapshot.selected_relation_ids || [],
          subgraph: includeSubgraph
            ? snapshot.render_subgraph || snapshot.subgraph || null
            : null,
          image_status: hasImage ? 'success' : 'not_requested',
          image_url,
          image_markdown: hasImage ? `![${alt}](${image_url})` : '',
          page_url: `${site}/s/${snapshot.snapshot_id}`,
          image_message: hasImage ? '' : '该快照尚未生成图片',
          truncated: false,
          saved_at: snapshot.saved_at || '',
        },
        snapshot.unmatched_main_node_ids?.length ? 'partial' : 'success',
        '',
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
