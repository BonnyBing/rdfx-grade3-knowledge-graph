/**
 * 图谱版本与内容哈希。版本校验必须基于实际内容，不能只看节点/边数量。
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const ALIAS_FILE = path.join(__dirname, '../config/knowledge-aliases.json')

function stableStringify(obj) {
  return JSON.stringify(obj)
}

function contentHash(data) {
  const payload = {
    metadata: data?.metadata || {},
    nodes: (data?.nodes || []).map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      status: n.status || '',
    })),
    edges: (data?.edges || []).map((e) => ({
      source: e.source,
      relation: e.relation,
      target: e.target,
      alignment: e.alignment || '',
    })),
  }
  return crypto
    .createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex')
    .slice(0, 16)
}

function graphVersion(data) {
  const ver = data?.metadata?.version || '0'
  const date = data?.metadata?.generated_date || ''
  const hash = contentHash(data)
  return `${ver}@${date}#${hash}`
}

function shortId(prefix = 's') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`
}

function loadAliases() {
  if (!fs.existsSync(ALIAS_FILE)) {
    return { version: '0', entries: [] }
  }
  return JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8'))
}

module.exports = {
  contentHash,
  graphVersion,
  shortId,
  loadAliases,
  ALIAS_FILE,
}
