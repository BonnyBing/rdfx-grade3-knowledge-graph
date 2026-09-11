# 智启知识图谱

面向**全学段、全学科**的课程知识图谱：交互页面 + 出图接口。当前已落地首批内容为三年级上册数学与科学，后续将按年级、册次与学科持续扩展。

接口返回 PNG 直链，智能体拿到链接就能写进 Word；网页版仍可缩放、拖拽、编辑和同步。两边的节点筛选与坐标计算是同一份代码，所以图片和网页看到的是同一张图谱。

## 能力

| 能力 | 地址 | 说明 |
| --- | --- | --- |
| 交互页面 | `/` | 原有页面，支持 URL 参数深链 |
| 知识点查询 | `POST /api/knowledge-search` | 范围限定 + 别名/关键词；供智启确认知识点 |
| 跨学科关系 | `POST /api/cross-query` | 按节点 ID 查路径、建快照 |
| 快照出图 | `POST /api/snapshot-image` | 按快照子图动态生成 PNG |
| 读取快照 | `POST /api/snapshot` | 跨轮次恢复 |
| 出图（兼容） | `POST /api/render` | 旧版 view/focus 出图链接 |
| 图片直链 | `GET /i/<token>.png` · `GET /i/s/<id>.png` | PNG 字节；后者为快照短链 |
| 节点检索（兼容） | `POST /api/search` | 旧版名称模糊匹配 |
| 云端保存 | `POST /api/save-graph` | 页面编辑后写回 GitHub（需配置令牌） |

智启接入说明见 [docs/zhiqi-plugin-guide.md](docs/zhiqi-plugin-guide.md)。部署步骤见 [docs/deployment.md](docs/deployment.md)。本地回归：`npm run test:plugin`。

生产域名：`https://rdfx-grade3-kg-deploy.vercel.app`（需配置 `BLOB_READ_WRITE_TOKEN` 后快照出图才可持久化）。

## 快速开始

```bash
npm install
npm run dev      # http://127.0.0.1:8099
npm run sample   # 出一批样图到 dist/samples 供人工检查
npm run gallery  # 按维度穷举出全套图片到 维度图库/
```

出图示例：

```bash
# 一句话出图，接口自己判断视图和聚焦节点
curl -X POST http://127.0.0.1:8099/api/render \
  -H 'Content-Type: application/json' \
  -d '{"query":"三年级上册数学第一单元混合运算"}'

# 明确指定参数
curl -X POST http://127.0.0.1:8099/api/render \
  -H 'Content-Type: application/json' \
  -d '{"view":"science","focus":"S-U-WEATHER","depth":2}'
```

返回里的 `image_url` 就是可直接插入文档的图片地址。

## 部署到 Vercel（免费额度足够）

1. 把本目录推到一个 GitHub 仓库。
2. Vercel 控制台 **Add New → Project**，选中该仓库，框架选 **Other**，其余保持默认，Deploy。
3. 部署完成后访问 `https://<你的域名>/` 确认页面正常，再访问
   `https://<你的域名>/api/render?view=math` 确认接口返回 JSON。

可选环境变量（Project Settings → Environment Variables）：

详见 [docs/deployment.md](docs/deployment.md)（对齐 Word 工具的 GitHub + Vercel + Blob 流程）。

| 变量 | 作用 |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | **线上推荐**。快照与 PNG 存 Vercel Blob，与 Word 工具相同 |
| `PUBLIC_BASE_URL` | 对外域名，如 `https://rdfx-grade3-kg-deploy.vercel.app` |
| `PLUGIN_API_KEY` | 可选。智启插件鉴权；设置后需传 `x-api-key` 或 `Authorization: Bearer` |
| `GRAPH_DATA_URL` | 云端 data.json 地址。配了它，老师在页面上保存后出图就能用上最新数据（服务端缓存 5 分钟）。不配则用随包数据。 |
| `SNAPSHOT_DIR` | 仅在无 Blob、又有可写持久盘时使用；本地默认 `.data/` |
| `GITHUB_TOKEN` / `GITHUB_REPO` | 启用 `/api/save-graph` 写回仓库，`GITHUB_REPO` 形如 `owner/name` |
| `GITHUB_BRANCH` / `GITHUB_FILE` | 默认 `main` 和 `data.json` |
| `SAVE_PASSCODE` | 给保存接口加个口令 |

