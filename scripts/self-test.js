import assert from 'node:assert/strict';
import { validateSpec, runContractTests } from '../src/schema.js';

const piano = {
  slug: 'piano', title: 'حدس نت‌ها', description: 'یک بازی گروهی برای حدس‌زدن الگوی نت‌ها.', type: 'piano', version: '1.0.0',
  settings: { round_seconds: 30 },
  content: { rounds: [
    { prompt: '🎹 الگوی نت: دو، می، سل. کدام گزینه درست است؟', options: ['الگوی C-E-G', 'الگوی D-F-A', 'الگوی E-G-B', 'الگوی F-A-C'], answer: 'الگوی C-E-G', hint: 'از نت اول شروع کن.' },
    { prompt: 'کدام گزینه سه نت پیاپی دارد؟', options: ['دو، ر، می', 'دو، سل، دو', 'می، دو، سل', 'لا، فا، دو'], answer: 'دو، ر، می', hint: 'به ترتیب نت‌ها توجه کن.' }
  ] }
};

const valid = validateSpec(piano);
assert.equal(valid.ok, true, valid.issues.join('; '));
const tests = runContractTests(piano);
assert.equal(tests.failed, 0, JSON.stringify(tests.checks.filter(x => x.status === 'failed')));
assert.equal(tests.total, 12);
assert.equal(validateSpec({ ...piano, slug: '../oops' }).ok, false);
assert.equal(validateSpec({ ...piano, content: { rounds: [{ ...piano.content.rounds[0], answer: 'not-an-option' }] } }).ok, false);
assert.equal(validateSpec({ ...piano, type: 'arbitrary_code' }).ok, false);

// Exercise the full five-agent pipeline without sending a network request.
for (let i = 1; i <= 5; i += 1) process.env[`GEMINI_API_KEY_${i}`] = `mock-authorized-key-${i}`;
process.env.AI_GATEWAY_SECRET = 'mock-gateway-secret';
const { buildGame } = await import('../src/pipeline.js');
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  const prompt = body.contents[0].parts[0].text;
  const role = prompt.match(/ROLE: ([^\.\n]+)/)?.[1] || 'unknown';
  calls.push({ role, key: options.headers['x-goog-api-key'] });
  let value;
  if (role === 'PLANNER') value = { core_loop: 'guess notes', target_experience: 'friendly', suitable_type: 'piano', mechanics: [], safety_notes: [], uncertainties: [] };
  else if (role === 'GAME DESIGNER') value = { title: piano.title, slug: piano.slug, description: piano.description, type: 'piano', rules: [], rounds_outline: piano.content.rounds, round_seconds: 30 };
  else if (role === 'DEVELOPER') value = piano;
  else if (role === 'STRICT CODE/CONTENT REVIEWER') value = { approved: true, issues: [], corrected_spec: null };
  else if (role === 'QA TEST DESIGNER') value = { test_cases: [{ name: 'renders', expected: 'prompt and choices are present' }] };
  else throw new Error(`Unexpected mocked role: ${role}`);
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }) };
};
try {
  const built = await buildGame({ prompt: 'یک بازی پیانو برای حدس نت‌ها بساز', groupTitle: 'گروه آزمایشی' });
  assert.equal(built.success, true);
  assert.equal(built.spec.slug, 'piano');
  assert.equal(built.testSummary.failed, 0);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map(x => x.key), [1,2,3,4,5].map(i => `mock-authorized-key-${i}`));
} finally {
  globalThis.fetch = realFetch;
}
console.log(`Railway tests: ${tests.passed}/${tests.total} contract checks and full five-agent pipeline passed.`);
