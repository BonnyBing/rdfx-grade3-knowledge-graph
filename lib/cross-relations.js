/**
 * 跨学科关系查询：按真实节点 ID 遍历路径，保留中间主题，不编造直接边。
 */

const crypto = require('node:crypto')
const { subjectOfNodeId, subjectKeyOfNodeId, normalizeSubject } = require('./scope.js')
const { graphVersion, contentHash, shortId } = require('./graph-meta.js')

const LIMITS = {
  max_main_nodes: 20,
  max_path_hops: 4,
  max_relations: 40,
  max_subgraph_nodes: 80,
  max_candidate_subjects: 5,
}

const STRUCT_RELATIONS = ['contains', 'teaches', 'uses_method']
const CONTAINER_TYPES = new Set(['unit', 'domain', 'subject'])

function stableRelationId(parts) {
  return (
    'rel_' +
    crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12)
  )
}

function stablePathId(parts) {
  return (
    'path_' +
    crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12)
  )
}

function nodeBrief(n) {
  return {
    id: n.id,
    name: n.name,
    type: n.type,
    status: n.status || '',
    subject: subjectOfNodeId(n.id),
  }
}

function edgeBrief(e, direction = 'forward') {
  return {
    source: e.source,
    target: e.target,
    relation: e.relation,
    relation_kind: 'original',
    direction,
  }
}

function anchorOf(id, data, nodeMap) {
  let cur = id
  for (let guard = 0; guard < 12; guard++) {
    const up = data.edges.find(
      (e) => e.target === cur && STRUCT_RELATIONS.includes(e.relation),
    )
    if (!up) return null
    const n = nodeMap.get(up.source)
    if (!n) return null
    if (CONTAINER_TYPES.has(n.type)) return n
    cur = n.id
  }
  return null
}

function containerChain(id, data) {
  const out = []
  let cur = id
  for (let guard = 0; guard < 12; guard++) {
    const up = data.edges.find(
      (e) => e.target === cur && e.relation === 'contains',
    )
    if (!up) break
    out.push(up.source)
    cur = up.source
  }
  return out
}

function teachRelationOf(id, data) {
  const e = data.edges.find(
    (x) => x.target === id && ['teaches', 'uses_method'].includes(x.relation),
  )
  return e ? e.relation : 'teaches'
}

function buildThemes(data, nodeMap) {
  return data.nodes
    .filter((n) => n.type === 'cross_disciplinary_theme')
    .map((theme) => {
      const targets = data.edges
        .filter((e) => e.source === theme.id && e.relation === 'cross_links')
        .map((e) => e.target)
      return {
        id: theme.id,
        name: theme.name,
        status: theme.status || '',
        math: targets.filter((id) => subjectKeyOfNodeId(id) === 'math'),
        science: targets.filter((id) => subjectKeyOfNodeId(id) === 'science'),
        all: targets,
      }
    })
}

/**
 * 事实性关联说明（非教学理由）。
 */
function factDescription(pathNodes, pathEdges) {
  const names = pathNodes.map((n) => n.name)
  const rels = pathEdges.map((e) => e.relation).join(' → ')
  return `路径：${names.join(' → ')}（关系类型：${rels}）`
}

/**
 * 查询跨学科关联。
 */
