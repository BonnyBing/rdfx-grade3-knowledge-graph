# 三年级上册数学与科学知识图谱

在线知识图谱，支持多人实时云端同步。

## 在线访问

- GitHub Pages：https://bonnybing.github.io/rdfx-grade3-knowledge-graph/
- 国内镜像：https://fastly.jsdelivr.net/gh/BonnyBing/rdfx-grade3-knowledge-graph@main/index.html

## 云端同步

- 图谱数据保存在 `data.json`
- 点击「保存并同步」后，通过 Vercel API 写回 GitHub
- 其他用户每 2 秒自动拉取最新数据

## 目录

- `index.html` — 前端页面
- `data.json` — 当前云端数据（可编辑）
- `data.baseline.json` — 原始基线数据（用于恢复）
- `api/save-graph.js` — Vercel 保存接口
