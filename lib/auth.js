/**
 * 插件鉴权：密钥只读服务端环境变量 PLUGIN_API_KEY。
 * 未配置时本地开发可直接调用；配置后要求 Bearer 或 x-api-key。
 */

function checkApiKey(req) {
  const expected = process.env.PLUGIN_API_KEY || ''
  if (!expected) {
    return { ok: true, required: false }
  }
  const headers = req.headers || {}
  const auth = String(headers.authorization || headers.Authorization || '')
  const bearer = auth.match(/^Bearer\s+(.+)$/i)
  const key =
    (bearer && bearer[1].trim()) ||
    String(headers['x-api-key'] || headers['X-Api-Key'] || '').trim()
  if (!key || key !== expected) {
    return {
      ok: false,
      required: true,
      error: '缺少或错误的 API 密钥，请在 Authorization: Bearer <PLUGIN_API_KEY> 或 x-api-key 中提供',
    }
  }
  return { ok: true, required: true }
}

module.exports = { checkApiKey }
