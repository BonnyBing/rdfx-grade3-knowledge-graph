/**
 * 节点检索：把一句话或一个词匹配到图谱节点，拿到可用于出图的 focus。
 * 智能体不确定该聚焦哪个节点时先问这里，再去调出图接口。
 */

const params = require('../lib/params.js')
const { loadGraphDataFresh } = require('../lib/render-png.js')
const GraphCore = require('../public/graph-core.js')
const { applyCors, sendJson, readParams } = require('../lib/respond.js')

module.exports = async function handler(req, res) {
  applyCors(res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  try {
    const raw = readParams(req)
    const q = String(raw.q || raw.query || '').trim()
    const limit = Math.min(20, Math.max(1, Number(raw.limit) || 8))
    const data = await loadGraphDataFresh()

    if (!q) {
      // 没给关键词就列出各单元，方便智能体挑
      const units = data.nodes
        .filter((n) => n.type === 'unit')
        .map((n) => ({
          id: n.id,
          name: n.name,
          type: n.type,
          type_label: GraphCore.TYPE_LABELS[n.type],
          subject: n.id.startsWith('S') ? '科学' : '数学',
        }))
      return sendJson(res, 200, {
        ok: true,
        query: '',
        total_nodes: data.nodes.length,
        units,
        hint: '传入 q 可按名称检索，例如 q=混合运算',
      })
    }

    const resolved = params.resolveQuery(q, data)
    const matches = params.matchNodes(q, data, limit, resolved.view)

    return sendJson(res, 200, {
      ok: true,
      query: q,
      suggested_view: resolved.view,
      suggested_focus: resolved.focus,
      suggested_focus_name: resolved.matched_name,
      matches: matches.map((m) => {
        const n = data.nodes.find((x) => x.id === m.id)
        return {
          ...m,
          type_label: GraphCore.TYPE_LABELS[m.type] || m.type,
          subject: m.id.startsWith('S')
            ? '科学'
            : m.id.startsWith('M')
              ? '数学'
              : '跨学科',
          status: n && n.status ? n.status : undefined,
        }
      }),
    })
  } catch (err) {
    return sendJson(res, 200, { ok: false, error: String(err.message || err) })
  }
}