function queryCrossRelations(input, graphData) {
  const warnings = []
  const main_node_ids = Array.isArray(input.main_node_ids)
    ? [...new Set(input.main_node_ids.map((x) => String(x).trim()).filter(Boolean))]
    : []

  if (!main_node_ids.length) {
    return {
      status: 'invalid_input',
      message: 'main_node_ids 不能为空，且必须是已确认的知识点节点 ID',
      warnings,
    }
  }
  if (main_node_ids.length > LIMITS.max_main_nodes) {
    return {
      status: 'invalid_input',
      message: `main_node_ids 最多 ${LIMITS.max_main_nodes} 个`,
      warnings,
    }
  }

  if (input.graph_version) {
    const current = graphVersion(graphData)
    if (String(input.graph_version) !== current) {
      warnings.push(
        `请求的 graph_version 与当前数据不一致（请求=${input.graph_version}，当前=${current}）。仍按当前图谱查询；旧结果请用 snapshot_id 读取。`,
      )
    }
  }

  const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]))
  const missing = main_node_ids.filter((id) => !nodeMap.has(id))
  if (missing.length) {
    return {
      status: 'invalid_input',
      message: `以下节点 ID 不存在，不会自动模糊替换：${missing.join(', ')}`,
      unmatched_queries: missing,
      warnings,
    }
  }

  // 范围一致性：主节点应属于同一册图谱（本数据本身只有一册）
  const mainNodes = main_node_ids.map((id) => nodeMap.get(id))
  const nonKnowledge = mainNodes.filter(
    (n) => !['knowledge', 'method', 'unit', 'lesson'].includes(n.type),
  )
  if (nonKnowledge.length) {
    warnings.push(
      `部分输入不是知识点/方法/单元/课次类型：${nonKnowledge.map((n) => n.id).join(', ')}`,
    )
  }

  let candidateSubjects = []
  if (Array.isArray(input.candidate_subjects) && input.candidate_subjects.length) {
    for (const s of input.candidate_subjects.slice(0, LIMITS.max_candidate_subjects)) {
      const n = normalizeSubject(s)
      if (!n) {
        return {
          status: 'out_of_scope',
          message: `候选学科「${s}」不受支持`,
          warnings,
        }
      }
      if (n !== '数学' && n !== '科学') {
        return {
          status: 'out_of_scope',
          message: `候选学科「${n}」不在本图谱覆盖范围`,
          warnings,
        }
      }
      candidateSubjects.push(n)
    }
    warnings.push('candidate_subjects 仅为推荐过滤条件，不代表教师已确认')
  } else {
    candidateSubjects = ['数学', '科学']
  }

  const themes = buildThemes(graphData, nodeMap)
  const relations = []
  const evidence_paths = []
  const sources = []
  const matchedMain = new Set()
  const subjectHits = new Set()

  for (const main of mainNodes) {
    const mainSub = subjectOfNodeId(main.id)
    const relatedThemes = themes.filter((t) => t.all.includes(main.id))

    for (const theme of relatedThemes) {
      const themeNode = nodeMap.get(theme.id)
      const peers = theme.all.filter((id) => {
        if (id === main.id) return false
        const sub = subjectOfNodeId(id)
        if (sub === mainSub) return false
        if (candidateSubjects.length && !candidateSubjects.includes(sub)) return false
        return true
      })

      for (const peerId of peers) {
        const peer = nodeMap.get(peerId)
        if (!peer) continue

        const edge1 = graphData.edges.find(
          (e) =>
            e.source === theme.id &&
            e.target === main.id &&
            e.relation === 'cross_links',
        )
        const edge2 = graphData.edges.find(
          (e) =>
            e.source === theme.id &&
            e.target === peer.id &&
            e.relation === 'cross_links',
        )
        if (!edge1 || !edge2) continue

        const pathKey = [main.id, 'cross_links', theme.id, 'cross_links', peer.id]
        const relation_id = stableRelationId(pathKey)
        const evidence_path_id = stablePathId(pathKey)

        if (relations.some((r) => r.relation_id === relation_id)) continue

        const pathNodes = [nodeBrief(main), nodeBrief(themeNode), nodeBrief(peer)]
        const pathEdges = [
          edgeBrief(edge1, 'from_theme_to_main'),
          edgeBrief(edge2, 'from_theme_to_peer'),
        ]

        // 可视化派生：两端知识点经主题相连，不得伪装成直接边
        const derived = {
          source: main.id,
          target: peer.id,
          relation: 'cross_links_via_theme',
          relation_kind: 'visual_derived',
          via: theme.id,
          direction: 'undirected_via_theme',
        }

        const description = factDescription(pathNodes, [
          { relation: 'cross_links' },
          { relation: 'cross_links' },
        ])

        relations.push({
          relation_id,
          evidence_path_id,
          main_node_id: main.id,
          main_node_name: main.name,
          peer_node_id: peer.id,
          peer_node_name: peer.name,
          peer_subject: subjectOfNodeId(peer.id),
          theme_node_id: theme.id,
          theme_node_name: theme.name,
          theme_status: theme.status || '',
          original_relations: ['cross_links', 'cross_links'],
          visual_derived: derived,
          description,
          recommended_only: theme.status === 'recommended',
        })

        evidence_paths.push({
          evidence_path_id,
          relation_id,
          hops: 2,
          nodes: pathNodes,
          edges: pathEdges,
          visual_derived_edge: derived,
          description,
        })

        matchedMain.add(main.id)
        subjectHits.add(subjectOfNodeId(peer.id))

        const themeSource = themeNode.source || null
        sources.push({
          relation_id,
          theme_id: theme.id,
          theme_name: theme.name,
          theme_status: theme.status || '',
          note:
            theme.status === 'recommended'
              ? '该跨学科主题在图谱中标记为 recommended，属于推荐活动主题，不是本册教材正文的明确课次内容'
              : '来自图谱 cross_links 边',
          graph_version: graphVersion(graphData),
          content_hash: contentHash(graphData),
        })
      }
    }
  }

  let truncated = false
  let truncate_message = ''
  if (relations.length > LIMITS.max_relations) {
    truncated = true
    truncate_message = `关联结果已截断至 ${LIMITS.max_relations} 条，未宣称穷尽全部关系`
    relations.splice(LIMITS.max_relations)
    const keep = new Set(relations.map((r) => r.evidence_path_id))
    for (let i = evidence_paths.length - 1; i >= 0; i--) {
      if (!keep.has(evidence_paths[i].evidence_path_id)) evidence_paths.splice(i, 1)
    }
  }

  const unmatched_main_node_ids = main_node_ids.filter((id) => !matchedMain.has(id))
  const candidate_subjects = [...subjectHits].map((name) => ({
    subject: name,
    role: 'recommended',
    note: '仅为根据图谱关联得到的候选学科，不是教师已确认结论',
  }))

  if (!relations.length) {
    return {
      status: 'no_relation',
      message: '给定知识点在图谱中未找到跨学科关联（这是查询结果，不是数据源故障）',
      matched_nodes: mainNodes.map(nodeBrief),
      unmatched_queries: unmatched_main_node_ids,
      unmatched_main_node_ids,
      candidate_subjects: [],
      relations: [],
      evidence_paths: [],
      sources: [],
      truncated: false,
      truncate_message: '',
      warnings,
      subgraph: null,
    }
  }

  const status =
    unmatched_main_node_ids.length > 0 ? 'partial' : 'success'
  const message =
    status === 'partial'
      ? `部分知识点存在跨学科关联；无关联的节点：${unmatched_main_node_ids.join(', ')}`
      : ''

  const subgraph = cutRelationSubgraph({
    graphData,
    nodeMap,
    main_node_ids,
    relations,
    themes,
  })

  return {
    status,
    message,
    matched_nodes: mainNodes.map(nodeBrief),
    unmatched_queries: unmatched_main_node_ids,
    unmatched_main_node_ids,
    candidate_subjects,
    relations,
    evidence_paths,
    sources,
    truncated,
    truncate_message,
    warnings,
    subgraph,
  }
}

