# 智启插件调用说明

面向智启智能体：用本插件替代「图谱知识库检索 + 静态图片索引」。

**职责边界**

| 角色 | 做什么 |
| --- | --- |
| 智启大模型 | 理解教师表述、分析活动主题、生成 `query_terms`、解释返回的关系 |
| 本插件查询接口 | 匹配真实知识点；按节点 ID 查真实边与来源 |
| 本插件图片接口 | 按快照子图动态出图 |
| 教师 | 确认知识点、跨学科方向、活动主题 |

活动主题（如「做月饼」）**不要**直接丢给查询接口强行匹配；应先由智启拆成本学科知识点候选，教师确认后再查。

平台外层 `code=200` 只表示调用完成。业务成败看本接口返回体里的 `status` 与 `image_status`。

---

## 推荐调用顺序

```
1. searchKnowledgePoints      (/api/knowledge-search)
   └─ 智启展示候选 → 教师确认节点 ID

2. queryCrossDisciplinaryRelations  (/api/cross-query)
   └─ 得到 relations / evidence_paths / snapshot_id
   └─ 智启解释关系 → 教师选择学科或 relation_id（可选）

3. renderSnapshotImage        (/api/snapshot-image)
   └─ 得到 image_url / image_markdown / page_url

4. getSnapshot                (/api/snapshot)   【跨轮次恢复时】
```

旧接口 `/api/search`、`/api/render` 仍可用，但不走快照子图契约。

---

## 参数映射

### 1) 搜索候选知识点 `POST /api/knowledge-search`

| 智启变量 | 参数 | 说明 |
| --- | --- | --- |
| 主学科 | `main_subject` | 数学 / 科学 |
| 年级 | `grade` | 支持「小学三年级」「三年级」等 |
| 册次 | `semester` | 支持「上学期」「上册」等 |
| 教师原话 | `query` | 可选 |
| 候选词 | `query_terms` | string 数组，保留数组形态 |
| 条数 | `limit` | 默认 5，最大 10 |

**请求示例**

```json
{
  "main_subject": "数学",
  "grade": "小学三年级",
  "semester": "上学期",
  "query": "倍数和平均分",
  "query_terms": ["几倍的问题", "平均分东西", "倍数的关系"],
  "limit": 5
}
```

**成功响应要点**

```json
{
  "code": 0,
  "status": "success",
  "message": "",
  "request_id": "req_…",
  "graph_version": "2.0@2026-09-09#…",
  "warnings": [],
  "matches": [
    {
      "query_term": "几倍的问题",
      "status": "success",
      "matched_node_id": "M-K-TIMES",
      "candidates": [
        {
          "node_id": "M-K-TIMES",
          "name": "一个数是另一个数的几倍用除法，求几倍用乘法",
          "hit_term": "几倍的问题",
          "match_method": "alias",
          "score": 0.96,
          "match_reason": "别名精确匹配：「几倍的问题」→「…」",
          "definite": true,
          "needs_confirmation": false,
          "scope": { "grade": "三年级", "semester": "上册", "subject": "数学", "label": "三年级上册·数学" }
        }
      ]
    }
  ],
  "matched_nodes": [/* 已明确匹配的节点 */],
  "unmatched_queries": [],
  "image_status": "not_requested",
  "image_url": "",
  "image_markdown": "",
  "page_url": "",
  "truncated": false
}
```

`status` 常见值：`success` / `ambiguous`（需确认）/ `partial` / `not_found` / `out_of_scope` / `invalid_input`。

`score` 只是排序分，**不是**语义置信度或准确率。

---

### 2) 跨学科关系 + 快照 `POST /api/cross-query`

| 智启变量 | 参数 |
| --- | --- |
| 已确认知识点 ID 列表 | `main_node_ids`（string 数组） |
| 可选候选学科 | `candidate_subjects`（如 `["科学"]`，仅为过滤推荐） |
| 可选版本 | `graph_version` |

**请求示例**

```json
{
  "main_node_ids": ["M-K-LENGTH", "M-K-QUANTITY"],
  "candidate_subjects": ["科学"]
}
```

**响应要点**

- `relations[]`：含 `relation_id`、`theme_node_id`、`description`（事实路径，非教学编造）
- `evidence_paths[]`：完整节点/边，区分 `relation_kind: original` 与 `visual_derived`
- `sources[]`：保留 `recommended` 等标记
- `snapshot_id`：后续出图与跨轮次读取
- `no_relation`：查无关系；`error`：数据源/存储故障（二者不混淆）

---

### 3) 按快照出图 `POST /api/snapshot-image`

```json
{
  "snapshot_id": "snap_…",
  "relation_ids": ["rel_…"],
  "subject": "科学",
  "preset": "word",
  "scale": 2
}
```

- `image_url` / `page_url`：纯 URL
- `image_markdown`：`![alt](url)`
- 仅 PNG 实际写入后 `image_status=success`
- 出图失败时关系字段仍保留，`image_status=error`，`image_message` 说明原因

图片短链形态：`/i/s/<imageId>.png`（无中文、无完整查询参数）。

---

### 4) 读取快照 `POST /api/snapshot`

```json
{ "snapshot_id": "snap_…", "include_subgraph": false }
```

旧快照不随底层 `data.json` 更新而改变。

---

## 同义词维护

文件：`config/knowledge-aliases.json`

- `aliases`：可靠别名，可标明确匹配
- `keywords`：辅助词，一律需确认
- 相关但不同的概念分属不同 `node_id`，不要互标同义

---

## 部署配置

| 变量 | 作用 |
| --- | --- |
| `PUBLIC_BASE_URL` | 对外域名（生成绝对图片链接） |
| `PLUGIN_API_KEY` | 可选；设置后要求 `x-api-key` 或 `Bearer` |
| `SNAPSHOT_DIR` | **线上必配**持久化目录；不配时 Vercel 等临时盘会明确报错 |
| `GRAPH_DATA_URL` | 可选，云端 data.json |

本地默认写入项目下 `.data/`（已 gitignore）。**不要**把临时目录当成线上持久化方案。

尚未在本次交付中验证：线上 Vercel 部署、智启平台实机导入、Word 嵌入拉图。请部署并配置 `SNAPSHOT_DIR` / `PUBLIC_BASE_URL` 后再做联调。

---

## 本地验证

```bash
npm install
node scripts/test-plugin-api.mjs
npm run dev   # http://127.0.0.1:8099
```
