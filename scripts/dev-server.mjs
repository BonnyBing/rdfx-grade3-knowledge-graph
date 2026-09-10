/**
 * 本地开发服务器：模拟 Vercel 的路由行为。
 *
 *   /                  -> public/index.html
 *   /i/<hash>.png      -> api/image.js
 *   /api/<name>        -> api/<name>.js
 *   其余                -> public/ 下的静态文件
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const port = Number(process.env.PORT || 8099)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.otf': 'font/otf',
  '.ico': 'image/x-icon',
}

/** 每次请求都重新 import，改代码不用重启 */
async function loadHandler(file) {
  const url = pathToFileURL(file).href + '?t=' + Date.now()
  const mod = await import(url)
  return mod.default || mod
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(raw)
      }
    })
  })
}

/** 给 handler 补上 Vercel 风格的 res.status().json() 等便捷方法 */
function decorate(res) {
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(obj))
    return res
  }
  res.send = (data) => {
    res.end(data)
    return res
  }
  return res
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`)
  let pathname = decodeURIComponent(parsed.pathname)
  decorate(res)

  try {
    // 出图直链：/i/<hash>.png
    const imgMatch = pathname.match(/^\/i\/([\w-]+)\.png$/)
    if (imgMatch) {
      const handler = await loadHandler(path.join(root, 'api/image.js'))
      req.query = { ...Object.fromEntries(parsed.searchParams), hash: imgMatch[1] }
      return void (await handler(req, res))
    }

    if (pathname.startsWith('/api/')) {
      const name = pathname.slice(5).replace(/[^\w-]/g, '')
      const file = path.join(root, 'api', `${name}.js`)
      if (!fs.existsSync(file)) {
        return res.status(404).json({ ok: false, error: `no api: ${name}` })
      }
      const handler = await loadHandler(file)
      req.query = Object.fromEntries(parsed.searchParams)
      req.body = await readBody(req)
      return void (await handler(req, res))
    }

    if (pathname === '/') pathname = '/index.html'
    const file = path.join(publicDir, pathname)
    if (!file.startsWith(publicDir) || !fs.existsSync(file)) {
      return res.status(404).send('Not Found')
    }
    res.setHeader(
      'Content-Type',
      MIME[path.extname(file)] || 'application/octet-stream',
    )
    res.setHeader('Cache-Control', 'no-store')
    res.end(fs.readFileSync(file))
  } catch (err) {
    console.error(`[${req.method} ${pathname}]`, err)
    res.status(500).json({ ok: false, error: String(err?.stack || err) })
  }
})

server.listen(port, () => {
  console.log(`知识图谱本地服务: http://127.0.0.1:${port}/`)
})
