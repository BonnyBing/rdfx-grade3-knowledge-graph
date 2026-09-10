/**
 * 子图快照与图片存储。
 *
 * 优先使用 Vercel Blob（与 word tool 相同模式）：
 *   kg/snapshots/<id>.json
 *   kg/images/<id>.png
 *
 * 未配置 BLOB_READ_WRITE_TOKEN 时：
 *   - 本地：写入 .data/（或 SNAPSHOT_DIR）
 *   - Vercel 等无持久化盘：明确报错，不得用全图顶替
 */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { shortId } = require('./graph-meta.js')

function blobToken() {
  return (process.env.BLOB_READ_WRITE_TOKEN || '').trim()
}

function hasBlob() {
  return blobToken().length > 0
}

function dataRoot() {
  if (process.env.SNAPSHOT_DIR) {
    return path.resolve(process.env.SNAPSHOT_DIR)
  }
  return path.join(__dirname, '../.data')
}

function snapshotDir() {
  return path.join(dataRoot(), 'snapshots')
}

function imageDir() {
  return path.join(dataRoot(), 'images')
}

function ensureDirs() {
  fs.mkdirSync(snapshotDir(), { recursive: true })
  fs.mkdirSync(imageDir(), { recursive: true })
}

function isEphemeralRuntime() {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
}

function assertFsWritable() {
  if (isEphemeralRuntime() && !process.env.SNAPSHOT_DIR && !hasBlob()) {
    const err = new Error(
      '当前部署环境无法持久化快照。请配置 BLOB_READ_WRITE_TOKEN（推荐，与 Word 工具相同）或 SNAPSHOT_DIR。',
    )
    err.code = 'storage_unavailable'
    throw err
  }
  try {
    ensureDirs()
    const probe = path.join(snapshotDir(), '.write_probe')
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
  } catch (e) {
    const err = new Error(`快照存储不可写：${e.message}`)
    err.code = 'storage_unavailable'
    throw err
  }
}

function snapshotPath(id) {
  const safe = String(id).replace(/[^\w-]/g, '')
  if (!safe) {
    throw Object.assign(new Error('无效 snapshot_id'), { code: 'invalid_input' })
  }
  return path.join(snapshotDir(), `${safe}.json`)
}

function imagePath(id) {
  const safe = String(id).replace(/[^\w-]/g, '')
  return path.join(imageDir(), `${safe}.png`)
}

function snapshotContentHash(record) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        nodes: record.subgraph?.nodes,
        edges: record.subgraph?.edges,
        relations: record.relations,
        evidence_paths: record.evidence_paths,
        main_node_ids: record.main_node_ids,
      }),
    )
    .digest('hex')
    .slice(0, 16)
}

function blobPathSnapshot(id) {
  return `kg/snapshots/${id}.json`
}

function blobPathImage(id) {
  return `kg/images/${id}.png`
}

async function blobPut(pathname, body, contentType, allowOverwrite) {
  const { put } = require('@vercel/blob')
  const result = await put(pathname, body, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: !!allowOverwrite,
    contentType,
    token: blobToken(),
  })
  if (!result?.url || !String(result.url).startsWith('https://')) {
    throw new Error('Blob 上传未返回有效的 HTTPS 地址')
  }
  return result
}

async function blobReadJson(pathname) {
  const { head } = require('@vercel/blob')
  let url
  try {
    const meta = await head(pathname, { token: blobToken() })
    url = meta.url
  } catch {
    const { list } = require('@vercel/blob')
    const page = await list({
      prefix: pathname,
      token: blobToken(),
      limit: 5,
    })
    const hit = (page.blobs || []).find((b) => b.pathname === pathname)
    if (!hit) {
      const err = new Error(`快照不存在：${pathname}`)
      err.code = 'not_found'
      throw err
    }
    url = hit.url
  }
  const res = await fetch(url)
  if (!res.ok) {
    const err = new Error(`读取快照失败 HTTP ${res.status}`)
    err.code = 'error'
    throw err
  }
  return res.json()
}

