/**
 * 按快照生成 PNG（可按 relation_id / 学科精简）。
 * POST /api/snapshot-image
 *
 * 只有实际写出 PNG 文件后才返回 image_status=success。
 * 失败时保留快照中的关系结果，不返回“错误提示 PNG”冒充成功。
 */

const { applyCors, sendJson, readParams, baseUrl } = require('../lib/respond.js')
const { checkApiKey } = require('../lib/auth.js')
const { emptyBase, withStatus } = require('../lib/contract.js')
const { filterSubgraphByRelations } = require('../lib/cross-relations.js')
const { normalizeSubject } = require('../lib/scope.js')
const { loadSnapshot, saveImage, saveSnapshot, shortId } = require('../lib/snapshot-store.js')
const { renderGraph } = require('../lib/render-png.js')

function pickSubgraph(snapshot, raw) {
  let relationIds = Array.isArray(raw.relation_ids)
    ? raw.relation_ids.map(String)
    : []
  let subjectFilter = null
  if (raw.subject) {
    subjectFilter = normalizeSubject(raw.subject)
    if (!subjectFilter) {
      const err = new Error(`无效学科过滤「${raw.subject}」`)
      err.code = 'invalid_input'
      throw err
    }
  }

  if (subjectFilter && !relationIds.length) {
    relationIds = (snapshot.relations || [])
      .filter((r) => r.peer_subject === subjectFilter)
      .map((r) => r.relation_id)
    if (!relationIds.length) {
      const err = new Error(`快照中没有指向学科「${subjectFilter}」的关联`)
      err.code = 'no_relation'
      throw err
    }
  }

  if (relationIds.length) {
    // 校验 relation_id 属于快照
    const known = new Set((snapshot.relations || []).map((r) => r.relation_id))
    const bad = relationIds.filter((id) => !known.has(id))
    if (bad.length) {
      const err = new Error(`无效 relation_id（不在快照中）：${bad.join(', ')}`)
      err.code = 'invalid_input'
      throw err
    }
    return {
      subgraph: filterSubgraphByRelations(snapshot, relationIds),
      selected_relation_ids: relationIds,
    }
  }

  return {
    subgraph: snapshot.subgraph,
    selected_relation_ids: (snapshot.relations || []).map((r) => r.relation_id),
  }
}

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
    image_status: 'error',
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
    const snapshot_id = String(raw.snapshot_id || '').trim()
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
      const st = e.code === 'storage_unavailable' ? 'error' : 'invalid_input'
      return sendJson(
        res,
        200,
        withStatus(
          { ...base, snapshot_id, image_status: 'error', image_message: e.message },
          st,
          e.message,
        ),
      )
    }

    base.graph_version = snapshot.graph_version || ''
    base.snapshot_id = snapshot.snapshot_id
    base.matched_nodes = snapshot.matched_nodes || []
    base.relations = snapshot.relations || []
    base.evidence_paths = snapshot.evidence_paths || []
    base.sources = snapshot.sources || []
    base.unmatched_queries = snapshot.unmatched_main_node_ids || []
    base.candidate_subjects = snapshot.candidate_subjects_result || []

    let picked
    try {
      picked = pickSubgraph(snapshot, raw)
    } catch (e) {
      return sendJson(
        res,
        200,
        withStatus(
          {
            ...base,
            image_status: 'error',
            image_message: e.message,
            page_url: `${baseUrl(req)}/s/${snapshot.snapshot_id}`,
          },
          e.code === 'no_relation' ? 'no_relation' : 'invalid_input',
          e.message,
        ),
      )
    }

    const subgraph = picked.subgraph
    if (!subgraph?.nodes?.length) {
      return sendJson(
        res,
        200,
        withStatus(
          {
            ...base,
            image_status: 'error',
            image_message: '子图为空，无法出图',
            page_url: `${baseUrl(req)}/s/${snapshot.snapshot_id}`,
          },
          'error',
          '子图为空，无法出图',
        ),
      )
    }

    // 拒绝客户端擅自塞边：只使用快照内已有节点/边
    const allowedNodes = new Set((snapshot.subgraph.nodes || []).map((n) => n.id))
    for (const n of subgraph.nodes) {
      if (!allowedNodes.has(n.id)) {
        return sendJson(
          res,
          200,
          withStatus(
            { ...base, image_status: 'error', image_message: `节点 ${n.id} 不在快照中` },
            'invalid_input',
            `节点 ${n.id} 不在快照中，拒绝出图`,
          ),
        )
      }
    }

    const focus =
      (snapshot.main_node_ids && snapshot.main_node_ids[0]) ||
      subgraph.nodes.find((n) => n.type === 'knowledge')?.id ||
      null

    let png
    let info
    try {
      const rendered = await renderGraph({
        view: 'cross',
        detail: false,
        lessons: false,
        focus,
        depth: 2,
        preset: raw.preset === 'word-landscape' ? 'word-landscape' : 'word',
        scale: Number(raw.scale) >= 1 && Number(raw.scale) <= 4 ? Number(raw.scale) : 2,
        data: subgraph,
        highlight: focus,
        metaOverride: {
          viewLabel: '跨学科关联（快照子图）',
          focusName: subgraph.nodes.find((n) => n.id === focus)?.name || '',
        },
        viewOverrides: {
          layoutMode: 'overview',
          activeTypes: [
            'subject',
            'domain',
            'unit',
            'knowledge',
            'method',
            'cross_disciplinary_theme',
          ],
          activeRelations: ['contains', 'teaches', 'uses_method', 'cross_links'],
        },
      })
      png = rendered.png
      info = rendered.info
    } catch (e) {
      return sendJson(
        res,
        200,
        withStatus(
          {
            ...base,
            image_status: 'error',
            image_message: String(e.message || e),
            page_url: `${baseUrl(req)}/s/${snapshot.snapshot_id}`,
            // 查询/关系结果保留
            status: 'success',
          },
          // 业务上关系仍可用：status 保持 success/partial 语义用 message 说明图片失败
          snapshot.unmatched_main_node_ids?.length ? 'partial' : 'success',
          '关系查询结果可用，但图片生成失败',
        ),
      )
    }

    let savedImage
    try {
      savedImage = await saveImage(shortId('img'), png)
    } catch (e) {
      return sendJson(
        res,
        200,
        withStatus(
          {
            ...base,
            image_status: 'error',
            image_message: e.message,
            page_url: `${baseUrl(req)}/s/${snapshot.snapshot_id}`,
          },
          snapshot.unmatched_main_node_ids?.length ? 'partial' : 'success',
          '关系结果可用，但图片未能写入存储',
        ),
      )
    }

    const imageId = savedImage.image_id
    const site = baseUrl(req)
    // 与 Word 工具一致：优先返回 Blob 公网 HTTPS；本地无 Blob 时用站点短链
    const image_url =
      savedImage.image_url || `${site}/i/s/${imageId}.png`

    // 更新快照记录中的 image 引用（不改动关系内容）
    snapshot.image_id = imageId
    snapshot.image_blob_url = savedImage.image_url || ''
    snapshot.selected_relation_ids = picked.selected_relation_ids
    snapshot.render_subgraph = subgraph
    try {
      await saveSnapshot(snapshot)
    } catch {
      // 图片已落盘即可，快照元数据更新失败只记 warning
      base.warnings.push('图片已生成，但快照元数据回写失败')
    }

    const page_url = `${site}/s/${snapshot.snapshot_id}`
    const alt = info?.focus_name
      ? `${info.graph_title} - ${info.focus_name}`
      : `${info?.graph_title || '知识图谱'} - 跨学科子图`

    return sendJson(
      res,
      200,
      withStatus(
        {
          ...base,
          image_status: 'success',
          image_url,
          image_markdown: `![${alt}](${image_url})`,
          page_url,
          image_message: '',
          selected_relation_ids: picked.selected_relation_ids,
          truncated: !!subgraph.truncated,
          node_count: info?.node_count || subgraph.nodes.length,
          edge_count: info?.edge_count || subgraph.edges.length,
          image_width: info?.width || 0,
          image_height: info?.height || 0,
          word_point_size: info?.word_point_size || 0,
        },
        snapshot.unmatched_main_node_ids?.length ? 'partial' : 'success',
        '',
      ),
    )
  } catch (err) {
    return sendJson(
      res,
      200,
      withStatus(
        { ...base, image_status: 'error', image_message: String(err.message || err) },
        'error',
        String(err.message || err),
      ),
    )
  }
}