页面默认仍把「保存并同步」指向原有的保存服务（`index.html` 里的 `REMOTE_SYNC.saveApiUrl`）。想改用本项目自带的保存接口，把它改成 `/api/save-graph` 并配好上面的 GitHub 变量。

## 接入智能体插件

1. 新建插件，用 OpenAPI/Swagger 导入本目录的 `openapi.json`（先把 `servers[0].url` 改成实际域名）。
2. 会得到：`searchKnowledgePoints`、`queryCrossDisciplinaryRelations`、`renderSnapshotImage`、`getSnapshot`，以及兼容旧工具 `searchKnowledgeGraphNodes` / `renderKnowledgeGraph`。
3. 调用顺序与示例见 [docs/zhiqi-plugin-guide.md](docs/zhiqi-plugin-guide.md)。

> 智启先把教师表述拆成知识点候选并调用 searchKnowledgePoints；教师确认节点 ID 后调用 queryCrossDisciplinaryRelations；再按 snapshot_id 调用 renderSnapshotImage。把返回的 image_url 作为图片地址插入回答。业务成败看返回体 status / image_status，不要只看平台外层 200。

## 出图参数

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `query` | 一句话 | 用户原话，自动解析出视图和聚焦节点，传了它就不必再传 view/focus |
| `view` | `all` `math` `science` `cross` | 视图范围，默认 `all` |
| `focus` | 节点 ID 或名称 | 只画该节点周围的子图，节点更少、文字更大 |
| `depth` | 1–4 | 聚焦时向外扩几层，默认 2 |
| `detail` | 布尔 | 展开知识点、课标、核心素养等全部细节 |
| `lessons` | 布尔 | 显示科学的课时节点 |
| `preset` | `word` `word-landscape` `screen` | 排版档，默认 `word` |
| `scale` | 1–4 | 像素倍率，默认 2 |

## 维度图库

接口是按需出图，`维度图库/` 则是把常用粒度一次性穷举成现成文件（80 张，PNG 与 SVG 各一份），可以直接拖进文档，也方便一眼看完全套图长什么样。`维度图库/索引.md` 列了每张图的节点数与 A4 字号，`索引.json` 是同样内容的机器可读版。

| 层 | 张数 | 每张画什么 |
| --- | --- | --- |
| 1-学科层 | 4 | 全景、数学×科学跨学科总图、两个学科各自的分层 |
| 2-单元层 | 14 | 一个单元教哪些知识点，横向牵连到另一学科的什么 |
| 3-单元对 | 8 | 有关联的数学单元 × 科学单元 |
| 4-知识点层 | 39 | 一个知识点与另一学科的知识点怎么连 |
| 5-知识点对 | 15 | 跨学科知识点两两配对 |

除学科层用整图视图外，其余各层都先裁出只含相关节点的数据再渲染，而不是用 `focus + depth`：depth 按跳数扩散，同一个 depth 在有的节点上带不进对面学科的单元，在有的节点上又会把同学科的兄弟知识点全拖进来，出来的图库粒度不齐。

数据更新后重跑 `npm run gallery` 即可整套刷新。

## 为 Word 排版做的处理

图片插进 Word 后会被缩放到页宽，所以决定文字清不清楚的不是字号本身，而是**字号相对整张图的比例**。放大字号同时按比例撑开间距只是等比缩放，在页面上看不出任何差别。真正有效的是把图变紧凑：

