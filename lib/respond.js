/** 接口的公共部分：跨域、请求参数合并、站点地址推断 */

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function sendJson(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(obj))
}

/** GET 查询串和 POST body 都接受，插件平台两种发法都有 */
function readParams(req) {
  const q = req.query || {}
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }
  return { ...q, ...(body && typeof body === 'object' ? body : {}) }
}

/**
 * 推断对外可访问的站点地址。
 * 生成的图片链接要放进 Word，必须是完整的绝对地址。
 */
function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
  }
  const host =
    req.headers['x-forwarded-host'] || req.headers.host || 'localhost:8099'
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
  const proto =
    req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https')
  return `${proto}://${host}`
}

module.exports = { applyCors, sendJson, readParams, baseUrl }
