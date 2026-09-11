# 腾讯云中转（智启专用）

智启河北机房访问不了 `*.vercel.app`，会 30 秒超时。  
Word 工具已用过同一方案：腾讯云 **香港** Web 函数做反向代理，智启只打腾讯云地址。

```
智启机房 → 腾讯云 SCF（香港）→ Vercel（知识图谱）→ 返回 JSON / Blob 图片链接
```

教师浏览器打开 `image_url`（Blob HTTPS）不经过智启机房，一般可直接看图。

## 1. 新建函数（与 Word 工具相同）

1. 打开 [云函数控制台](https://console.cloud.tencent.com/scf)
2. 右上角地域选 **香港**（不要用北京做出网转发）
3. **新建** → **Web 函数** → Nodejs 18 → 在线编辑
4. 名称建议：`zhiqi-kg-proxy-hk`
5. 执行超时：**60** 秒；内存 128–512MB 均可
6. 代码：
   - 若文件叫 `index.js`：粘贴本目录 `index.js`，启动命令用 `scf_bootstrap`
   - 若模板是 `app.js`：内容仍贴 `index.js`，启动命令用：

```bash
#!/bin/bash
export PORT=9000
/var/lang/node18/bin/node app.js
```

7. **函数 URL / 触发管理**：开启 **公网访问**，授权 **开放**
8. 复制得到的 `https://....ap-hongkong.tencentscf.com` 发我，或自己改 OpenAPI

可选环境变量：

| 变量 | 默认 |
| --- | --- |
| `UPSTREAM_URL` | `https://rdfx-grade3-kg-deploy.vercel.app` |
| `UPSTREAM_TIMEOUT_MS` | `55000` |

## 2. 改智启插件地址

OpenAPI / 插件 `servers.url` **不要**再写 Vercel，改成腾讯云香港 URL，例如：

```json
"servers": [{ "url": "https://你的函数ID.ap-hongkong.tencentscf.com" }]
```

路径不变：`/api/knowledge-search` 等。

鉴权仍用原来的 `PLUGIN_API_KEY`（`x-api-key` / Bearer）。

## 3. 自测

```bash
curl -sS "https://你的香港URL/api/health"

curl -sS -X POST "https://你的香港URL/api/knowledge-search" \
  -H "Content-Type: application/json" \
  -H "x-api-key: 你的PLUGIN_API_KEY" \
  -d '{"main_subject":"数学","grade":"三年级","semester":"上册","query_terms":["几倍的问题"]}'
```

## 4. 和 Word 工具的关系

Word 已有香港函数：`https://1304703298-9af6oq2q1h.ap-hongkong.tencentscf.com`（上游是 Word）。  
知识图谱请 **另建一个函数**，不要改 Word 那个的上游，以免互相覆盖。

北京函数即使公网可开，通常也出网打不到 Vercel，不要填进智启。

## 当前已开通

- 中转地址：https://1304703298-cmqu6br21n.ap-hongkong.tencentscf.com
- 已测：`/api/health`、`/api/knowledge-search`、`/api/cross-query` 经中转成功
- 智启 OpenAPI `servers[0].url` 已写此地址