- **转为纵向层级**。原页面是横向铺开的，列数固定在四五列，宽度下不来。改成层级自上而下、同层水平排列后，宽度由层内节点数决定。
- **层内折行 + 宽高比自适应**。逐个试折行宽度，挑出最接近 A4 正文区比例的那个，避免某一层塞进二十多个知识点把图拉到极宽。
- **去掉孤立节点**。关系类型被筛掉后，课标、核心素养会孤零零留在图里，既讲不出关系又占篇幅。
- **标题和图例画进图内**。网页上这些在侧边栏，图片里没有侧边栏。
- **纯白不透明底、去阴影**。透明 PNG 在 Word 里会出问题；阴影是 SVG 滤镜，矢量转位图时还原不了。
- **标签垫白底**。纵向布局的连线是竖着走的，会从标签中间穿过。

接口会返回 `word_point_size`（按 A4 页宽插入后的估算字号）和 `readability`：`good` 表示 8pt 以上可直接用，`small` 表示该改用 `focus` 聚焦了。实测聚焦到单元约 9.4pt，整张学科图约 6pt。

## Word 能正常显示图片的原因

外链图片在 Word 里不显示，通常是链接跳转、要登录、返回类型不对，或者链接会过期。这里逐条避开了：

- 链接以 `.png` 结尾，直接返回 PNG 字节，`Content-Type: image/png`，不跳转、不鉴权。
- 参数就编码在链接里，收到请求当场算图，不落任何存储，所以链接不会失效，也不用配图床。
- 响应带一年的 `immutable` 缓存，第一次之后由 CDN 直出。
- 连出错也返回一张写着原因的图片，而不是 JSON，否则文档里会显示成破图。

数据更新后，`/api/render` 会返回带新版本号的新链接；已经插进文档的旧链接保持原样，不会让文档里的图突然变了。

## 目录

```
知识图谱/
├── public/
│   ├── index.html            交互页面（由脚本从 index.original.html 生成）
│   ├── index.original.html   重构前的原始页面，脚本的输入
│   ├── graph-core.js         共用的计算核心，网页与服务端都用它
│   ├── data.json             图谱数据
│   └── data.baseline.json    出厂数据，用于「恢复原始数据」
├── api/                      render / image / search / save-graph
├── lib/
│   ├── render-png.js         出图管线：布局 → SVG → PNG
│   ├── profile-word.js       面向 Word 的构图与样式
│   ├── params.js             参数归一化、链接编解码、自然语言解析
│   └── respond.js            跨域、入参合并、站点地址推断
├── assets/fonts/             随包的中文字体，服务器上没有预装中文字体
├── scripts/
│   ├── extract-core.mjs      重构脚本，可反复运行
│   ├── dev-server.mjs        本地开发服务器
│   ├── make-samples.mjs      批量出样图
│   └── make-dimension-gallery.mjs  按维度穷举整套图片
├── 维度图库/                  穷举出的成品图片与索引
├── 数据源/                    原始 JSON 与检索索引
├── openapi.json              插件 schema
├── vercel.json               函数配置与 /i/*.png 路由
└── .vercelignore             图库、样图、原始 JSON 不用上传到线上
```

## 计算逻辑为什么要抽出来

网页和服务端如果各写一套布局，图片和网页迟早会长得不一样。所以筛选、分层、配色、标签这些纯计算逻辑（71 个函数）整体搬到了 `public/graph-core.js`，原先散在页面里的全局状态改成显式传参，页面保留同名薄封装，调用点没动。

搬迁由 `scripts/extract-core.mjs` 按定义边界整块复制源码完成，没有手抄，因此不会引入笔误。改完后四个视图的节点数、关系数和每个节点的坐标，浏览器与 Node 端逐位一致。

数据或页面结构调整后想重新生成：

```bash
npm run extract   # 以 index.original.html 为输入，重新生成 graph-core.js 和 index.html
```

## 出图速度

不启动浏览器，用 ECharts 服务端渲染出 SVG，再由 resvg 栅格化。本机实测聚焦子图 70–120ms，整张学科图约 300ms，不存在白图、超时和时序问题。两个字重的中文字体已子集化（16.8MB → 9.5MB，保留全部基本汉字），渲染速度比全量字体快一倍，且不会缺字。
