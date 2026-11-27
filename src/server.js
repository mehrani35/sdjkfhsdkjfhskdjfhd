import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { buildGame } from './pipeline.js';

let activeBuilds = 0;
let totalRequests = 0;
let totalFailures = 0;

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > config.maxRequestBytes) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function getSecret(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-aigames-secret'] || '').trim();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, config.missing.length ? 503 : 200, {
      ok: config.missing.length === 0,
      service: 'aigames-ai-gateway',
      model: config.model,
      configuredKeys: config.keys.filter(Boolean).length,
      requiredKeys: 5,
      activeBuilds,
      maxConcurrent: config.maxConcurrent,
      uptime: Math.floor(process.uptime())
    });
  }
  if (req.method !== 'POST' || url.pathname !== '/v1/games/generate') return json(res, 404, { error: 'Not found' });
  if (!safeEqual(getSecret(req), config.secret)) return json(res, 401, { error: 'Unauthorized' });
  if (config.missing.length) return json(res, 503, { error: `Missing Railway variables: ${config.missing.join(', ')}` });
  if (activeBuilds >= config.maxConcurrent) return json(res, 429, { error: 'AI build queue is busy. Retry later.' });
  let body;
  try { body = await readJson(req); }
  catch (error) { return json(res, 400, { error: error.message || 'Invalid JSON' }); }
  const prompt = String(body.prompt || '').trim();
  if (prompt.length < 10 || prompt.length > 4000) return json(res, 400, { error: 'prompt must be between 10 and 4000 characters.' });
  activeBuilds += 1;
  totalRequests += 1;
  const started = Date.now();
  try {
    const existingSpec = body.existingSpec && typeof body.existingSpec === 'object' ? body.existingSpec : null;
    const result = await buildGame({ prompt, groupTitle: String(body.groupTitle || '').slice(0, 180), existingSpec });
    return json(res, 200, { ...result, requestId: String(body.requestId || ''), model: config.model, durationMs: Date.now() - started });
  } catch (error) {
    totalFailures += 1;
    console.error(JSON.stringify({ level: 'error', message: String(error.message || error).slice(0, 600), durationMs: Date.now() - started }));
    return json(res, 502, { error: String(error.message || 'AI pipeline failed').slice(0, 700), requestId: String(body.requestId || '') });
  } finally {
    activeBuilds = Math.max(0, activeBuilds - 1);
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', message: 'AIGames AI Gateway listening', port, model: config.model, configuredKeys: config.keys.filter(Boolean).length, requiredKeys: 5 }));
  if (config.missing.length) console.error(JSON.stringify({ level: 'error', message: 'Missing required environment variables', missing: config.missing }));
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
