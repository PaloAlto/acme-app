import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes } from './src/routes.ts';

/**
 * Acme: a small forecasting app, the way a customer's product looks from
 * the outside. Pages are HTML under src/pages, styled by one sheet; the
 * data lives in memory and comes back through /api. Sign-in is a mark in
 * the browser, so any email with any password of four characters gets in.
 *
 *   node server.ts                 # http://127.0.0.1:8789
 *   PORT=4000 node server.ts
 *   HOST=0.0.0.0 node server.ts    # reachable from outside, as in the container
 */

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8789);
const host = process.env.HOST ?? '127.0.0.1';

type Stream = {
  id: number;
  name: string;
  pricing: 'unit' | 'hours' | 'recurring';
  monthly: number;
};

const streams: Stream[] = [
  { id: 1, name: 'Wholesale', pricing: 'unit', monthly: 14200 },
  { id: 2, name: 'Retail', pricing: 'unit', monthly: 9850 },
];

const json = (res: import('node:http').ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const body = (req: import('node:http').IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let text = '';
    req.on('data', (chunk) => (text += chunk));
    req.on('end', () => resolve(text));
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://acme');
  if (url.pathname === '/styles.css') {
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    res.end(await readFile(join(root, 'src', 'pages', 'styles.css'), 'utf8'));
    return;
  }
  if (url.pathname === '/api/streams') {
    if (req.method === 'POST') {
      const given = JSON.parse(await body(req)) as Partial<Stream>;
      const stream: Stream = {
        id: streams.length + 1,
        name: String(given.name ?? 'New stream'),
        pricing: given.pricing ?? 'unit',
        monthly: Number(given.monthly ?? 0),
      };
      streams.push(stream);
      json(res, stream, 201);
      return;
    }
    json(res, streams);
    return;
  }
  const removing = /^\/api\/streams\/(\d+)$/.exec(url.pathname);
  if (removing && req.method === 'DELETE') {
    const at = streams.findIndex((s) => s.id === Number(removing[1]));
    if (at >= 0) streams.splice(at, 1);
    json(res, { ok: at >= 0 });
    return;
  }
  const route = routes.find((r) => r.path === url.pathname);
  if (!route) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  const html = await readFile(join(root, 'src', 'pages', `${route.page}.html`), 'utf8');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(port, host, () => {
  console.log(`acme: http://${host}:${port}`);
});
