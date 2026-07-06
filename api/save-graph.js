const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'rdfx-grade3-knowledge-graph save API',
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const token = process.env.GITHUB_TOKEN
  const owner = process.env.GITHUB_OWNER || 'BonnyBing'
  const repo = process.env.GITHUB_REPO || 'rdfx-grade3-knowledge-graph'
  const path = 'data.json'

  if (!token) {
    return res.status(500).json({ ok: false, error: 'GITHUB_TOKEN not configured' })
  }

  const { data } = req.body || {}
  if (!data?.nodes?.length || !Array.isArray(data.edges)) {
    return res.status(400).json({ ok: false, error: 'Invalid graph data' })
  }

  data.metadata = data.metadata || {}
  data.metadata.updated_at = new Date().toISOString()

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  let sha = null
  const getRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { headers: ghHeaders },
  )
  if (getRes.ok) {
    const file = await getRes.json()
    sha = file.sha
  } else if (getRes.status !== 404) {
    const err = await getRes.text()
    return res.status(500).json({ ok: false, error: `Read failed: ${err}` })
  }

  const content = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString(
    'base64',
  )

  const putRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore: sync knowledge graph data (${data.metadata.updated_at})`,
        content,
        sha,
      }),
    },
  )

  if (!putRes.ok) {
    const err = await putRes.text()
    return res.status(500).json({ ok: false, error: `Write failed: ${err}` })
  }

  return res.status(200).json({
    ok: true,
    updated_at: data.metadata.updated_at,
  })
}
