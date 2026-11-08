import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const indexPath = fileURLToPath(new URL('./index.html', import.meta.url));
const serviceWorkerPath = fileURLToPath(new URL('./controller-sw.js', import.meta.url));
const runtimeDiagnostics = [];
let diagnosticId = 0;

function logText(value) {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function addRuntimeDiagnostic(source, name, message) {
  runtimeDiagnostics.push({ id: ++diagnosticId, time: Date.now(), source, name, message: String(message).slice(0, 6000) });
  if (runtimeDiagnostics.length > 100) runtimeDiagnostics.splice(0, runtimeDiagnostics.length - 100);
}

for (const method of ['warn', 'error']) {
  const original = console[method].bind(console);
  console[method] = (...args) => {
    original(...args);
    addRuntimeDiagnostic(`Node console.${method}`, method === 'warn' ? 'Warning' : 'Error', args.map(logText).join(' '));
  };
}

// Keep the local proxy scoped to ordinary public destinations.
wisp.options.allow_private_ips = false;
wisp.options.allow_loopback_ips = false;
wisp.options.stream_limit_per_host = 12;
wisp.options.stream_limit_total = 100;

const vite = await createViteServer({
  configFile: './vite.config.js',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${host}:${port}`);
  const pathname = requestUrl.pathname;
  if (pathname === '/api/diagnostics') {
    const after = Number(requestUrl.searchParams.get('after') || 0);
    const events = runtimeDiagnostics.filter(event => event.id > after);
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify(events));
    return;
  }
  if (pathname === '/controller/controller.sw.js') {
    try {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.setHeader('Service-Worker-Allowed', '/');
      response.setHeader('Cache-Control', 'no-cache');
      response.end(await readFile(serviceWorkerPath, 'utf8'));
    } catch (error) {
      console.error('Could not load the Scramjet service worker:', error);
      response.statusCode = 500;
      response.end('Could not load the proxy service worker.');
    }
    return;
  }
  if (pathname === '/' || pathname === '/index.html') {
    try {
      const html = await readFile(indexPath, 'utf8');
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(await vite.transformIndexHtml('/', html));
    } catch (error) {
      console.error('Could not render Nova home page:', error);
      response.statusCode = 500;
      response.end('Could not load Nova.');
    }
    return;
  }
  if (pathname.startsWith('/~/sj/')) {
    let target = pathname;
    try {
      const encodedTarget = pathname.split('/').slice(5).join('/');
      target = decodeURIComponent(encodedTarget);
    } catch {}
    const status = 503;
    const message = 'The server received a Scramjet navigation URL instead of the service worker handling it.';
    const diagnostic = {
      source: 'Nova server',
      name: `HTTP ${status}`,
      message,
      request: { method: request.method, target, serverPath: pathname, status },
    };
    addRuntimeDiagnostic('Nova server route', `HTTP ${status}`, `${request.method} ${pathname}: ${message}`);
    console.warn(`[Nova server route] HTTP ${status} ${request.method} ${pathname}`);
    response.statusCode = 503;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    const payload = JSON.stringify({ source: 'nova-proxy-server', diagnostic }).replaceAll('<', '\\u003c');
    response.end(`<!doctype html><meta charset="utf-8"><title>Nova proxy request error</title><style>body{margin:0;background:#04070d;color:#eaf3ff;font:16px system-ui;display:grid;place-items:center;min-height:100vh}main{max-width:580px;margin:24px;padding:28px;border:1px solid #13577b;border-radius:14px;background:#081522;box-shadow:0 0 30px #008ccc38}h1{font-size:20px;color:#55cbff}p{line-height:1.55;color:#b8ccdc}</style><main><h1>Proxy request reached the Nova server</h1><p>${message}</p><p>Return to Nova to view the original request details in the error log.</p></main><script>if(parent!==self)parent.postMessage(${payload},location.origin)</script>`);
    return;
  }
  vite.middlewares(request, response);
});
server.on('upgrade', (request, socket, head) => {
  const path = new URL(request.url || '/', `http://${host}:${port}`).pathname;
  if (path === '/wisp/') {
    wisp.routeRequest(request, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(port, host, () => {
  console.log(`Nova is ready at http://${host}:${port}`);
  console.log(`Wisp transport is listening at ws://${host}:${port}/wisp/`);
});

async function shutdown() {
  server.close();
  await vite.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
