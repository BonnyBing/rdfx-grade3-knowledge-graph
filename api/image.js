/**
 * 图片直链：/i/<token>.png
 *
 * token 里就是出图参数本身，收到请求当场渲染，不依赖任何存储。
 * Word 对外链图片比较挑：必须直接回 PNG 字节、Content-Type 要对、
 * 不能跳转、不能要登录。所以这里一律 200 + image/png，
 * 连出错都返回一张写着原因的图，不然文档里会显示成破图。
 */

const params = require('../lib/params.js')
const { renderGraph, renderErrorImage } = require('../lib/render-png.js')

const ONE_YEAR = 60 * 60 * 24 * 365

function sendPng(req, res, buf, immutable) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Content-Length', buf.length)
  res.setHeader('Access-Control-Allow-Origin', '*')
  // 参数变了链接就变，所以同一条链接的内容不会变，可以长期缓存
  res.setHeader(
    'Cache-Control',
    immutable
      ? `public, max-age=${ONE_YEAR}, s-maxage=${ONE_YEAR}, immutable`
      : 'public, max-age=60',
  )
  if (req.method === 'HEAD') return res.end()
  res.end(buf)
}

module.exports = async function handler(req, res) {
  const token =
    (req.query && (req.query.hash || req.query.token)) ||
    String(req.url || '')
      .split('?')[0]
      .replace(/^.*\/i\//, '')
      .replace(/\.png$/, '')

  try {
    const p = params.decode(token)
    const { png } = await renderGraph(p)
    return sendPng(req, res, png, true)
  } catch (err) {
    return sendPng(req, res, renderErrorImage(String(err.message || err)), false)
  }
}
