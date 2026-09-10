/**
 * 出图接口，供智能体插件调用。
 *
 * 返回的是图片链接而不是图片本身：智能体拿到链接后写进 Word，
 * Word 打开文档时再去取图。所以这里只算布局规模，不渲染 PNG，响应更快。
 */

const params = require('../lib/params.js')
const { measureGraph, loadGraphDataFresh } = require('../lib/render-png.js')
const { applyCors, sendJson, readParams, baseUrl } = require('../lib/respond.js')

/** 按图片插入 A4 后的实际字号给出可读性判断 */
function readability(pt) {
  if (pt >= 8) return { level: 'good', text: '文字清晰，可直接插入 A4 纵向页面' }
  if (pt >= 5.5) {
    return {
      level: 'fair',
      text: '文字偏小但可辨认，建议图片占满页宽，或改用 preset=word-landscape 放在横向页',
    }
  }
  return {
    level: 'small',
    text: '节点较多导致文字偏小，建议用 focus 聚焦到某个单元或知识点，或把 depth 调小',
  }
}

function buildSummary(info, resolved) {
  const scope = info.focus_name
    ? `以「${info.focus_name}」为中心、向外 ${info.depth} 层的关联子图`
    : `${
        { all: '数学与科学全部概要', math: '数学', science: '科学', cross: '跨学科关联' }[
          info.view
        ]
      }图谱`
  return (
    `《${info.graph_title}》${scope}，共 ${info.node_count} 个节点、` +
    `${info.edge_count} 条关系。图片为 PNG 格式，含标题与图例，可直接插入 Word。`
  )
}

module.exports = async function handler(req, res) {
  applyCors(res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  try {
    const raw = readParams(req)
    const data = await loadGraphDataFresh()

    // 支持直接给一句话，自己解析出视图和聚焦节点
    let resolved = null
    if (raw.query && !raw.focus) {
      resolved = params.resolveQuery(raw.query, data)
      if (!raw.view) raw.view = resolved.view
      if (resolved.focus) raw.focus = resolved.focus
    }

    // 给了 focus 但不是合法节点 ID 时，按名称再找一次
    if (raw.focus && !data.nodes.some((n) => n.id === raw.focus)) {
      const m = params.matchNodes(raw.focus, data, 5)
      if (m.length && m[0].score >= 0.5) {
        resolved = { matches: m, matched_name: m[0].name }
        raw.focus = m[0].id
      } else {
        return sendJson(res, 200, {
          ok: false,
          error: `找不到名为「${raw.focus}」的节点`,
          candidates: m,
          hint: '可以先调用 /api/search 查看可用的节点名称与 ID',
        })
      }
    }

    const p = params.normalize(raw)
    const info = await measureGraph(p)

    const base = baseUrl(req)
    // 把数据版本编进链接：数据更新后新调用会得到新链接，已插入文档的旧图保持原样
    const token = params.encode({ ...p, rev: info.revision })
    const imageUrl = `${base}/i/${token}.png`
    const pageUrl = `${base}/${params.pageQuery(p)}`
    const alt = info.focus_name
      ? `${info.graph_title} - ${info.focus_name}`
      : `${info.graph_title} - ${info.view}`
    const read = readability(info.word_point_size)

    return sendJson(res, 200, {
      ok: true,
      image_url: imageUrl,
      image_markdown: `![${alt}](${imageUrl})`,
      image_html: `<img src="${imageUrl}" alt="${alt}" width="640" />`,
      page_url: pageUrl,
      summary: buildSummary(info, resolved),
      title: info.graph_title,
      view: info.view,
      focus: info.focus,
      focus_name: info.focus_name,
      depth: info.depth,
      node_count: info.node_count,
      edge_count: info.edge_count,
      image_width: info.width,
      image_height: info.height,
      word_point_size: info.word_point_size,
      readability: read.level,
      advice: read.text,
      matched_candidates: resolved ? resolved.matches : undefined,
      usage:
        '把 image_url 直接作为图片地址插入 Word 即可；链接内含全部出图参数，长期有效。',
    })
  } catch (err) {
    return sendJson(res, 200, {
      ok: false,
      error: String(err.message || err),
      hint: '请检查 view / focus / depth 参数，或调用 /api/search 确认节点',
    })
  }
}
