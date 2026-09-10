/**
 * 知识图谱核心计算：节点筛选、分层布局、配色与标签样式。
 *
 * 网页和服务端出图共用这一份，坐标计算完全一致。
 * 不含任何 DOM / localStorage 依赖，可直接在 Node 中运行。
 */
; (function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.GraphCore = factory()
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TYPE_LABELS = {
    subject: '学科',
    domain: '领域',
    unit: '单元',
    lesson: '课时',
    knowledge: '知识点',
    method: '方法',
    standard: '课标',
    competency: '核心素养',
    cross_disciplinary_theme: '跨学科主题',
  }

  const RELATION_LABELS = {
    contains: '包含',
    teaches: '教学',
    uses_method: '使用方法',
    aligns_to: '对齐课标',
    develops: '培养素养',
    prerequisite_of: '前置知识',
    applies_to: '应用于',
    cross_links: '跨学科链接',
  }

  const TYPE_COLORS = {
    subject: '#2563eb',
    domain: '#7c3aed',
    unit: '#0891b2',
    lesson: '#059669',
    knowledge: '#d97706',
    method: '#db2777',
    standard: '#78716c',
    competency: '#dc2626',
    cross_disciplinary_theme: '#ea580c',
  }

  const RELATION_COLORS = {
    contains: '#94a3b8',
    teaches: '#3b82f6',
    uses_method: '#8b5cf6',
    aligns_to: '#78716c',
    develops: '#dc2626',
    prerequisite_of: '#f59e0b',
    applies_to: '#10b981',
    cross_links: '#ea580c',
  }

  const SIZE_MAP = {
    subject: 50,
    domain: 38,
    unit: 32,
    lesson: 22,
    knowledge: 26,
    method: 24,
    standard: 28,
    competency: 28,
    cross_disciplinary_theme: 36,
  }

  const STATUS_LABELS = {
    current_book: '本册教材',
    stage_standard: '学段课标',
    stage_later: '后续学段',
    recommended: '推荐主题',
  }

  const OVERVIEW_TYPES = new Set(['subject', 'domain', 'unit'])

  const POS_STORAGE_KEY = 'grade3-kg-node-positions-v10'

  const TYPE_LEVEL = {
    subject: 0,
    domain: 1,
    unit: 2,
    lesson: 3,
    knowledge: 4,
    method: 4,
    standard: 3,
    competency: 3,
    cross_disciplinary_theme: 2,
  }

  const TYPE_ORDER = {
    subject: 0,
    domain: 1,
    unit: 2,
    lesson: 3,
    knowledge: 4,
    method: 5,
    standard: 6,
    competency: 7,
    cross_disciplinary_theme: 8,
  }

  const LAYOUT = {
    depthX: 220,
    overviewDepthX: 252,
    mathRootX: 40,
    treeGap: 280,
    scienceBelowGap: 96,
    scienceRootX: 40 + 220 * 5 + 80,
    crossThemeX: 40 + 220 * 2 + 30,
    rowH: {
      subject: 64,
      domain: 56,
      unit: 52,
      lesson: 48,
      knowledge: 56,
      method: 50,
      default: 48,
    },
    rowGap: 42,
    overviewMinGap: 32,
  }

  const MATH_LEVEL_COLORS = [
    '#1e3a8a',
    '#1d4ed8',
    '#3b82f6',
    '#60a5fa',
    '#93c5fd',
  ]

  const SCIENCE_LEVEL_COLORS = [
    '#064e3b',
    '#047857',
    '#059669',
    '#34d399',
    '#6ee7b7',
  ]

  const MATH_SHADES = {
    subject: '#1e3a8a',
    domain: '#1d4ed8',
    unit: '#3b82f6',
    lesson: '#60a5fa',
    knowledge: '#93c5fd',
    method: '#bfdbfe',
    standard: '#93c5fd',
    competency: '#bfdbfe',
  }

  const SCIENCE_SHADES = {
    subject: '#064e3b',
    domain: '#047857',
    unit: '#059669',
    lesson: '#34d399',
    knowledge: '#6ee7b7',
    method: '#a7f3d0',
    standard: '#6ee7b7',
    competency: '#a7f3d0',
  }

  const SUBJECT_LABELS = { math: '数学', science: '科学', cross: '跨学科' }

  const SUBJECT_COLORS = {
    math: '#2563eb',
    science: '#059669',
    cross: '#ea580c',
  }

  const STATUS_OPTIONS = Object.keys(STATUS_LABELS)

  function cloneGraphData(data) {
    return JSON.parse(JSON.stringify(data))
  }

  const LAYOUT_DEFAULTS = LAYOUT

  /**
   * @param {object} graphData 图谱数据（nodes / edges / metadata）
   * @param {object} state 视图状态，取代原先散落在页面里的全局变量
   */
  function create(graphData, state = {}) {
    const GRAPH_DATA = graphData
    const nodeMap = Object.fromEntries(GRAPH_DATA.nodes.map((n) => [n.id, n]))

    // 出图时可以收紧间距，让文字相对整张图更大，在 Word 里更好读
    const LAYOUT = state.layoutOverrides
      ? {
        ...LAYOUT_DEFAULTS,
        ...state.layoutOverrides,
        rowH: {
          ...LAYOUT_DEFAULTS.rowH,
          ...(state.layoutOverrides.rowH || {}),
        },
      }
      : LAYOUT_DEFAULTS

    // view 兼容旧链接：view=cross 视为 lens=cross + scope=all
    const rawView = state.view ?? 'all'
    const currentLens =
      state.lens ?? (rawView === 'cross' ? 'cross' : 'structure')
    const currentView = rawView === 'cross' ? 'all' : rawView
    const layoutMode = state.layoutMode ?? 'overview'
    const showAllDetail = state.showAllDetail ?? false
    const showScienceLessons = state.showScienceLessons ?? false
    const searchQuery = state.searchQuery ?? ''
    const selectedNodeId = state.selectedNodeId ?? null
    const visualPreset = state.visualPreset ?? 'print'
    const isSilk = visualPreset === 'silk'
    const activeTypes =
      state.activeTypes instanceof Set
        ? state.activeTypes
        : new Set(state.activeTypes ?? [...OVERVIEW_TYPES, 'knowledge'])
    const activeRelations =
      state.activeRelations instanceof Set
        ? state.activeRelations
        : new Set(
          state.activeRelations ?? [
            'contains',
            'teaches',
            'uses_method',
            'cross_links',
          ],
        )
    const savedPositions = state.savedPositions ?? {}

    /**
     * 以某个节点为中心裁剪子图：沿关系向外扩 depth 层，
     * 再补全到学科的 contains 父链，让图片既有细节也有上下文。
     */
    function computeFocusIds(rootId, depth) {
      if (!nodeMap[rootId]) return null
      const keep = new Set([rootId])
      let frontier = [rootId]
      for (let d = 0; d < depth; d++) {
        const next = []
        frontier.forEach((id) => {
          GRAPH_DATA.edges.forEach((e) => {
            if (e.source === id && !keep.has(e.target)) {
              keep.add(e.target)
              next.push(e.target)
            } else if (e.target === id && !keep.has(e.source)) {
              keep.add(e.source)
              next.push(e.source)
            }
          })
        })
        frontier = next
      }
      Array.from(keep).forEach((id) => {
        let cur = id
        for (let guard = 0; guard < 12; guard++) {
          const up = GRAPH_DATA.edges.find(
            (e) => e.target === cur && e.relation === 'contains',
          )
          if (!up || keep.has(up.source)) break
          keep.add(up.source)
          cur = up.source
        }
      })
      return keep
    }

    const focusIds = state.focus
      ? computeFocusIds(state.focus, state.depth ?? 2)
      : null

    // 概览模式下临时加宽列间距，与原页面行为一致
    let activeDepthX = LAYOUT.depthX

    // 原本读 localStorage，服务端由调用方显式传入
    function loadSavedPositions() {
      return savedPositions
    }

    function getSubjectGroup(id) {
      if (id.startsWith('X-')) return 'cross'
      if (id.startsWith('M')) return 'math'
      if (id.startsWith('S')) return 'science'
      return 'other'
    }

    function getThemeClusters() {
      return GRAPH_DATA.nodes
        .filter((n) => n.type === 'cross_disciplinary_theme')
        .map((theme) => {
          const links = GRAPH_DATA.edges.filter(
            (e) => e.source === theme.id && e.relation === 'cross_links',
          )
          const mathIds = sortChildIds(
            links
              .map((e) => e.target)
              .filter((id) => getSubjectGroup(id) === 'math'),
          )
          const sciIds = sortChildIds(
            links
              .map((e) => e.target)
              .filter((id) => getSubjectGroup(id) === 'science'),
          )
          return { themeId: theme.id, mathIds, sciIds }
        })
        .filter((c) => c.mathIds.length && c.sciIds.length)
    }

    function buildKnowledgeCrossEdges(nodeIdSet) {
      const edges = []
      const seen = new Set()
      getThemeClusters().forEach(({ mathIds, sciIds }) => {
        mathIds.forEach((m) => {
          sciIds.forEach((s) => {
            if (!nodeIdSet.has(m) || !nodeIdSet.has(s)) return
            const key = m < s ? `${m}|${s}` : `${s}|${m}`
            if (seen.has(key)) return
            seen.add(key)
            edges.push({ source: m, target: s, relation: 'cross_links' })
          })
        })
      })
      return edges
    }

    /** 课时隐藏时，将 teaches/uses_method 边桥接到可见的单元等祖先节点 */
    function buildBridgedTeachingEdges(nodeIdSet, existingEdges = []) {
      const seen = new Set(
        existingEdges.map((e) => `${e.relation}|${e.source}|${e.target}`),
      )
      const edges = []
      GRAPH_DATA.edges.forEach((e) => {
        if (!activeRelations.has(e.relation)) return
        if (!['teaches', 'uses_method'].includes(e.relation)) return
        if (!nodeIdSet.has(e.target)) return
        if (nodeIdSet.has(e.source)) return
        const anchor = resolveTeachingAnchor(e.source, nodeIdSet)
        if (!anchor) return
        const key = `${e.relation}|${anchor}|${e.target}`
        if (seen.has(key)) return
        seen.add(key)
        edges.push({ source: anchor, target: e.target, relation: e.relation })
      })
      return edges
    }

    function getCrossKnowledgePeers(nodeId) {
      const subject = getSubjectGroup(nodeId)
      if (subject !== 'math' && subject !== 'science') return []
      const peers = []
      const seen = new Set()
      getThemeClusters().forEach((cluster) => {
        if (
          !cluster.mathIds.includes(nodeId) &&
          !cluster.sciIds.includes(nodeId)
        )
          return
        const peerIds = subject === 'math' ? cluster.sciIds : cluster.mathIds
        peerIds.forEach((id) => {
          if (seen.has(id)) return
          seen.add(id)
          const n = nodeMap[id]
          if (n) peers.push(n)
        })
      })
      return peers
    }

    function isCrossLinkedNode(id) {
      return getThemeClusters().some(
        (c) => c.mathIds.includes(id) || c.sciIds.includes(id),
      )
    }

    function getCrossRelevantNodeIds() {
      const ids = new Set()
      const addStructuralAncestors = (nodeId) => {
        let current = nodeId
        while (current) {
          ids.add(current)
          const containEdge = GRAPH_DATA.edges.find(
            (e) => e.target === current && e.relation === 'contains',
          )
          current = containEdge?.source || null
        }
      }
      getThemeClusters().forEach(({ mathIds, sciIds }) => {
        ;[...mathIds, ...sciIds].forEach((kpId) => {
          ids.add(kpId)
          let parentId = getTeachingParent(kpId)
          while (parentId) {
            ids.add(parentId)
            const n = nodeMap[parentId]
            if (
              !n ||
              n.type === 'unit' ||
              n.type === 'domain' ||
              n.type === 'subject'
            ) {
              addStructuralAncestors(parentId)
              break
            }
            parentId =
              getTeachingParent(parentId) ||
              GRAPH_DATA.edges.find(
                (e) => e.target === parentId && e.relation === 'contains',
              )?.source
          }
        })
      })
      return ids
    }

    function isCrossViewNode(n) {
      return getCrossRelevantNodeIds().has(n.id)
    }

    function isOverviewNode(n) {
      if (n.type === 'lesson') return showScienceLessons
      if (OVERVIEW_TYPES.has(n.type)) return true
      if (['knowledge', 'method'].includes(n.type) && isCrossLinkedNode(n.id))
        return true
      return false
    }

    /** 出现在前置关系里的知识点 */
    function isProgressionNode(id) {
      return GRAPH_DATA.edges.some(
        (e) =>
          e.relation === 'prerequisite_of' &&
          (e.source === id || e.target === id),
      )
    }

    /** 出现在课标对齐边里的知识点或课标节点 */
    function isStandardsAlignedNode(id) {
      return GRAPH_DATA.edges.some(
        (e) =>
          e.relation === 'aligns_to' &&
          (e.source === id || e.target === id),
      )
    }

    /** 沿 teaches/contains 向上找到单元（供详情面板） */
    function getAncestorByType(nodeId, type) {
      let cur = nodeId
      const visited = new Set()
      while (cur && !visited.has(cur)) {
        visited.add(cur)
        const n = nodeMap[cur]
        if (n?.type === type) return n
        const teach = GRAPH_DATA.edges.find(
          (e) =>
            e.target === cur &&
            ['teaches', 'uses_method'].includes(e.relation),
        )
        if (teach) {
          cur = teach.source
          continue
        }
        const contain = GRAPH_DATA.edges.find(
          (e) => e.target === cur && e.relation === 'contains',
        )
        cur = contain?.source || null
      }
      return null
    }

    function matchesScope(id) {
      if (currentView === 'math') return getSubjectGroup(id) === 'math'
      if (currentView === 'science') return getSubjectGroup(id) === 'science'
      return true
    }

    function getNodeLevel(n) {
      return TYPE_LEVEL[n.type] ?? 3
    }

    function getNodeColor(n) {
      const subject = getSubjectGroup(n.id)
      const level = getNodeLevel(n)
      if (subject === 'math')
        return (
          MATH_LEVEL_COLORS[Math.min(level, 4)] ||
          MATH_SHADES[n.type] ||
          '#60a5fa'
        )
      if (subject === 'science')
        return (
          SCIENCE_LEVEL_COLORS[Math.min(level, 4)] ||
          SCIENCE_SHADES[n.type] ||
          '#34d399'
        )
      if (n.type === 'cross_disciplinary_theme') return '#ea580c'
      return TYPE_COLORS[n.type]
    }

    function getNodeBorderColor(n) {
      const subject = getSubjectGroup(n.id)
      const level = getNodeLevel(n)
      if (subject === 'math')
        return MATH_LEVEL_COLORS[Math.min(level, 2)] || '#1d4ed8'
      if (subject === 'science')
        return SCIENCE_LEVEL_COLORS[Math.min(level, 2)] || '#047857'
      return '#c2410c'
    }

    function getNodeSymbol(n) {
      if (n.type === 'cross_disciplinary_theme') return 'diamond'
      if (n.type === 'subject') return 'roundRect'
      if (n.type === 'domain') return 'roundRect'
      if (n.type === 'unit') return 'circle'
      if (n.type === 'lesson') return 'circle'
      if (n.type === 'knowledge' || n.type === 'method') return 'pin'
      return 'circle'
    }

    function getNodeSize(n) {
      const level = getNodeLevel(n)
      const sizes = [54, 42, 32, 24, 18]
      return sizes[Math.min(level, 4)] || SIZE_MAP[n.type] || 18
    }

    function getNodeLabelStyle(n) {
      const level = getNodeLevel(n)
      const subject = getSubjectGroup(n.id)
      const fontSizes = [14, 13, 12, 11, 10]
      const fontWeights = ['bold', 'bold', '600', 'normal', 'normal']
      const colors = {
        math: ['#1e3a8a', '#1e40af', '#1d4ed8', '#2563eb', '#3b82f6'],
        science: ['#064e3b', '#065f46', '#047857', '#059669', '#10b981'],
        cross: ['#9a3412', '#9a3412', '#c2410c', '#ea580c', '#fb923c'],
      }
      const sub =
        subject === 'math'
          ? 'math'
          : subject === 'science'
            ? 'science'
            : 'cross'
      const idx = Math.min(level, 4)
      return {
        fontSize: fontSizes[idx],
        fontWeight: fontWeights[idx],
        color: colors[sub][idx],
      }
    }

    function getTeachingParent(nodeId) {
      const edge = GRAPH_DATA.edges.find(
        (e) =>
          e.target === nodeId &&
          ['teaches', 'uses_method'].includes(e.relation),
      )
      return edge?.source
    }

    /** 概览模式下，课时等不可见时向上找到可见的 contains 祖先作为锚点 */
    function resolveTeachingAnchor(sourceId, nodeIdSet) {
      let cur = sourceId
      const visited = new Set()
      while (cur && !visited.has(cur)) {
        visited.add(cur)
        if (nodeIdSet.has(cur)) return cur
        const up = GRAPH_DATA.edges.find(
          (e) => e.target === cur && e.relation === 'contains',
        )
        cur = up?.source
      }
      return null
    }

    function resolveVisibleAnchor(nodeId, nodeIdSet, positions) {
      let cur = getTeachingParent(nodeId)
      const visited = new Set()
      while (cur && !visited.has(cur)) {
        visited.add(cur)
        if (nodeIdSet.has(cur) && positions[cur]) return cur
        const up = GRAPH_DATA.edges.find(
          (e) => e.target === cur && e.relation === 'contains',
        )
        cur = up?.source
      }
      return null
    }

    function getNodeVisualExtents(n) {
      const r = getNodeSize(n) / 2
      const level = getNodeLevel(n)
      if (layoutMode === 'hierarchy' && level >= 3) {
        const charsPerLine = n.type === 'knowledge' ? 14 : 10
        const lines = Math.max(
          1,
          Math.ceil((n.name?.length || 0) / charsPerLine),
        )
        const labelH = lines * 15 + 10
        return {
          left: -r - 10,
          right: r + 10,
          top: -r - labelH - 12,
          bottom: r + 12,
        }
      }
      if (
        layoutMode === 'overview' &&
        ['subject', 'domain', 'unit'].includes(n.type)
      ) {
        const labelW = n.type === 'subject' ? 120 : 150
        const charsPerLine = 8
        const lines = Math.max(
          1,
          Math.ceil((n.name?.length || 0) / charsPerLine),
        )
        const labelH = lines * 14 + 14
        return {
          left: -labelW / 2 - 8,
          right: labelW / 2 + 8,
          top: -r - 10,
          bottom: r + labelH + 10,
        }
      }
      if (
        layoutMode === 'overview' &&
        ['knowledge', 'method'].includes(n.type)
      ) {
        const labelW = 140
        const charsPerLine = 12
        const lines = Math.max(
          1,
          Math.ceil((n.name?.length || 0) / charsPerLine),
        )
        const labelH = lines * 13 + 14
        return {
          left: -labelW / 2 - 8,
          right: labelW / 2 + 8,
          top: -r - 10,
          bottom: r + labelH + 10,
        }
      }
      const showLabel = shouldShowLabel(n)
      const label = showLabel ? getNodeLabel(n) : ''
      const charW = level <= 2 ? 8 : 7
      const labelW = showLabel ? Math.min(label.length * charW + 24, 200) : 0
      const labelDist = level <= 2 ? 10 : 8
      return {
        left: -r - 10,
        right: r + labelW + labelDist + 10,
        top: -(r + 12),
        bottom: r + 12,
      }
    }

    function measurePositionsExtent(positions, ids) {
      let minX = Infinity
      let maxX = -Infinity
      ids.forEach((id) => {
        const n = nodeMap[id]
        const p = positions[id]
        if (!n || !p) return
        const ext = getNodeVisualExtents(n)
        minX = Math.min(minX, p.x + ext.left)
        maxX = Math.max(maxX, p.x + ext.right)
      })
      return { minX, maxX }
    }

    function sortChildIds(ids) {
      return [...ids].sort((a, b) => {
        const ta = TYPE_ORDER[nodeMap[a]?.type] ?? 9
        const tb = TYPE_ORDER[nodeMap[b]?.type] ?? 9
        if (ta !== tb) return ta - tb
        return (nodeMap[a]?.name || a).localeCompare(
          nodeMap[b]?.name || '',
          'zh-CN',
        )
      })
    }

    function buildHierarchyChildrenMap(nodeIdSet, relations) {
      const map = {}
      GRAPH_DATA.edges.forEach((e) => {
        if (!relations.includes(e.relation)) return
        if (!nodeIdSet.has(e.source) || !nodeIdSet.has(e.target)) return
        if (!map[e.source]) map[e.source] = []
        if (!map[e.source].includes(e.target)) map[e.source].push(e.target)
      })
      Object.keys(map).forEach((k) => {
        map[k] = sortChildIds(map[k])
      })
      return map
    }

    function getNodeLabel(n) {
      if (layoutMode === 'hierarchy') {
        if (['knowledge', 'method'].includes(n.type)) return n.name
        const maxByType = { lesson: 14, unit: 18, domain: 12, subject: 10 }
        const max = maxByType[n.type] ?? 12
        return n.name.length > max ? n.name.slice(0, max) + '…' : n.name
      }
      if (layoutMode === 'overview') {
        if (['knowledge', 'method', 'unit'].includes(n.type)) return n.name
        if (n.type === 'lesson') {
          const max = 14
          return n.name.length > max ? n.name.slice(0, max) + '…' : n.name
        }
      }
      if (
        ['unit', 'lesson', 'cross_disciplinary_theme', 'knowledge'].includes(
          n.type,
        )
      ) {
        const max = n.type === 'lesson' ? 14 : 18
        return n.name.length > max ? n.name.slice(0, max) + '…' : n.name
      }
      if (n.name.length > 10) return n.name.slice(0, 10) + '…'
      return n.name
    }

    function shouldShowLabel(n) {
      if (currentLens === 'progression' || currentLens === 'standards') {
        return true
      }
      if (layoutMode === 'hierarchy') {
        if (n.type === 'lesson')
          return showScienceLessons || currentView === 'science'
        return (
          [
            'subject',
            'domain',
            'unit',
            'knowledge',
            'method',
            'standard',
            'competency',
            'cross_disciplinary_theme',
          ].includes(n.type) || n.id === selectedNodeId
        )
      }
      if (layoutMode === 'overview' && !showAllDetail) {
        if (n.type === 'lesson') return false
        return [
          'subject',
          'domain',
          'unit',
          'cross_disciplinary_theme',
          'knowledge',
          'method',
        ].includes(n.type)
      }
      if (n.type === 'lesson') return false
      return (
        [
          'subject',
          'domain',
          'unit',
          'cross_disciplinary_theme',
          'knowledge',
        ].includes(n.type) || n.id === selectedNodeId
      )
    }

    function filterNodes() {
      return GRAPH_DATA.nodes.filter((n) => {
        if (focusIds && !focusIds.has(n.id)) return false
        if (n.type === 'cross_disciplinary_theme') return false

        if (currentLens === 'progression') {
          if (n.type !== 'knowledge') return false
          if (!isProgressionNode(n.id)) return false
          if (!matchesScope(n.id)) return false
          if (!activeTypes.has(n.type)) return false
        } else if (currentLens === 'standards') {
          if (!['knowledge', 'standard'].includes(n.type)) return false
          if (!isStandardsAlignedNode(n.id)) return false
          if (!matchesScope(n.id)) return false
          if (!activeTypes.has(n.type)) return false
        } else if (currentLens === 'cross') {
          if (!isCrossViewNode(n)) return false
          if (!activeTypes.has(n.type)) return false
          // 跨学科边需要两侧，学科范围不裁切节点
        } else {
          // 教材结构
          if (!activeTypes.has(n.type)) return false
          if (currentView === 'all' && !showAllDetail && !isOverviewNode(n))
            return false
          if (!matchesScope(n.id)) return false
        }

        if (
          searchQuery &&
          !n.name.includes(searchQuery) &&
          !n.id.toLowerCase().includes(searchQuery.toLowerCase())
        )
          return false
        return true
      })
    }

    function filterEdges(nodeIds) {
      const idSet = new Set(nodeIds)
      let edges = GRAPH_DATA.edges.filter((e) => {
        if (!activeRelations.has(e.relation)) return false
        if (e.relation === 'cross_links' && e.source.startsWith('X-'))
          return false
        return idSet.has(e.source) && idSet.has(e.target)
      })
      edges = edges.concat(buildBridgedTeachingEdges(idSet, edges))
      if (activeRelations.has('cross_links')) {
        edges = edges.concat(buildKnowledgeCrossEdges(idSet))
      }
      return edges
    }

    function buildChildrenMap(edges, relations) {
      const map = {}
      edges.forEach((e) => {
        if (!relations.includes(e.relation)) return
        if (!map[e.source]) map[e.source] = []
        map[e.source].push(e.target)
      })
      return map
    }

    function layoutTreeNoOverlap(
      rootId,
      nodeIdSet,
      childrenMap,
      startX,
      depthX,
      minRowH,
      startY = 72,
    ) {
      const positions = {}
      let globalY = startY

      function walk(id, depth) {
        if (!nodeIdSet.has(id)) return
        const children = sortChildIds(
          (childrenMap[id] || []).filter((c) => nodeIdSet.has(c)),
        )
        if (!children.length) {
          const n = nodeMap[id]
          const ext = n ? getNodeVisualExtents(n) : null
          const h = ext ? ext.bottom - ext.top : minRowH
          positions[id] = { x: startX + depth * depthX, y: globalY + h / 2 }
          globalY += h + LAYOUT.rowGap
          return
        }
        const yStart = globalY
        children.forEach((c) => walk(c, depth + 1))
        const childCenters = children
          .filter((c) => positions[c])
          .map((c) => positions[c].y)
        const yMid = childCenters.length
          ? (Math.min(...childCenters) + Math.max(...childCenters)) / 2
          : yStart + minRowH / 2
        positions[id] = { x: startX + depth * depthX, y: yMid }
      }

      walk(rootId, 0)
      return { positions, maxY: globalY }
    }

    function maxRowH(nodes) {
      return nodes.reduce((m, n) => {
        const h = LAYOUT.rowH[n.type] || LAYOUT.rowH.default
        return Math.max(m, h)
      }, LAYOUT.rowH.default)
    }

    function knowledgeRowHeight(n) {
      const charsPerLine = 14
      const lines = Math.max(
        1,
        Math.ceil((n.name?.length || 0) / charsPerLine),
      )
      return LAYOUT.rowH.knowledge + (lines - 1) * 18
    }

    function columnKey(x, rootX = 60) {
      const cols = [0, 1, 2, 3, 4].map((i) => rootX + activeDepthX * i)
      let best = cols[0]
      let bestDist = Infinity
      cols.forEach((c) => {
        const d = Math.abs(x - c)
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      })
      return best
    }

    function snapToColumns(positions, nodes, rootX = 60) {
      nodes.forEach((n) => {
        const p = positions[n.id]
        if (!p) return
        p.x = columnKey(p.x, rootX)
      })
    }

    function separateColumnOverlaps(
      positions,
      nodes,
      minGap = 20,
      rootX = 60,
    ) {
      const buckets = new Map()
      nodes.forEach((n) => {
        const p = positions[n.id]
        if (!p) return
        const key = columnKey(p.x, rootX)
        p.x = key
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key).push(n.id)
      })
      buckets.forEach((ids) => {
        ids.sort((a, b) => positions[a].y - positions[b].y)
        for (let i = 1; i < ids.length; i++) {
          const prevId = ids[i - 1]
          const currId = ids[i]
          const need =
            estimateNodeSize(nodeMap[prevId]).h / 2 +
            estimateNodeSize(nodeMap[currId]).h / 2 +
            minGap
          const gap = positions[currId].y - positions[prevId].y
          if (gap < need) {
            const shift = need - gap
            for (let j = i; j < ids.length; j++) positions[ids[j]].y += shift
          }
        }
      })
      return positions
    }

    function reflowColumnStrict(positions, nodes, colX, rootX, startY = 80) {
      const ids = nodes
        .map((n) => n.id)
        .filter(
          (id) => positions[id] && Math.abs(positions[id].x - colX) < 40,
        )
        .sort((a, b) => positions[a].y - positions[b].y)
      if (!ids.length) return
      let y = startY
      if (startY === 80) {
        const tops = ids
          .map((id) => {
            const n = nodeMap[id]
            const p = positions[id]
            if (!n || !p) return Infinity
            return p.y + getNodeVisualExtents(n).top
          })
          .filter((v) => isFinite(v))
        if (tops.length) y = Math.min(...tops)
      }
      ids.forEach((id) => {
        const n = nodeMap[id]
        const ext = getNodeVisualExtents(n)
        const h = ext.bottom - ext.top
        positions[id] = { x: colX, y: y + h / 2 }
        y += h + LAYOUT.rowGap
      })
    }

    function columnStartY(positions, nodes) {
      const tops = nodes
        .map((n) => {
          const p = positions[n.id]
          if (!p) return Infinity
          return p.y + getNodeVisualExtents(n).top
        })
        .filter((v) => isFinite(v))
      return tops.length ? Math.min(...tops) : 80
    }

    function shiftNodePositions(positions, ids, dx, dy = 0) {
      ids.forEach((id) => {
        if (positions[id]) {
          positions[id].x += dx
          positions[id].y += dy
        }
      })
    }

    function sideBoundingBox(positions, ids) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity
      ids.forEach((id) => {
        const n = nodeMap[id]
        const p = positions[id]
        if (!n || !p) return
        const ext = getNodeVisualExtents(n)
        minX = Math.min(minX, p.x + ext.left)
        maxX = Math.max(maxX, p.x + ext.right)
        minY = Math.min(minY, p.y + ext.top)
        maxY = Math.max(maxY, p.y + ext.bottom)
      })
      if (!isFinite(minX)) return null
      return { minX, maxX, minY, maxY }
    }

    function boxesOverlap(a, b, gap = 0) {
      return !(
        a.maxX + gap <= b.minX ||
        b.maxX + gap <= a.minX ||
        a.maxY + gap <= b.minY ||
        b.maxY + gap <= a.minY
      )
    }

    function separateMathAndScience(positions, mathIds, sciIds) {
      const mathBox = sideBoundingBox(positions, mathIds)
      const sciBox = sideBoundingBox(positions, sciIds)
      if (!mathBox || !sciBox) return false
      if (!boxesOverlap(mathBox, sciBox, LAYOUT.overviewMinGap)) return false

      const gapX = LAYOUT.treeGap
      const gapY = LAYOUT.scienceBelowGap
      let shiftX = 0
      let shiftY = 0

      if (sciBox.minX < mathBox.maxX + gapX) {
        shiftX = mathBox.maxX + gapX - sciBox.minX
      }
      const sciBoxAfterX = shiftX
        ? {
          ...sciBox,
          minX: sciBox.minX + shiftX,
          maxX: sciBox.maxX + shiftX,
        }
        : sciBox
      if (sciBoxAfterX.minY < mathBox.maxY + gapY) {
        shiftY = mathBox.maxY + gapY - sciBoxAfterX.minY
      }

      if (shiftX || shiftY) {
        shiftNodePositions(positions, sciIds, shiftX, shiftY)
        return true
      }
      return false
    }

    function resolveVisualBoxOverlaps(positions, ids, minGap = LAYOUT.overviewMinGap) {
      const valid = ids.filter((id) => positions[id])
      for (let iter = 0; iter < 220; iter++) {
        let moved = false
        for (let i = 0; i < valid.length; i++) {
          for (let j = i + 1; j < valid.length; j++) {
            const na = nodeMap[valid[i]],
              nb = nodeMap[valid[j]]
            const pa = positions[valid[i]],
              pb = positions[valid[j]]
            const ea = getNodeVisualExtents(na),
              eb = getNodeVisualExtents(nb)
            const al = pa.x + ea.left,
              ar = pa.x + ea.right
            const at = pa.y + ea.top,
              ab = pa.y + ea.bottom
            const bl = pb.x + eb.left,
              br = pb.x + eb.right
            const bt = pb.y + eb.top,
              bb = pb.y + eb.bottom
            if (
              al >= br + minGap ||
              ar <= bl - minGap ||
              at >= bb + minGap ||
              ab <= bt - minGap
            )
              continue
            const overlapX = Math.min(ar, br) - Math.max(al, bl) + minGap
            const overlapY = Math.min(ab, bb) - Math.max(at, bt) + minGap
            if (overlapX <= overlapY) {
              const half = overlapX / 2
              if (pa.x <= pb.x) {
                pa.x -= half
                pb.x += half
              } else {
                pa.x += half
                pb.x -= half
              }
            } else {
              const half = overlapY / 2
              if (pa.y <= pb.y) {
                pa.y -= half
                pb.y += half
              } else {
                pa.y += half
                pb.y -= half
              }
            }
            moved = true
          }
        }
        if (!moved) break
      }
    }

    function enforceSideSeparation(positions, mathIds, sciIds) {
      const mathBox = sideBoundingBox(positions, mathIds)
      const sciBox = sideBoundingBox(positions, sciIds)
      if (!mathBox || !sciBox) return
      const need = mathBox.maxX + LAYOUT.treeGap - sciBox.minX
      if (need > 0) shiftNodePositions(positions, sciIds, need)
    }

    function layoutOverviewKnowledgeColumn(
      positions,
      nodes,
      colX,
      nodeIdSet,
    ) {
      const kpNodes = nodes.filter((n) =>
        ['knowledge', 'method'].includes(n.type),
      )
      const items = kpNodes
        .map((n) => {
          const anchor =
            resolveVisibleAnchor(n.id, nodeIdSet, positions) ||
            resolveTeachingAnchor(getTeachingParent(n.id), nodeIdSet)
          const idealY =
            anchor && positions[anchor]
              ? positions[anchor].y
              : (positions[n.id]?.y ?? 1e9)
          return { id: n.id, idealY }
        })
        .sort((a, b) => {
          if (a.idealY !== b.idealY) return a.idealY - b.idealY
          return a.id.localeCompare(b.id)
        })

      let yCursor = columnStartY(
        positions,
        kpNodes.length ? kpNodes : nodes.filter((n) => positions[n.id]),
      )
      items.forEach(({ id, idealY }) => {
        const n = nodeMap[id]
        const ext = getNodeVisualExtents(n)
        const h = ext.bottom - ext.top
        const centerY = Math.max(idealY, yCursor + h / 2)
        positions[id] = { x: colX, y: centerY }
        yCursor = centerY + h / 2 + LAYOUT.rowGap
      })
    }

    function finalizeOverviewSide(positions, nodes, rootX) {
      if (!nodes.length) return
      const COL = hierarchyColumns(rootX)
      const nodeIdSet = new Set(nodes.map((n) => n.id))
      const containsMap = buildHierarchyChildrenMap(nodeIdSet, ['contains'])
      const sideY = columnStartY(positions, nodes)
      snapToColumns(positions, nodes, rootX)
      reflowColumnStrict(
        positions,
        nodes.filter((n) => n.type === 'unit'),
        COL.unit,
        rootX,
        sideY,
      )
      reflowColumnStrict(
        positions,
        nodes.filter((n) => n.type === 'domain'),
        COL.domain,
        rootX,
        sideY,
      )
      recenterParents(positions, nodes, nodeIdSet, containsMap, COL)
      reflowColumnStrict(
        positions,
        nodes.filter((n) => n.type === 'unit'),
        COL.unit,
        rootX,
        sideY,
      )
      reflowColumnStrict(
        positions,
        nodes.filter((n) => n.type === 'domain'),
        COL.domain,
        rootX,
        sideY,
      )
      recenterParents(positions, nodes, nodeIdSet, containsMap, COL)
      const structural = nodes.filter((n) =>
        ['subject', 'domain', 'unit'].includes(n.type),
      )
      for (let i = 0; i < 4; i++) {
        separateColumnOverlaps(
          positions,
          structural,
          LAYOUT.overviewMinGap,
          rootX,
        )
      }
      layoutOverviewKnowledgeColumn(
        positions,
        nodes,
        COL.knowledge,
        nodeIdSet,
      )
      resolveVisualBoxOverlaps(
        positions,
        nodes
          .filter((n) => ['knowledge', 'method'].includes(n.type))
          .map((n) => n.id),
        LAYOUT.overviewMinGap + 4,
      )
    }

    function placeCrossKnowledge(positions, nodes, nodeIdSet, rootX, side) {
      const COL = hierarchyColumns(rootX)
      getThemeClusters().forEach(({ mathIds, sciIds }) => {
        const targets = sortChildIds(
          (side === 'math' ? mathIds : sciIds).filter((id) =>
            nodeIdSet.has(id),
          ),
        )
        targets.forEach((id, i) => {
          const anchor = resolveVisibleAnchor(id, nodeIdSet, positions)
          const parentPos = anchor ? positions[anchor] : null
          const h = nodeRowHeight(nodeMap[id])
          positions[id] = {
            x: COL.knowledge,
            y: parentPos?.y ?? 120 + i * (h + LAYOUT.rowGap),
          }
        })
      })
    }

    function buildOverviewPositions(nodes) {
      const prevDepth = activeDepthX
      activeDepthX = LAYOUT.overviewDepthX
      try {
        const nodeIdSet = new Set(nodes.map((n) => n.id))
        const containsEdges = GRAPH_DATA.edges.filter(
          (e) => e.relation === 'contains',
        )
        const childrenMap = buildChildrenMap(containsEdges, ['contains'])
        Object.keys(childrenMap).forEach((k) => {
          childrenMap[k] = sortChildIds(childrenMap[k])
        })

        const mathNodes = nodes.filter(
          (n) => getSubjectGroup(n.id) === 'math',
        )
        const sciNodes = nodes.filter(
          (n) => getSubjectGroup(n.id) === 'science',
        )
        const mathRootX = LAYOUT.mathRootX
        const depthX = activeDepthX
        const positions = {}

        const math = layoutTreeNoOverlap(
          'M',
          nodeIdSet,
          childrenMap,
          mathRootX,
          depthX,
          maxRowH(mathNodes),
        )
        Object.assign(positions, math.positions)
        attachSatelliteNodes(positions, nodes, nodeIdSet, mathRootX)
        finalizeOverviewSide(positions, mathNodes, mathRootX)

        const mathIds = mathNodes.map((n) => n.id)
        const mathBox = sideBoundingBox(positions, mathIds)

        // 科学放在数学下方偏右，避免与数学知识点列横向挤在一起
        const scienceRootX = mathRootX + depthX * 2
        const scienceStartY =
          (mathBox?.maxY ?? 480) + LAYOUT.scienceBelowGap

        const science = layoutTreeNoOverlap(
          'S',
          nodeIdSet,
          childrenMap,
          scienceRootX,
          depthX,
          maxRowH(sciNodes),
          scienceStartY,
        )
        Object.assign(positions, science.positions)
        attachSatelliteNodes(positions, nodes, nodeIdSet, scienceRootX)
        finalizeOverviewSide(positions, sciNodes, scienceRootX)

        const sciIds = sciNodes.map((n) => n.id)

        // 确保科学整体在数学包围盒之外（只移动科学侧）
        for (let pass = 0; pass < 16; pass++) {
          resolveVisualBoxOverlaps(positions, mathIds)
          resolveVisualBoxOverlaps(positions, sciIds)
          if (!separateMathAndScience(positions, mathIds, sciIds)) break
        }
        separateMathAndScience(positions, mathIds, sciIds)

        return positions
      } finally {
        activeDepthX = prevDepth
      }
    }

    function finalizeSubjectSide(positions, nodes, rootX) {
      if (!nodes.length) return
      const COL = hierarchyColumns(rootX)
      const nodeIdSet = new Set(nodes.map((n) => n.id))
      const containsMap = buildHierarchyChildrenMap(nodeIdSet, ['contains'])
      snapToColumns(positions, nodes, rootX)
      reflowColumnStrict(positions, nodes, COL.knowledge, rootX)
      const structural = nodes.filter((n) =>
        ['subject', 'domain', 'unit', 'cross_disciplinary_theme'].includes(
          n.type,
        ),
      )
      for (let i = 0; i < 5; i++) {
        separateColumnOverlaps(positions, structural, 36, rootX)
      }
      recenterParents(positions, nodes, nodeIdSet, containsMap, COL)
    }

    function getGraphBounds(data) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity
      data.forEach((n) => {
        if (n.x == null || n.y == null) return
        const raw = nodeMap[n.id]
        if (!raw) return
        const ext = getNodeVisualExtents(raw)
        minX = Math.min(minX, n.x + ext.left)
        maxX = Math.max(maxX, n.x + ext.right)
        minY = Math.min(minY, n.y + ext.top)
        maxY = Math.max(maxY, n.y + ext.bottom)
      })
      if (!isFinite(minX)) return null
      return { minX, maxX, minY, maxY }
    }

    function recenterParents(positions, nodes, nodeIdSet, containsMap, COL) {
      ;['unit', 'domain', 'subject'].forEach((type) => {
        nodes
          .filter((n) => n.type === type && nodeIdSet.has(n.id))
          .forEach((n) => {
            const children = (containsMap[n.id] || []).filter(
              (c) => nodeIdSet.has(c) && positions[c],
            )
            if (!children.length) return
            const ys = children.map((c) => positions[c].y)
            positions[n.id].x = colXForType(type, COL)
            positions[n.id].y = (Math.min(...ys) + Math.max(...ys)) / 2
          })
      })
    }

    /** 为课标(standard)、核心素养(competency)等非结构节点分配独立列坐标，避免落入兜底网格造成堆叠 */
    function placeAuxHierarchyNodes(positions, nodes, nodeIdSet, rootX) {
      const COL = hierarchyColumns(rootX)
      const d = activeDepthX
      const columnFor = {
        standard: COL.knowledge + d,
        competency: COL.knowledge + d * 2,
      }
        ;['standard', 'competency'].forEach((type) => {
          const colX = columnFor[type]
          const items = nodes
            .filter((n) => n.type === type && nodeIdSet.has(n.id))
            .map((n) => {
              const inEdge = GRAPH_DATA.edges.find(
                (e) =>
                  e.target === n.id &&
                  ['aligns_to', 'develops'].includes(e.relation) &&
                  positions[e.source],
              )
              const idealY = inEdge ? positions[inEdge.source].y : Infinity
              return { id: n.id, idealY }
            })
            .sort((a, b) => a.idealY - b.idealY)

          let yCursor = -Infinity
          items.forEach(({ id, idealY }) => {
            const ext = getNodeVisualExtents(nodeMap[id])
            const h = ext.bottom - ext.top
            let y = isFinite(idealY) ? idealY : yCursor === -Infinity ? 100 : yCursor
            if (yCursor !== -Infinity) y = Math.max(y, yCursor + h / 2)
            else y = Math.max(y, 80 + h / 2)
            positions[id] = { x: colX, y }
            yCursor = y + h / 2 + LAYOUT.rowGap
          })
        })
    }

    /** 兜底：把仍未定位的可见节点安置到最右列，防止堆叠在左上角 */
    function placeLeftoverNodes(positions, nodes, rootX) {
      const COL = hierarchyColumns(rootX)
      const d = activeDepthX
      const colX = COL.knowledge + d * 3
      let y = 80
      nodes.forEach((n) => {
        if (positions[n.id]) return
        const ext = getNodeVisualExtents(nodeMap[n.id])
        const h = ext.bottom - ext.top
        positions[n.id] = { x: colX, y: y + h / 2 }
        y += h + LAYOUT.rowGap
      })
    }

    function finalizeHierarchyLayout(positions, nodes, rootX = 60) {
      const COL = hierarchyColumns(rootX)
      const nodeIdSet = new Set(nodes.map((n) => n.id))
      const containsMap = buildHierarchyChildrenMap(nodeIdSet, ['contains'])
      snapToColumns(positions, nodes, rootX)
      reflowColumnStrict(positions, nodes, COL.lesson, rootX)
      reflowColumnStrict(positions, nodes, COL.knowledge, rootX)
      recenterParents(positions, nodes, nodeIdSet, containsMap, COL)
      const structural = nodes.filter((n) =>
        ['subject', 'domain', 'unit'].includes(n.type),
      )
      for (let i = 0; i < 4; i++) {
        separateColumnOverlaps(positions, structural, 36, rootX)
      }
      placeAuxHierarchyNodes(positions, nodes, nodeIdSet, rootX)
      placeLeftoverNodes(positions, nodes, rootX)
      // 安全网：整体去重叠（列间距足够大，主要沿纵向分离）
      resolveVisualBoxOverlaps(
        positions,
        nodes.map((n) => n.id),
        LAYOUT.overviewMinGap,
      )
      return positions
    }

    function computeHierarchyPositions(nodes) {
      if (currentView === 'math') {
        return finalizeHierarchyLayout(
          assignFullHierarchyLayout(nodes, 'M'),
          nodes,
          60,
        )
      }
      if (currentView === 'science') {
        return finalizeHierarchyLayout(
          assignFullHierarchyLayout(nodes, 'S'),
          nodes,
          60,
        )
      }
      if (currentView === 'all' && showAllDetail) {
        const mathN = nodes.filter(
          (n) =>
            getSubjectGroup(n.id) === 'math' ||
            getSubjectGroup(n.id) === 'cross',
        )
        const sciN = nodes.filter((n) => getSubjectGroup(n.id) === 'science')
        const mathPos = finalizeHierarchyLayout(
          assignFullHierarchyLayout(mathN, 'M'),
          mathN,
          60,
        )
        const sciPos = finalizeHierarchyLayout(
          assignFullHierarchyLayout(sciN, 'S'),
          sciN,
          60,
        )
        // 科学整体移到数学下方
        const mathBox = sideBoundingBox(mathPos, mathN.map((n) => n.id))
        const sciBox = sideBoundingBox(sciPos, sciN.map((n) => n.id))
        if (mathBox && sciBox) {
          const dy = mathBox.maxY + 140 - sciBox.minY
          Object.keys(sciPos).forEach((id) => {
            sciPos[id].y += Math.max(dy, 0)
          })
        }
        return { ...mathPos, ...sciPos }
      }
      return finalizeHierarchyLayout(
        assignFullHierarchyLayout(nodes, 'S'),
        nodes,
        60,
      )
    }

    function nodeRowHeight(n) {
      if (['knowledge', 'method'].includes(n.type))
        return knowledgeRowHeight(n)
      return LAYOUT.rowH[n.type] || LAYOUT.rowH.default
    }

    function hierarchyColumns(rootX = 60) {
      const d = activeDepthX
      return {
        subject: rootX,
        domain: rootX + d,
        unit: rootX + d * 2,
        lesson: rootX + d * 3,
        knowledge: rootX + d * 4,
      }
    }

    function colXForType(type, COL) {
      if (type === 'subject') return COL.subject
      if (type === 'domain') return COL.domain
      if (type === 'unit') return COL.unit
      if (type === 'lesson') return COL.lesson
      return COL.knowledge
    }

    function separateColumnOverlaps(
      positions,
      nodes,
      minGap = 20,
      rootX = 60,
    ) {
      const buckets = new Map()
      nodes.forEach((n) => {
        const p = positions[n.id]
        if (!p) return
        const key = columnKey(p.x, rootX)
        p.x = key
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key).push(n.id)
      })
      buckets.forEach((ids) => {
        ids.sort((a, b) => positions[a].y - positions[b].y)
        for (let i = 1; i < ids.length; i++) {
          const prevId = ids[i - 1]
          const currId = ids[i]
          const need =
            estimateNodeSize(nodeMap[prevId]).h / 2 +
            estimateNodeSize(nodeMap[currId]).h / 2 +
            minGap
          const gap = positions[currId].y - positions[prevId].y
          if (gap < need) {
            const shift = need - gap
            for (let j = i; j < ids.length; j++) positions[ids[j]].y += shift
          }
        }
      })
      return positions
    }

    function assignFullHierarchyLayout(nodes, rootId) {
      const nodeIdSet = new Set(nodes.map((n) => n.id))
      const containsMap = buildHierarchyChildrenMap(nodeIdSet, ['contains'])
      const teachesMap = buildHierarchyChildrenMap(nodeIdSet, [
        'teaches',
        'uses_method',
      ])
      const COL = hierarchyColumns(60)
      const positions = {}
      let cursorY = 88

      function layoutKnowledgeStack(kpIds, startY) {
        let y = startY
        kpIds.forEach((id) => {
          const kn = nodeMap[id]
          const h = nodeRowHeight(kn)
          positions[id] = { x: COL.knowledge, y: y + h / 2 }
          y += h + LAYOUT.rowGap
        })
        return y
      }

      function layoutLessonRow(lessonId) {
        const kps = sortChildIds(
          (teachesMap[lessonId] || []).filter((id) => nodeIdSet.has(id)),
        )
        const blockStart = cursorY
        const lessonH = nodeRowHeight(nodeMap[lessonId])

        if (!kps.length) {
          positions[lessonId] = { x: COL.lesson, y: cursorY + lessonH / 2 }
          cursorY += lessonH + LAYOUT.rowGap
          return
        }

        const kpEnd = layoutKnowledgeStack(kps, cursorY)
        const blockEnd = Math.max(cursorY + lessonH, kpEnd)
        positions[lessonId] = {
          x: COL.lesson,
          y: (blockStart + blockEnd) / 2,
        }
        cursorY = blockEnd + LAYOUT.rowGap
      }

      function layoutUnitBlock(unitId) {
        const lessons = sortChildIds(
          (containsMap[unitId] || []).filter(
            (id) => nodeIdSet.has(id) && nodeMap[id]?.type === 'lesson',
          ),
        )
        const blockStart = cursorY

        if (lessons.length) {
          lessons.forEach((lessonId) => layoutLessonRow(lessonId))
        } else {
          const kps = sortChildIds(
            (teachesMap[unitId] || []).filter((id) => nodeIdSet.has(id)),
          )
          if (kps.length) {
            cursorY = layoutKnowledgeStack(kps, cursorY)
          } else {
            const h = nodeRowHeight(nodeMap[unitId])
            cursorY += h
          }
        }

        const orphanKps = sortChildIds(
          (teachesMap[unitId] || []).filter(
            (id) => nodeIdSet.has(id) && !positions[id],
          ),
        )
        if (orphanKps.length) {
          cursorY = layoutKnowledgeStack(orphanKps, cursorY)
        }

        const unitH = nodeRowHeight(nodeMap[unitId])
        const blockEnd = Math.max(cursorY, blockStart + unitH)
        positions[unitId] = { x: COL.unit, y: (blockStart + blockEnd) / 2 }
        cursorY = blockEnd + LAYOUT.rowGap
      }

      function layoutNode(id) {
        if (!nodeIdSet.has(id)) return
        const n = nodeMap[id]

        if (n.type === 'unit') {
          layoutUnitBlock(id)
          return
        }
        if (n.type === 'lesson') {
          layoutLessonRow(id)
          return
        }

        const children = sortChildIds(
          (containsMap[id] || []).filter((c) => nodeIdSet.has(c)),
        )

        if (!children.length) {
          const h = nodeRowHeight(n)
          positions[id] = { x: colXForType(n.type, COL), y: cursorY + h / 2 }
          cursorY += h + LAYOUT.rowGap
          return
        }

        const blockStart = cursorY
        children.forEach((childId) => layoutNode(childId))
        const blockEnd = cursorY
        positions[id] = {
          x: colXForType(n.type, COL),
          y:
            (blockStart +
              Math.max(
                blockEnd - LAYOUT.rowGap,
                blockStart + nodeRowHeight(n),
              )) /
            2,
        }
        cursorY += LAYOUT.rowGap / 2
      }

      layoutNode(rootId)
      return positions
    }

    function attachSatelliteNodes(positions, nodes, nodeIdSet, rootX) {
      const COL = hierarchyColumns(rootX)
      const placed = new Set(Object.keys(positions))
      const byParent = new Map()
      sortChildIds(
        nodes
          .filter(
            (n) =>
              nodeIdSet.has(n.id) && ['knowledge', 'method'].includes(n.type),
          )
          .map((n) => n.id),
      ).forEach((id) => {
        if (placed.has(id)) return
        const anchor = resolveVisibleAnchor(id, nodeIdSet, positions)
        const parentKey = anchor || '__orphan__'
        if (!byParent.has(parentKey)) byParent.set(parentKey, [])
        byParent.get(parentKey).push(id)
      })

      let orphanY = 100
      byParent.forEach((kids, parentKey) => {
        if (parentKey === '__orphan__') {
          kids.forEach((id) => {
            const h = nodeRowHeight(nodeMap[id])
            positions[id] = { x: COL.knowledge, y: orphanY + h / 2 }
            orphanY += h + LAYOUT.rowGap
          })
          return
        }
        const parentPos = positions[parentKey]
        if (!parentPos) {
          kids.forEach((id) => {
            const h = nodeRowHeight(nodeMap[id])
            positions[id] = { x: COL.knowledge, y: orphanY + h / 2 }
            orphanY += h + LAYOUT.rowGap
          })
          return
        }
        if (kids.length === 1) {
          positions[kids[0]] = { x: COL.knowledge, y: parentPos.y }
          return
        }
        const totalH = kids.reduce(
          (s, id) => s + nodeRowHeight(nodeMap[id]) + LAYOUT.rowGap,
          -LAYOUT.rowGap,
        )
        let y = parentPos.y - totalH / 2
        kids.forEach((id) => {
          const h = nodeRowHeight(nodeMap[id])
          positions[id] = { x: COL.knowledge, y: y + h / 2 }
          y += h + LAYOUT.rowGap
        })
      })
    }

    function estimateNodeSize(n) {
      const r = getNodeSize(n) / 2
      const level = getNodeLevel(n)
      if (layoutMode === 'hierarchy' && level >= 3) {
        const charsPerLine = n.type === 'knowledge' ? 14 : 10
        const lines = Math.max(
          1,
          Math.ceil((n.name?.length || 0) / charsPerLine),
        )
        const labelH = lines * 15 + 10
        return { w: r * 2 + 48, h: r * 2 + labelH + 14 }
      }
      if (
        layoutMode === 'overview' &&
        ['subject', 'domain', 'unit'].includes(n.type)
      ) {
        const lines = Math.max(
          1,
          Math.ceil((getNodeLabel(n).length || 0) / 8),
        )
        const labelH = lines * 14 + 10
        return { w: r * 2 + 36, h: r * 2 + labelH + 14 }
      }
      const showLabel = shouldShowLabel(n)
      const label = showLabel ? getNodeLabel(n) : ''
      const charW = getNodeLevel(n) <= 2 ? 8 : 7
      const labelW = showLabel ? Math.min(label.length * charW + 24, 200) : 0
      return { w: r * 2 + labelW, h: r * 2 + 20 }
    }

    function buildNodeLabel(n, labelStyle, level) {
      const base = {
        show: shouldShowLabel(n),
        fontSize: labelStyle.fontSize,
        fontWeight: labelStyle.fontWeight,
        color: labelStyle.color,
      }
      if (layoutMode === 'hierarchy' && level >= 3) {
        return {
          ...base,
          position: 'bottom',
          distance: 6,
          width: n.type === 'knowledge' ? 200 : 160,
          overflow: 'break',
          lineHeight: 15,
          fontSize: n.type === 'knowledge' ? 10 : 11,
          align: 'center',
        }
      }
      if (
        layoutMode === 'overview' &&
        ['subject', 'domain', 'unit'].includes(n.type)
      ) {
        return {
          ...base,
          position: 'bottom',
          distance: 8,
          width: 150,
          overflow: 'break',
          lineHeight: 14,
          fontSize: n.type === 'subject' ? 12 : 11,
          align: 'center',
        }
      }
      if (
        layoutMode === 'overview' &&
        ['knowledge', 'method'].includes(n.type)
      ) {
        return {
          ...base,
          position: 'bottom',
          distance: 6,
          width: 140,
          overflow: 'break',
          lineHeight: 13,
          fontSize: 10,
          align: 'center',
        }
      }
      return {
        ...base,
        position: 'right',
        distance: level <= 2 ? 10 : 8,
      }
    }

    function resolveOverlaps(positions, nodes, minGap = 24) {
      const ids = nodes.map((n) => n.id).filter((id) => positions[id])
      for (let iter = 0; iter < 150; iter++) {
        let moved = false
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const a = positions[ids[i]]
            const b = positions[ids[j]]
            const na = nodeMap[ids[i]]
            const nb = nodeMap[ids[j]]
            const sa = estimateNodeSize(na)
            const sb = estimateNodeSize(nb)
            const sameCol = Math.abs(a.x - b.x) < 30
            const needX = sameCol ? 0 : (sa.w + sb.w) / 2 + minGap
            const needY = (sa.h + sb.h) / 2 + minGap + (sameCol ? 8 : 0)
            const dx = b.x - a.x
            const dy = b.y - a.y
            const overlapX = Math.abs(dx) < needX
            const overlapY = Math.abs(dy) < needY
            if (overlapX && overlapY) {
              if (sameCol || Math.abs(dy) <= Math.abs(dx)) {
                const pushY = (needY - Math.abs(dy)) / 2 + 1
                const sy = dy >= 0 ? 1 : -1
                a.y -= pushY * sy
                b.y += pushY * sy
              } else {
                const pushX = (needX - Math.abs(dx)) / 2 + 1
                const sx = dx >= 0 ? 1 : -1
                a.x -= pushX * sx
                b.x += pushX * sx
              }
              moved = true
            }
          }
        }
        if (!moved) break
      }
      return positions
    }

    function getContainsDescendants(rootId, visibleIds) {
      const containsMap = buildChildrenMap(
        GRAPH_DATA.edges.filter((e) => e.relation === 'contains'),
        ['contains'],
      )
      const out = []
      function collect(id) {
        ; (containsMap[id] || []).forEach((child) => {
          if (visibleIds.has(child)) {
            out.push(child)
            collect(child)
          }
        })
      }
      collect(rootId)
      return out
    }

    function getCrossCluster(nodeId, visibleIds) {
      const cluster = getThemeClusters().find(
        (c) => c.mathIds.includes(nodeId) || c.sciIds.includes(nodeId),
      )
      if (!cluster) return null
      return [...cluster.mathIds, ...cluster.sciIds].filter((id) =>
        visibleIds.has(id),
      )
    }

    function getTeachesCluster(nodeId, visibleIds) {
      const parentEdge = GRAPH_DATA.edges.find(
        (e) =>
          e.target === nodeId &&
          ['teaches', 'uses_method'].includes(e.relation),
      )
      if (!parentEdge || !visibleIds.has(parentEdge.source)) return null
      const unitId = parentEdge.source
      const group = new Set([
        unitId,
        ...getContainsDescendants(unitId, visibleIds),
      ])
      GRAPH_DATA.edges
        .filter(
          (e) =>
            e.source === unitId &&
            ['teaches', 'uses_method'].includes(e.relation),
        )
        .forEach((e) => {
          if (visibleIds.has(e.target)) group.add(e.target)
        })
      return [...group]
    }

    function getDragGroup(nodeId, visibleIds) {
      const cross = getCrossCluster(nodeId, visibleIds)
      if (cross) return cross

      const teaches = getTeachesCluster(nodeId, visibleIds)
      if (teaches) return teaches

      const group = [nodeId, ...getContainsDescendants(nodeId, visibleIds)]
      return group
    }

    function layoutSubtree(
      rootId,
      nodeIdSet,
      childrenMap,
      startX,
      depthX,
      rowH,
    ) {
      const positions = {}
      let cursorY = 50

      function walk(id, depth) {
        if (!nodeIdSet.has(id)) return null
        const children = (childrenMap[id] || []).filter((c) =>
          nodeIdSet.has(c),
        )
        if (!children.length) {
          positions[id] = { x: startX + depth * depthX, y: cursorY }
          cursorY += rowH
          return positions[id].y
        }
        const ys = children
          .map((c) => walk(c, depth + 1))
          .filter((y) => y !== null)
        const midY = ys.length
          ? (Math.min(...ys) + Math.max(...ys)) / 2
          : cursorY
        positions[id] = { x: startX + depth * depthX, y: midY }
        return midY
      }

      walk(rootId, 0)
      return { positions, maxY: cursorY }
    }

    function assignSubjectTreeLayout(nodes, edges, rootId) {
      return assignFullHierarchyLayout(nodes, rootId)
    }

    function assignSubjectForceSeeds(nodes, edges, rootId) {
      const nodeIdSet = new Set(nodes.map((n) => n.id))
      const childrenMap = buildChildrenMap(edges, [
        'contains',
        'teaches',
        'uses_method',
      ])
      const positions = {}
      const depths = {}

      function walk(id, depth) {
        if (!nodeIdSet.has(id)) return
        depths[id] = Math.min(depths[id] ?? 99, depth)
          ; (childrenMap[id] || []).forEach((c) => walk(c, depth + 1))
      }
      walk(rootId, 0)

      nodes.forEach((n) => {
        const d = depths[n.id] ?? 5
        positions[n.id] = { x: 100 + d * 110, y: 60 + Math.random() * 400 }
      })
      return positions
    }

    function collectSilkFocus(selectedId, edgeList) {
      if (!selectedId) return null
      const set = new Set([selectedId])
      const visibleIds = new Set([selectedId])
      edgeList.forEach((e) => {
        visibleIds.add(e.source)
        visibleIds.add(e.target)
        if (e.source === selectedId) set.add(e.target)
        if (e.target === selectedId) set.add(e.source)
      })
      getContainsDescendants(selectedId, visibleIds).forEach((id) => set.add(id))
        ;[...set].forEach((id) => {
          getCrossKnowledgePeers(id).forEach((p) => {
            if (visibleIds.has(p.id)) set.add(p.id)
          })
        })
      let cur = selectedId
      for (let i = 0; i < 8; i++) {
        const parent = GRAPH_DATA.edges.find(
          (e) => e.target === cur && e.relation === 'contains',
        )
        if (!parent) break
        set.add(parent.source)
        cur = parent.source
      }
      return set
    }

    function silkStroke(n) {
      const subject = getSubjectGroup(n.id)
      if (subject === 'math') return '#2563eb'
      if (subject === 'science') return '#059669'
      return '#ea580c'
    }

    function silkNodeSize(n) {
      const sizes = [56, 44, 34, 24, 20]
      return sizes[Math.min(getNodeLevel(n), 4)] || 20
    }

    function silkNodeStyle(raw, { isSelected, dimmed, isCross }) {
      if (isSelected) {
        return {
          color: '#fde68a',
          borderColor: '#f0c44a',
          borderWidth: 2.4,
          opacity: 1,
          shadowBlur: 20,
          shadowColor: 'rgba(240, 196, 74, 0.55)',
        }
      }
      if (isCross && !dimmed) {
        return {
          color: '#ffffff',
          borderColor: '#ea580c',
          borderWidth: 2.4,
          opacity: 1,
          shadowBlur: 8,
          shadowColor: 'rgba(234, 88, 12, 0.28)',
        }
      }
      const level = getNodeLevel(raw)
      return {
        color: '#ffffff',
        borderColor: silkStroke(raw),
        borderWidth: level <= 1 ? 2.8 : level === 2 ? 2.3 : 2,
        opacity: dimmed ? 0.16 : 1,
        shadowBlur: 0,
        shadowColor: 'transparent',
      }
    }

    function silkEdgeStyle(e, focusSet) {
      const focused = !!focusSet
      const onPath =
        focused && focusSet.has(e.source) && focusSet.has(e.target)
      const dim = focused && !onPath
      const sub = getSubjectGroup(e.source)
      if (e.relation === 'cross_links') {
        return {
          color: '#ea580c',
          width: onPath ? 3.6 : dim ? 1 : 2.2,
          type: 'dashed',
          curveness: 0.32,
          opacity: onPath ? 1 : dim ? 0.06 : 0.95,
          shadowBlur: onPath ? 18 : 0,
          shadowColor: 'rgba(234, 88, 12, 0.6)',
        }
      }
      if (e.relation === 'contains') {
        const idle = sub === 'science' ? '#059669' : '#2563eb'
        return {
          color: onPath || !dim ? idle : '#c3d2e6',
          width: onPath ? 3.2 : dim ? 1 : 2.15,
          type: 'solid',
          curveness: 0,
          opacity: onPath ? 1 : dim ? 0.06 : 0.9,
          shadowBlur: onPath ? 14 : 0,
          shadowColor:
            sub === 'science'
              ? 'rgba(5, 150, 105, 0.45)'
              : 'rgba(37, 99, 235, 0.45)',
        }
      }
      if (e.relation === 'teaches' || e.relation === 'uses_method') {
        const idle = sub === 'science' ? '#34d399' : '#60a5fa'
        const bright = sub === 'science' ? '#059669' : '#2563eb'
        return {
          color: onPath ? bright : dim ? '#c9d7ea' : idle,
          width: onPath ? 2.6 : dim ? 1 : 1.7,
          type: 'dashed',
          curveness: layoutMode === 'overview' ? 0.12 : 0.04,
          opacity: onPath ? 1 : dim ? 0.06 : 0.85,
          shadowBlur: onPath ? 10 : 0,
          shadowColor: 'rgba(59, 130, 246, 0.35)',
        }
      }
      if (e.relation === 'prerequisite_of') {
        return {
          color: onPath ? '#d97706' : dim ? '#fde68a' : '#f59e0b',
          width: onPath ? 3 : dim ? 1.2 : 2.4,
          type: 'solid',
          curveness: 0.06,
          opacity: onPath ? 1 : dim ? 0.08 : 0.95,
          shadowBlur: onPath ? 12 : 0,
          shadowColor: 'rgba(245, 158, 11, 0.45)',
        }
      }
      return {
        color: onPath ? '#475569' : dim ? '#d0d7e2' : '#64748b',
        width: onPath ? 2 : dim ? 1 : 1.5,
        type: 'solid',
        curveness: 0,
        opacity: onPath ? 0.95 : dim ? 0.05 : 0.72,
      }
    }

    function styleEdge(e) {
      if (e.relation === 'cross_links') {
        const srcSub = getSubjectGroup(e.source)
        const tgtSub = getSubjectGroup(e.target)
        const isMathSci =
          (srcSub === 'math' && tgtSub === 'science') ||
          (srcSub === 'science' && tgtSub === 'math')
        return {
          color: isMathSci
            ? '#ea580c'
            : tgtSub === 'math'
              ? '#2563eb'
              : '#059669',
          width: 2,
          type: 'dashed',
          curveness: 0.2,
          opacity: 0.85,
        }
      }
      if (e.relation === 'contains') {
        const src = nodeMap[e.source]
        const level = src ? getNodeLevel(src) : 1
        const sub = getSubjectGroup(e.source)
        const palette =
          sub === 'math'
            ? MATH_LEVEL_COLORS
            : sub === 'science'
              ? SCIENCE_LEVEL_COLORS
              : ['#94a3b8']
        return {
          color: palette[Math.min(level, 2)] || '#94a3b8',
          width: Math.max(1.5, 3.2 - level * 0.5),
          type: 'solid',
          curveness: 0,
          opacity: 0.9,
        }
      }
      if (e.relation === 'teaches' || e.relation === 'uses_method') {
        const sub = getSubjectGroup(e.source)
        return {
          color:
            sub === 'math'
              ? '#93c5fd'
              : sub === 'science'
                ? '#6ee7b7'
                : '#cbd5e1',
          width: 1.5,
          type: 'dashed',
          curveness: layoutMode === 'overview' ? 0.14 : 0.04,
          opacity: 0.75,
        }
      }
      if (e.relation === 'prerequisite_of') {
        return {
          color: '#f59e0b',
          width: 2.4,
          type: 'solid',
          curveness: 0.06,
          opacity: 0.95,
        }
      }
      if (e.relation === 'aligns_to') {
        return {
          color: '#8b5cf6',
          width: 1.8,
          type: 'dashed',
          curveness: 0.12,
          opacity: 0.85,
        }
      }
      return {
        color: RELATION_COLORS[e.relation] || '#cbd5e1',
        width: 1.2,
        type: 'solid',
        curveness: 0,
        opacity: 0.65,
      }
    }

    function buildHierarchyGraphics() {
      return []
    }

    /** 学习进阶：按前置依赖分层（左→右 = 先学→后学） */
    function computeProgressionPositions(nodes) {
      const ids = new Set(nodes.map((n) => n.id))
      const preds = new Map()
      const succs = new Map()
      ids.forEach((id) => {
        preds.set(id, [])
        succs.set(id, [])
      })
      GRAPH_DATA.edges.forEach((e) => {
        if (e.relation !== 'prerequisite_of') return
        if (!ids.has(e.source) || !ids.has(e.target)) return
        preds.get(e.target).push(e.source)
        succs.get(e.source).push(e.target)
      })

      const level = new Map()
      ids.forEach((id) => {
        if (!preds.get(id).length) level.set(id, 0)
      })
      let changed = true
      let guard = 0
      while (changed && guard++ < ids.size + 2) {
        changed = false
        ids.forEach((id) => {
          const ps = preds.get(id)
          if (!ps.length) return
          if (ps.some((p) => !level.has(p))) return
          const next = Math.max(...ps.map((p) => level.get(p))) + 1
          if (level.get(id) !== next) {
            level.set(id, next)
            changed = true
          }
        })
      }
      ids.forEach((id) => {
        if (!level.has(id)) level.set(id, 0)
      })

      const bySubject = { math: [], science: [], other: [] }
      nodes.forEach((n) => {
        const g = getSubjectGroup(n.id)
          ; (bySubject[g] || bySubject.other).push(n)
      })

      const positions = {}
      const colW = 260
      const rowGap = 56
      let yBase = 80

        ;['math', 'science', 'other'].forEach((sub) => {
          const group = bySubject[sub]
          if (!group.length) return
          const byLevel = new Map()
          group.forEach((n) => {
            const lv = level.get(n.id) || 0
            if (!byLevel.has(lv)) byLevel.set(lv, [])
            byLevel.get(lv).push(n)
          })
          const levels = [...byLevel.keys()].sort((a, b) => a - b)
          let maxRows = 1
          levels.forEach((lv) => {
            const list = sortChildIds(byLevel.get(lv).map((n) => n.id)).map(
              (id) => nodeMap[id],
            )
            byLevel.set(lv, list)
            maxRows = Math.max(maxRows, list.length)
          })
          levels.forEach((lv) => {
            const list = byLevel.get(lv)
            const totalH = (list.length - 1) * rowGap
            let y = yBase + (maxRows - 1) * rowGap * 0.5 - totalH / 2
            list.forEach((n) => {
              positions[n.id] = { x: 100 + lv * colW, y }
              y += rowGap
            })
          })
          yBase += maxRows * rowGap + 100
        })

      return positions
    }

    /** 课标对齐：知识点左列，课标右列，按学科分区 */
    function computeStandardsPositions(nodes) {
      const positions = {}
      const knowledge = nodes.filter((n) => n.type === 'knowledge')
      const standards = nodes.filter((n) => n.type === 'standard')
      const colKnowledge = 120
      const colStandard = 520
      const rowGap = 52
      let yBase = 80

        ;['math', 'science'].forEach((sub) => {
          const kps = sortChildIds(
            knowledge
              .filter((n) => getSubjectGroup(n.id) === sub)
              .map((n) => n.id),
          ).map((id) => nodeMap[id])
          const stds = sortChildIds(
            standards
              .filter((n) => getSubjectGroup(n.id) === sub)
              .map((n) => n.id),
          ).map((id) => nodeMap[id])
          if (!kps.length && !stds.length) return

          // 课标按关联知识点的平均 y 排列
          const kpY = new Map()
          kps.forEach((n, i) => {
            const y = yBase + i * rowGap
            positions[n.id] = { x: colKnowledge, y }
            kpY.set(n.id, y)
          })

          const stdOrder = stds
            .map((s) => {
              const linked = GRAPH_DATA.edges
                .filter(
                  (e) =>
                    e.relation === 'aligns_to' &&
                    e.target === s.id &&
                    kpY.has(e.source),
                )
                .map((e) => kpY.get(e.source))
              const avg = linked.length
                ? linked.reduce((a, b) => a + b, 0) / linked.length
                : yBase + stds.indexOf(s) * rowGap
              return { s, avg }
            })
            .sort((a, b) => a.avg - b.avg)

          stdOrder.forEach(({ s, avg }, i) => {
            const y = Math.max(
              yBase + i * rowGap,
              avg - 20,
            )
            positions[s.id] = { x: colStandard, y }
          })

          // 纵向拉开课标，避免重叠
          const stdIds = stdOrder.map((o) => o.s.id)
          for (let i = 1; i < stdIds.length; i++) {
            const prev = positions[stdIds[i - 1]]
            const cur = positions[stdIds[i]]
            if (cur.y < prev.y + rowGap) cur.y = prev.y + rowGap
          }

          const used = [...kps, ...stds]
            .map((n) => positions[n.id]?.y || 0)
          const maxY = used.length ? Math.max(...used) : yBase
          yBase = maxY + 120
        })

      nodes.forEach((n, i) => {
        if (!positions[n.id]) {
          positions[n.id] = { x: 200 + (i % 4) * 80, y: yBase + i * 40 }
        }
      })
      return positions
    }

    function buildGraphData() {
      const nodes = filterNodes()
      const nodeIds = nodes.map((n) => n.id)
      const edges = filterEdges(nodeIds)

      let positions = {}
      if (layoutMode === 'progression' || currentLens === 'progression') {
        positions = computeProgressionPositions(nodes)
      } else if (layoutMode === 'standards' || currentLens === 'standards') {
        positions = computeStandardsPositions(nodes)
      } else if (layoutMode === 'overview') {
        positions = buildOverviewPositions(nodes)
      } else if (layoutMode === 'hierarchy') {
        positions = computeHierarchyPositions(nodes)
      } else if (layoutMode === 'force') {
        const saved = loadSavedPositions()
        if (Object.keys(saved).length) positions = saved
        else if (currentView === 'math')
          positions = assignFullHierarchyLayout(nodes, 'M')
        else if (currentView === 'science')
          positions = assignFullHierarchyLayout(nodes, 'S')
      }

      nodes.forEach((n, i) => {
        if (!positions[n.id]) {
          positions[n.id] = {
            x: 80 + (i % 8) * 90,
            y: 80 + Math.floor(i / 8) * 70,
          }
        }
      })

      const silkFocus = isSilk ? collectSilkFocus(selectedNodeId, edges) : null
      const echartsNodes = nodes.map((n) => {
        const raw = nodeMap[n.id]
        const color = getNodeColor(raw)
        const pos = positions[n.id]
        const isHighlighted = selectedNodeId === n.id
        const isSearchDim = searchQuery && !n.name.includes(searchQuery)
        const size = isSilk ? silkNodeSize(raw) : getNodeSize(raw)
        const labelStyle = getNodeLabelStyle(raw)
        const level = getNodeLevel(raw)
        const dimmed =
          isSearchDim || (silkFocus && !silkFocus.has(n.id))
        const showCrossColor =
          currentLens === 'cross' ||
          (currentLens === 'structure' && currentView === 'all')
        const isCross = showCrossColor && isCrossLinkedNode(n.id)
        const itemStyle = isSilk
          ? silkNodeStyle(raw, {
            isSelected: isHighlighted,
            dimmed,
            isCross,
          })
          : {
            color,
            borderColor: isHighlighted ? '#111' : getNodeBorderColor(raw),
            borderWidth: isHighlighted
              ? 3
              : level <= 1
                ? 2.5
                : level === 2
                  ? 2
                  : 1,
            opacity: isSearchDim ? 0.3 : 1,
            shadowBlur: level <= 1 ? 6 : 0,
            shadowColor: level <= 1 ? 'rgba(0,0,0,0.12)' : 'transparent',
          }
        const label = buildNodeLabel(n, labelStyle, level)
        if (isSilk) {
          if (dimmed) {
            label.color = 'rgba(71,85,105,0.32)'
          } else if (isCross) {
            label.color = '#c2410c'
          }
          label.fontWeight = isHighlighted || isCross || level <= 2 ? '600' : label.fontWeight
        }

        return {
          id: n.id,
          name: getNodeLabel(n),
          fullName: n.name,
          nodeType: n.type,
          nodeLevel: level,
          symbol: isSilk ? 'circle' : getNodeSymbol(raw),
          symbolSize: isHighlighted && isSilk ? size + 6 : size,
          x: pos?.x,
          y: pos?.y,
          fixed: false,
          itemStyle,
          label,
          emphasis: {
            label: {
              show: true,
              fontSize: (label.fontSize || labelStyle.fontSize) + 1,
              fontWeight: 'bold',
              color: isSilk ? '#1e293b' : labelStyle.color,
            },
            itemStyle: isSilk
              ? {
                borderWidth: 2.2,
                shadowBlur: 16,
                shadowColor: 'rgba(240, 196, 74, 0.45)',
              }
              : { borderWidth: 3, shadowBlur: 10 },
          },
        }
      })

      const echartsEdges = edges.map((e) => {
        const isCrossEdge = e.relation === 'cross_links'
        const isPrereq = e.relation === 'prerequisite_of'
        const focusedCross =
          isSilk &&
          isCrossEdge &&
          silkFocus &&
          silkFocus.has(e.source) &&
          silkFocus.has(e.target)
        return {
          id: `${e.relation}|${e.source}|${e.target}`,
          source: e.source,
          target: e.target,
          relation: e.relation,
          // 前置：从先学指向后学，箭头表示进阶方向
          symbol: isPrereq ? ['none', 'arrow'] : ['none', 'none'],
          symbolSize: isPrereq ? [0, 18] : [0, 0],
          lineStyle: isSilk ? silkEdgeStyle(e, silkFocus) : styleEdge(e),
          label:
            isSilk && isCrossEdge
              ? {
                show: !!focusedCross,
                formatter: '跨学科',
                fontSize: 10,
                color: '#c2410c',
                backgroundColor: 'rgba(255,247,237,0.94)',
                padding: [2, 6],
                borderRadius: 8,
              }
              : undefined,
          emphasis: isCrossEdge
            ? { lineStyle: { width: 3.2, color: '#ea580c', opacity: 1 } }
            : isPrereq
              ? { lineStyle: { width: 3.2, color: '#d97706', opacity: 1 } }
              : undefined,
        }
      })

      return {
        nodes: echartsNodes,
        edges: echartsEdges,
        rawNodeCount: nodes.length,
        rawEdgeCount: edges.length,
      }
    }

    return {
      GRAPH_DATA,
      nodeMap,
      focusIds,
      computeFocusIds,
      getSubjectGroup,
      getThemeClusters,
      buildKnowledgeCrossEdges,
      buildBridgedTeachingEdges,
      getCrossKnowledgePeers,
      isCrossLinkedNode,
      getCrossRelevantNodeIds,
      isCrossViewNode,
      isOverviewNode,
      isProgressionNode,
      isStandardsAlignedNode,
      getAncestorByType,
      getNodeLevel,
      getNodeColor,
      getNodeBorderColor,
      getNodeSymbol,
      getNodeSize,
      getNodeLabelStyle,
      getTeachingParent,
      resolveTeachingAnchor,
      resolveVisibleAnchor,
      getNodeVisualExtents,
      measurePositionsExtent,
      sortChildIds,
      buildHierarchyChildrenMap,
      getNodeLabel,
      shouldShowLabel,
      filterNodes,
      filterEdges,
      buildChildrenMap,
      layoutTreeNoOverlap,
      maxRowH,
      knowledgeRowHeight,
      columnKey,
      snapToColumns,
      separateColumnOverlaps,
      reflowColumnStrict,
      columnStartY,
      shiftNodePositions,
      sideBoundingBox,
      boxesOverlap,
      separateMathAndScience,
      resolveVisualBoxOverlaps,
      enforceSideSeparation,
      layoutOverviewKnowledgeColumn,
      finalizeOverviewSide,
      placeCrossKnowledge,
      buildOverviewPositions,
      finalizeSubjectSide,
      getGraphBounds,
      recenterParents,
      placeAuxHierarchyNodes,
      placeLeftoverNodes,
      finalizeHierarchyLayout,
      computeHierarchyPositions,
      nodeRowHeight,
      hierarchyColumns,
      colXForType,
      assignFullHierarchyLayout,
      attachSatelliteNodes,
      estimateNodeSize,
      buildNodeLabel,
      resolveOverlaps,
      getContainsDescendants,
      getCrossCluster,
      getTeachesCluster,
      getDragGroup,
      layoutSubtree,
      assignSubjectTreeLayout,
      assignSubjectForceSeeds,
      styleEdge,
      buildHierarchyGraphics,
      buildGraphData,
    }
  }

  return {
    create,
    TYPE_LABELS,
    RELATION_LABELS,
    TYPE_COLORS,
    RELATION_COLORS,
    SIZE_MAP,
    STATUS_LABELS,
    OVERVIEW_TYPES,
    POS_STORAGE_KEY,
    TYPE_LEVEL,
    TYPE_ORDER,
    LAYOUT,
    MATH_LEVEL_COLORS,
    SCIENCE_LEVEL_COLORS,
    MATH_SHADES,
    SCIENCE_SHADES,
    SUBJECT_LABELS,
    SUBJECT_COLORS,
    STATUS_OPTIONS,
    cloneGraphData,
  }
})
