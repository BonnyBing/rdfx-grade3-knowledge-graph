'use strict';

/**
 * 腾讯云 Web 函数：把智启请求转到 Vercel 知识图谱服务。
 * 必须监听 0.0.0.0:9000。
 *
 * 地域请选「香港」：国内机房能访问腾讯云 URL，香港函数才能出网打到 Vercel。
 * 北京地域出网通常到不了 Vercel，不要用北京做上游转发。
 */

const http = require('http');

const UPSTREAM = (
  process.env.UPSTREAM_URL || 'https://rdfx-grade3-kg-deploy.vercel.app'
).replace(/\/$/, '');
const PORT = Number.parseInt(process.env.PORT || '9000', 10);
// 出图可能较慢，给足余量（函数超时建议 60s）
const UPSTREAM_TIMEOUT_MS = Number.parseInt(
  process.env.UPSTREAM_TIMEOUT_MS || '55000',
  10,
);

const SKIP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const ALLOWED_PREFIXES = ['/api/', '/i/', '/s/', '/health'];

const corsHeaders = (req) => {
  const origin = req.headers.origin || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS, HEAD',
    'access-control-allow-headers':
      'Content-Type, Authorization, x-api-key, X-Api-Key',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
};

const json = (res, req, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(body));
};

const pathAllowed = (pathname) => {
  if (pathname === '/' || pathname === '/favicon.ico') return true;
  return ALLOWED_PREFIXES.some(
    (p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p),
  );
};

const server = http.createServer(async (req, res) => {
  try {
    if ((req.method || 'GET').toUpperCase() === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }

    const url = new URL(req.url || '/', 'http://localhost');
    if (!pathAllowed(url.pathname)) {
      json(res, req, 404, {
        code: 404,
        status: 'error',
        message: '路径不存在。仅转发 /api/*、/i/*、/s/*',
        request_id: '',
        graph_version: '',
        warnings: [],
      });
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value || SKIP_HEADERS.has(key.toLowerCase())) continue;
      headers[key] = Array.isArray(value) ? value.join(',') : value;
    }

    const method = (req.method || 'GET').toUpperCase();
    const target = `${UPSTREAM}${url.pathname}${url.search}`;

    const upstream = await fetch(target, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const payload = Buffer.from(await upstream.arrayBuffer());
    const out = { ...corsHeaders(req) };
    const contentType = upstream.headers.get('content-type');
    if (contentType) out['content-type'] = contentType;
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) out['cache-control'] = cacheControl;
    res.writeHead(upstream.status, out);
    res.end(payload);
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    json(res, req, 504, {
      code: 504,
      status: 'error',
      message: timedOut
        ? '上游知识图谱服务超时（腾讯云→Vercel）。'
        : `转发失败：${error instanceof Error ? error.message : String(error)}`,
      request_id: '',
      graph_version: '',
      warnings: [],
      image_status: 'error',
      image_url: '',
      image_markdown: '',
      page_url: '',
      image_message: timedOut ? '上游超时' : '转发失败',
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`kg proxy → ${UPSTREAM} on 0.0.0.0:${PORT}`);
});
