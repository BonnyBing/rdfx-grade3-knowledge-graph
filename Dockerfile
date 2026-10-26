# 智启知识图谱 API（公司 Docker / 端口直出 8099）
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY api ./api
COPY lib ./lib
COPY public ./public
COPY config ./config
COPY assets ./assets
COPY scripts/dev-server.mjs ./scripts/dev-server.mjs
COPY openapi-zhiqi.json openapi.json ./

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8099 \
    SNAPSHOT_DIR=/data

RUN mkdir -p /data

EXPOSE 8099

CMD ["node", "scripts/dev-server.mjs"]
