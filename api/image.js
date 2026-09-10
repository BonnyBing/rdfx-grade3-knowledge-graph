/**
 * 图片直链：
 *   /i/<token>.png     —— 参数编码 token（旧接口，兼容）
 *   /i/s/<imageId>.png —— 快照已落盘的 PNG（新短链）
 *
 * Word 对外链图片较挑：必须直接回 PNG、Content-Type 正确、不跳转、不鉴权。
 * 旧 token 路径在出错时仍返回错误提示图（兼容已插入文档的链接）。
 * 快照短链若文件不存在则 404 JSON，避免把错误图当成成功图谱。
 */

const params = require('../lib/params.js')
const { renderGraph, renderErrorImage } = require('../lib/render-png.js')
const { loadImage } = require('../lib/snapshot-store.js')

const ONE_YEAR = 60 * 60 * 24 * 365

function sendPng(req, res, buf, immutable) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Content-Length', buf.length)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Cache-Control',
    immutable
      ? `public, max-age=${ONE_YEAR}, s-maxage=${ONE_YEAR}, immutable`
      : 'public, max-age=60',
  )
  if (req.method === 'HEAD') return res.end()
  res.end(buf)
}

function sendJson(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(obj))
}

module.exports = async function handler(req, res) {
  const q = req.query || {}
  const urlPath = String(req.url || '').split('?')[0]

  // 快照短链：/i/s/<id>.png 或 query.snapshot_image
  const snapFromQuery = q.snapshot_image || q.image_id
  const snapMatch = urlPath.match(/\/i\/s\/([\w-]+)\.png$/)
  const imageId = snapFromQuery || (snapMatch && snapMatch[1])

  if (imageId) {
    try {
      const loaded = await loadImage(String(imageId))
      return sendPng(req, res, loaded.buffer, true)
    } catch (err) {
      return sendJson(res, 404, {
        code: 404,
        status: 'not_found',
        message: String(err.message || err),
        image_status: 'error',
      })
    }
  }

  const token =
    q.hash ||
    q.token ||
    urlPath.replace(/^.*\/i\//, '').replace(/\.png$/, '')

  try {
    const p = params.decode(token)
    const { png } = await renderGraph(p)
    return sendPng(req, res, png, true)
  } catch (err) {
    return sendPng(req, res, renderErrorImage(String(err.message || err)), false)
  }
}
