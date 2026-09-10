/**
 * 云端保存：把页面「保存并同步」的数据写回 GitHub 仓库的 data.json。
 *
 * 需要环境变量：
 *   GITHUB_TOKEN  有目标仓库 contents 写权限的令牌
 *   GITHUB_REPO   形如 owner/name
 *   GITHUB_BRANCH 默认 main
 *   SAVE_PASSCODE 可选，设了就要求请求带上同样的 passcode
 *
 * 没配置令牌时会明确报错，页面可以继续指向原有的保存服务。
 */

const { applyCors, sendJson, readParams } = require('../lib/respond.js')

const GITHUB_API = 'https://api.github.com'

async function githubRequest(path, token, init = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'zhishi-tupu-save',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    const msg = json?.message || `GitHub 返回 ${res.status}`
    throw new Error(msg)
  }
  return json
}

function validateGraph(graph) {
  if (!graph || typeof graph !== 'object') throw new Error('缺少图谱数据')
  if (!Array.isArray(graph.nodes) || !graph.nodes.length)
    throw new Error('图谱数据里没有节点')
  if (!Array.isArray(graph.edges)) throw new Error('图谱数据缺少 edges')
  const ids = new Set(graph.nodes.map((n) => n.id))
  if (ids.size !== graph.nodes.length) throw new Error('存在重复的节点 ID')
  const broken = graph.edges.filter(
    (e) => !ids.has(e.source) || !ids.has(e.target),
  )
  if (broken.length)
    throw new Error(`有 ${broken.length} 条关系指向了不存在的节点`)
}

module.exports = async function handler(req, res) {
  applyCors(res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: '请用 POST 提交' })
  }

  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  const branch = process.env.GITHUB_BRANCH || 'main'
  const filePath = process.env.GITHUB_FILE || 'data.json'

  if (!token || !repo) {
    return sendJson(res, 200, {
      ok: false,
      error: '服务端未配置 GITHUB_TOKEN / GITHUB_REPO，无法写入云端',
    })
  }

  try {
    const body = readParams(req)
    if (process.env.SAVE_PASSCODE && body.passcode !== process.env.SAVE_PASSCODE) {
      return sendJson(res, 200, { ok: false, error: '保存口令不正确' })
    }

    const graph = body.graph || body.data || body
    validateGraph(graph)

    const content = JSON.stringify(graph, null, 2)
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')

    // 取当前 sha，GitHub 更新文件时必须带上
    let sha
    try {
      const cur = await githubRequest(
        `/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
        token,
      )
      sha = cur?.sha
    } catch {
      sha = undefined // 文件还不存在，当新建处理
    }

    const result = await githubRequest(
      `/repos/${repo}/contents/${encodedPath}`,
      token,
      {
        method: 'PUT',
        body: JSON.stringify({
          message: `更新知识图谱数据（${graph.nodes.length} 节点 / ${graph.edges.length} 关系）`,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch,
          ...(sha ? { sha } : {}),
        }),
      },
    )

    return sendJson(res, 200, {
      ok: true,
      revision: result?.content?.sha || null,
      node_count: graph.nodes.length,
      edge_count: graph.edges.length,
      saved_at: new Date().toISOString(),
    })
  } catch (err) {
    return sendJson(res, 200, { ok: false, error: String(err.message || err) })
  }
}
