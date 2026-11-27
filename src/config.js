const required = ['AI_GATEWAY_SECRET', 'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY_4', 'GEMINI_API_KEY_5'];
const missing = required.filter((key) => !String(process.env[key] || '').trim() || String(process.env[key]).startsWith('CHANGE_') || String(process.env[key]).startsWith('YOUR_'));
const configuredKeys = [1,2,3,4,5].map((i) => String(process.env[`GEMINI_API_KEY_${i}`] || '').trim()).filter(Boolean);
if (configuredKeys.length === 5 && new Set(configuredKeys).size !== 5) missing.push('GEMINI_API_KEY_1..5 must be five distinct authorized credentials');

export const config = {
  missing,
  secret: process.env.AI_GATEWAY_SECRET || '',
  keys: [1,2,3,4,5].map((i) => process.env[`GEMINI_API_KEY_${i}`] || ''),
  model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  apiBase: (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
  maxConcurrent: Math.max(1, Number(process.env.MAX_CONCURRENT_BUILDS || 2)),
  maxRequestBytes: Math.max(1000, Number(process.env.MAX_REQUEST_BYTES || 100000)),
  requestTimeoutMs: Math.max(15000, Number(process.env.AI_REQUEST_TIMEOUT_MS || 40000))
};
