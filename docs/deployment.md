# 部署说明（对齐 Word 工具：GitHub + Vercel + Blob）

本文只提供步骤；密钥不要提交到 Git。

当前已关联的 Vercel 项目名：`rdfx-grade3-kg-deploy`  
预期生产域名示例：`https://rdfx-grade3-kg-deploy.vercel.app`  
代码仓库：`https://github.com/BonnyBing/rdfx-grade3-knowledge-graph`

## 与 Word 工具的对应关系

| Word 工具 | 知识图谱插件 |
| --- | --- |
| `DOCX_API_KEY` | `PLUGIN_API_KEY`（可选；建议生产开启） |
| `BLOB_READ_WRITE_TOKEN` | 同左，存快照 JSON 与 PNG |
| `word_url` = Blob HTTPS | `image_url` = Blob HTTPS（无 Blob 时退回站点 `/i/s/...`） |
| `/api/health` | `/api/health` |
| OpenAPI 导入智启 | `openapi.json` |

## 1. 推送代码到 GitHub

在本目录（含 `api/`、`public/`、`vercel.json`）作为仓库根目录：

```bash
cd 知识图谱
git status
# 若尚未指向 rdfx-grade3-knowledge-graph，请确认 remote 后再 push
git add -A
git commit -m "Add knowledge search, cross-query, snapshot image APIs with Blob storage."
git push origin main
```

不要提交 `.env`、`.env.local`、`.data/`、真实 API 密钥。

## 2. Vercel 项目

已有项目可跳过创建：

1. [Vercel Dashboard](https://vercel.com/dashboard) → 打开 `rdfx-grade3-kg-deploy`
2. 确认 Git 仓库连的是 `BonnyBing/rdfx-grade3-knowledge-graph`
3. Framework Preset：Other；Root Directory：仓库根目录
4. Node.js：20.x+

## 3. 创建 / 连接 Vercel Blob

1. 项目 → Storage → Create Database → Blob
2. 选 **public** store（图片需可被 Word / 聊天直接拉取）
3. 连接到本项目，复制 `BLOB_READ_WRITE_TOKEN`

隐私说明：拿到 `image_url` 的人即可查看图片；路径含随机 ID，但不是访问控制。不要存含学生隐私的图。

## 4. 环境变量

Project → Settings → Environment Variables（Production + Preview）：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | 线上必填 | Blob 读写令牌 |
| `PUBLIC_BASE_URL` | 建议 | `https://rdfx-grade3-kg-deploy.vercel.app` |
| `PLUGIN_API_KEY` | 建议 | 智启插件 `x-api-key`，长随机串 |
| `GRAPH_DATA_URL` | 否 | 云端 `data.json` 地址 |

保存后 Redeploy。

## 5. 部署

推送 `main` 自动部署，或在 Vercel 点 Redeploy。也可用：

```bash
npx vercel --prod
```

## 6. 验证

```bash
curl -sS https://rdfx-grade3-kg-deploy.vercel.app/api/health
```

期望含 `"status":"ok"`、`"blob_configured":true`。

```bash
curl -sS -X POST https://rdfx-grade3-kg-deploy.vercel.app/api/knowledge-search \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_PLUGIN_API_KEY' \
  -d '{"main_subject":"数学","grade":"三年级","semester":"上册","query_terms":["几倍的问题"]}'
```

```bash
curl -sS -X POST https://rdfx-grade3-kg-deploy.vercel.app/api/cross-query \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_PLUGIN_API_KEY' \
  -d '{"main_node_ids":["M-K-LENGTH"],"candidate_subjects":["科学"]}'
```

拿到 `snapshot_id` 后再调 `/api/snapshot-image`，检查 `image_status=success` 且 `image_url` 以 `https://` 开头。

## 7. 更新 OpenAPI 并导入智启

1. 确认 `openapi.json` 里 `servers[0].url` 为生产域名
2. 智启 → 插件 → 导入 OpenAPI 3.0
3. 认证：API Key，`x-api-key`，与 `PLUGIN_API_KEY` 一致
4. 调用顺序见 `docs/zhiqi-plugin-guide.md`

## 8. 本地联调（可选）

```bash
npx vercel login
npx vercel link   # 选 rdfx-grade3-kg-deploy
npx vercel env pull .env.local
npm run dev
# 或
npx vercel dev
```

## 尚未替你完成的事项

- 在 Vercel 控制台创建/绑定 Blob（需你账号操作）
- 写入真实 `PLUGIN_API_KEY` / `BLOB_READ_WRITE_TOKEN`
- 智启平台实机导入与 Word 嵌入验证