/**
 * 裁剪可渲染子图：保留主知识点、对端知识点、中间主题、所属单元链。
 */
function cutRelationSubgraph({ graphData, nodeMap, main_node_ids, relations, themes }) {
  const knowledgeIds = new Set(main_node_ids)
  const themeIds = new Set()
  for (const r of relations) {
    knowledgeIds.add(r.peer_node_id)
    knowledgeIds.add(r.main_node_id)
    themeIds.add(r.theme_node_id)
  }

  const ids = new Set()
  const edges = []
  const seen = new Set()
  const addEdge = (source, target, relation, meta = {}) => {
    const key = `${relation}|${source}|${target}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ source, target, relation, ...meta })
  }

  const containers = new Set()
  for (const id of knowledgeIds) {
    ids.add(id)
    const anchor = anchorOf(id, graphData, nodeMap)
    if (anchor) {
      containers.add(anchor.id)
      addEdge(anchor.id, id, teachRelationOf(id, graphData), {
        relation_kind: 'original',
      })
    }
  }
  for (const id of containers) {
    ids.add(id)
    containerChain(id, graphData).forEach((a) => ids.add(a))
  }
  for (const e of graphData.edges) {
    if (e.relation !== 'contains') continue
    if (ids.has(e.source) && ids.has(e.target)) {
      addEdge(e.source, e.target, 'contains', { relation_kind: 'original' })
    }
  }

  for (const tid of themeIds) {
    ids.add(tid)
    const theme = themes.find((t) => t.id === tid)
    if (!theme) continue
    for (const kid of theme.all) {
      if (!knowledgeIds.has(kid)) continue
      addEdge(tid, kid, 'cross_links', { relation_kind: 'original' })
      ids.add(kid)
    }
  }

  // 规模上限
  let truncated = false
  let nodeList = graphData.nodes.filter((n) => ids.has(n.id))
  if (nodeList.length > LIMITS.max_subgraph_nodes) {
    truncated = true
    const priority = new Set([...knowledgeIds, ...themeIds])
    nodeList = [
      ...nodeList.filter((n) => priority.has(n.id)),
      ...nodeList.filter((n) => !priority.has(n.id)),
    ].slice(0, LIMITS.max_subgraph_nodes)
    const keep = new Set(nodeList.map((n) => n.id))
    for (let i = edges.length - 1; i >= 0; i--) {
      if (!keep.has(edges[i].source) || !keep.has(edges[i].target)) {
        edges.splice(i, 1)
      }
    }
  }

  return {
    metadata: {
      ...(graphData.metadata || {}),
      subgraph: true,
      title: (graphData.metadata?.title || '知识图谱') + ' · 跨学科子图',
    },
    node_types: graphData.node_types,
    relation_types: graphData.relation_types,
    nodes: nodeList,
    edges,
    truncated,
  }
}

/**
 * 按 relation_id 过滤子图。
 */
function filterSubgraphByRelations(snapshot, relationIds) {
  if (!relationIds || !relationIds.length) return snapshot.subgraph
  const keepRel = new Set(relationIds)
  const rels = (snapshot.relations || []).filter((r) => keepRel.has(r.relation_id))
  if (!rels.length) {
    const err = new Error('所选 relation_id 均不在该快照中')
    err.code = 'invalid_input'
    throw err
  }

  const knowledgeIds = new Set(snapshot.main_node_ids || [])
  const themeIds = new Set()
  for (const r of rels) {
    knowledgeIds.add(r.main_node_id)
    knowledgeIds.add(r.peer_node_id)
    themeIds.add(r.theme_node_id)
  }

  const baseNodes = snapshot.subgraph?.nodes || []
  const baseEdges = snapshot.subgraph?.edges || []

  const keep = new Set([...knowledgeIds, ...themeIds])
  // 带上容器链
  for (const id of [...knowledgeIds]) {
    let cur = id
    for (let i = 0; i < 12; i++) {
      const up = baseEdges.find(
        (e) => e.target === cur && ['contains', 'teaches', 'uses_method'].includes(e.relation),
      )
      if (!up) break
      keep.add(up.source)
      cur = up.source
    }
  }

  const nodes = baseNodes.filter((n) => keep.has(n.id))
  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = baseEdges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  )

  return {
    ...snapshot.subgraph,
    nodes,
    edges,
    metadata: {
      ...(snapshot.subgraph?.metadata || {}),
      title: ((snapshot.subgraph?.metadata?.title || '知识图谱') + ' · 精简').replace(
        / · 精简$/,
        ' · 精简',
      ),
    },
  }
}

module.exports = {
  LIMITS,
  queryCrossRelations,
  cutRelationSubgraph,
  filterSubgraphByRelations,
  nodeBrief,
}
