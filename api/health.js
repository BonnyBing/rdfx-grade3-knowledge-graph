/**
 * 健康检查：供部署后验证，不返回任何密钥。
 * GET /api/health
 */

const { applyCors, sendJson } = require('../lib/respond.js')
const { storageInfo, hasBlob } = require('../lib/snapshot-store.js')
const { loadGraphData } = require('../lib/render-png.js')
const { graphVersion } = require('../lib/graph-meta.js')

module.exports = async function handler(req, res) {
  applyCors(res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  let graph_ok = false
  let graph_version = ''
  try {
    const data = loadGraphData()
    graph_ok = Array.isArray(data?.nodes) && data.nodes.length > 0
    graph_version = graphVersion(data)
  } catch {
    graph_ok = false
  }

  const storage = storageInfo()
  const storage_configured = hasBlob() || !!process.env.SNAPSHOT_DIR || !storage.ephemeral_runtime

  return sendJson(res, 200, {
    status: graph_ok ? 'ok' : 'degraded',
    service: 'rdfx-grade3-knowledge-graph',
    version: '2.0.0',
    graph_ok,
    graph_version,
    storage_configured,
    storage_backend: storage.backend,
    blob_configured: storage.blob_configured,
    public_base_url: (process.env.PUBLIC_BASE_URL || '').trim() || null,
    plugin_api_key_required: !!(process.env.PLUGIN_API_KEY || '').trim(),
  })
}