async function blobReadBinary(pathname) {
  const { head } = require('@vercel/blob')
  let url
  try {
    const meta = await head(pathname, { token: blobToken() })
    url = meta.url
  } catch {
    const err = new Error(`图片不存在：${pathname}`)
    err.code = 'not_found'
    throw err
  }
  const res = await fetch(url)
  if (!res.ok) {
    const err = new Error(`读取图片失败 HTTP ${res.status}`)
    err.code = 'not_found'
    throw err
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    url,
  }
}

async function saveSnapshot(payload) {
  const snapshot_id = payload.snapshot_id || shortId('snap')
  const record = {
    ...payload,
    snapshot_id,
    saved_at: new Date().toISOString(),
  }
  record.snapshot_content_hash = snapshotContentHash(record)

  if (hasBlob()) {
    const result = await blobPut(
      blobPathSnapshot(snapshot_id),
      JSON.stringify(record),
      'application/json; charset=utf-8',
      true,
    )
    record.blob_url = result.url
    // 再写一次带 blob_url 的完整记录，便于自描述
    await blobPut(
      blobPathSnapshot(snapshot_id),
      JSON.stringify(record),
      'application/json; charset=utf-8',
      true,
    )
    return record
  }

  assertFsWritable()
  fs.writeFileSync(snapshotPath(snapshot_id), JSON.stringify(record, null, 2), 'utf8')
  return record
}

async function loadSnapshot(snapshot_id) {
  const safe = String(snapshot_id || '').replace(/[^\w-]/g, '')
  if (!safe) {
    throw Object.assign(new Error('无效 snapshot_id'), { code: 'invalid_input' })
  }

  if (hasBlob()) {
    try {
      return await blobReadJson(blobPathSnapshot(safe))
    } catch (e) {
      if (e.code === 'not_found') throw e
      const err = new Error(e.message || String(e))
      err.code = e.code || 'error'
      throw err
    }
  }

  assertFsWritable()
  const file = snapshotPath(safe)
  if (!fs.existsSync(file)) {
    const err = new Error(`快照不存在：${safe}`)
    err.code = 'not_found'
    throw err
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * @returns {Promise<{ image_id: string, image_url: string }>}
 */
async function saveImage(imageId, pngBuffer) {
  const id = imageId || shortId('img')

  if (hasBlob()) {
    const result = await blobPut(blobPathImage(id), pngBuffer, 'image/png', false)
    return { image_id: id, image_url: result.url }
  }

  assertFsWritable()
  fs.writeFileSync(imagePath(id), pngBuffer)
  return { image_id: id, image_url: '' }
}

/**
 * @returns {Promise<{ buffer: Buffer, image_url?: string }>}
 */
async function loadImage(imageId) {
  const safe = String(imageId || '').replace(/[^\w-]/g, '')
  if (!safe) {
    const err = new Error('无效 image_id')
    err.code = 'invalid_input'
    throw err
  }

  if (hasBlob()) {
    const { buffer, url } = await blobReadBinary(blobPathImage(safe))
    return { buffer, image_url: url }
  }

  assertFsWritable()
  const file = imagePath(safe)
  if (!fs.existsSync(file)) {
    const err = new Error(`图片不存在：${safe}`)
    err.code = 'not_found'
    throw err
  }
  return { buffer: fs.readFileSync(file) }
}

function storageInfo() {
  return {
    backend: hasBlob() ? 'vercel_blob' : 'filesystem',
    blob_configured: hasBlob(),
    snapshot_dir: hasBlob() ? 'kg/snapshots/' : snapshotDir(),
    image_dir: hasBlob() ? 'kg/images/' : imageDir(),
    ephemeral_runtime: isEphemeralRuntime(),
    snapshot_dir_configured: !!process.env.SNAPSHOT_DIR,
  }
}

module.exports = {
  saveSnapshot,
  loadSnapshot,
  saveImage,
  loadImage,
  storageInfo,
  assertWritable: () => {
    if (hasBlob()) return
    assertFsWritable()
  },
  shortId,
  dataRoot,
  hasBlob,
  blobToken,
}
