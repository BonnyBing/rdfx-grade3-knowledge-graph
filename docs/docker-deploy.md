# 公司服务器 Docker 部署（端口直出）

目标机：`zhiqi-op-kg-md-api`（`10.20.0.34`）。两个插件各跑一个容器，端口直出；快照、PNG 和 Word 文件存在本机 Docker volume。

| 服务 | 容器 | 端口 | 智启 OpenAPI servers.url |
| --- | --- | --- | --- |
| 知识图谱 | `zhiqi-kg-api` | `8099` | `http://10.20.0.34:8099` |
| Markdown→Word | `zhiqi-word-api` | `8100` | `http://10.20.0.34:8100` |

## 目录约定

```text
/opt/zhiqi/
├── kg/      ← github.com/BonnyBing/rdfx-grade3-knowledge-graph
│   └── deploy/   docker-compose.yml、env.example、.env
└── word/    ← github.com/BonnyBing/zhiqi-markdown-docx
```

## 1. 拉代码

```bash
mkdir -p /opt/zhiqi && cd /opt/zhiqi
git clone https://github.com/BonnyBing/rdfx-grade3-knowledge-graph.git kg
git clone https://github.com/BonnyBing/zhiqi-markdown-docx.git word
```

## 2. 配置密钥

```bash
cd /opt/zhiqi/kg/deploy
cp env.example .env
openssl rand -hex 32   # 填 PLUGIN_API_KEY
openssl rand -hex 32   # 填 DOCX_API_KEY
vi .env
```

## 3. 启动

```bash
cd /opt/zhiqi/kg/deploy
docker compose up -d --build
docker compose ps
```

## 4. 验收

```bash
curl -sS http://127.0.0.1:8099/api/health
curl -sS http://127.0.0.1:8100/api/health

source .env
curl -sS -X POST http://10.20.0.34:8099/api/knowledge-search \
  -H 'Content-Type: application/json' -H "x-api-key: $PLUGIN_API_KEY" \
  -d '{"main_subject":"数学","grade":"三年级","semester":"上册","query_terms":["几倍的问题"]}'

curl -sS -X POST http://10.20.0.34:8100/api/generate-docx \
  -H 'Content-Type: application/json' -H "x-api-key: $DOCX_API_KEY" \
  -d '{"markdown":"# 测试\n\n一段正文。","filename":"测试教案"}'
```

Word 成功时 `word_url` 形如 `http://10.20.0.34:8100/files/<uuid>.docx`。

## 5. 智启插件

1. 知识图谱：导入 `openapi-zhiqi.json`，认证 API Key，`x-api-key` = `PLUGIN_API_KEY`
2. Word：导入 word 仓库的 `openapi/zhiqi-markdown-docx-plugin.yaml`，`x-api-key` = `DOCX_API_KEY`
3. 业务成败看返回体 `status` / `image_status` / `word_status`，不要只看平台外层 200

## 6. 更新与运维

```bash
cd /opt/zhiqi/kg && git pull
cd /opt/zhiqi/word && git pull
cd /opt/zhiqi/kg/deploy && docker compose up -d --build

docker compose logs -f --tail=100
docker compose down    # 停容器，volume 数据保留
```
