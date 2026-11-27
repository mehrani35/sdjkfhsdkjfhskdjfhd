import { config } from './config.js';

export async function generateText({ keyIndex, prompt, maxOutputTokens = 5000, temperature = 0.25 }) {
  const apiKey = config.keys[keyIndex - 1];
  if (!apiKey) throw new Error(`کلید مجاز Gemini برای عامل ${keyIndex} تنظیم نشده است.`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const endpoint = `${config.apiBase}/models/${encodeURIComponent(config.model)}:generateContent`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens,
          responseMimeType: 'application/json'
        }
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status;
      const detail = String(data?.error?.message || `Gemini returned HTTP ${status}`).slice(0, 500);
      if (status === 429) throw new Error(`Gemini rate limit for agent ${keyIndex}; respect the provider quota and retry later.`);
      if (status === 403) throw new Error(`Gemini denied agent ${keyIndex}; check project, key permissions and supported service region.`);
      throw new Error(`Gemini agent ${keyIndex} failed (${status}): ${detail}`);
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((part) => part.text || '').join('\n').trim();
    if (!text) throw new Error(`Gemini agent ${keyIndex} returned no text. Check safety blocking and model access.`);
    return text;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Gemini agent ${keyIndex} timed out.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(raw); } catch {}
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(raw.slice(first, last + 1));
  throw new Error('پاسخ مدل JSON معتبر نبود.');
}
