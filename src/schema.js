export const GAME_TYPES = new Set(['quiz','piano','word_guess','memory']);
const slugRegex = /^[a-z][a-z0-9_]{1,23}$/;

export function validateSpec(spec) {
  const issues = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { ok: false, issues: ['Game spec must be a JSON object.'] };
  if (!slugRegex.test(String(spec.slug || ''))) issues.push('slug must match /^[a-z][a-z0-9_]{1,23}$/');
  if (!String(spec.title || '').trim() || String(spec.title).length > 100) issues.push('title must be 1..100 characters');
  if (!GAME_TYPES.has(spec.type)) issues.push(`unsupported type: ${String(spec.type || '')}`);
  if (!String(spec.description || '').trim() || String(spec.description).length > 500) issues.push('description must be 1..500 characters');
  const rounds = spec.content?.rounds;
  if (!Array.isArray(rounds) || rounds.length < 1 || rounds.length > 30) issues.push('content.rounds must contain 1..30 rounds');
  if (Array.isArray(rounds)) rounds.forEach((round, index) => {
    const n = index + 1;
    if (!round || typeof round !== 'object') { issues.push(`round ${n} is invalid`); return; }
    if (!String(round.prompt || '').trim() || String(round.prompt).length > 1000) issues.push(`round ${n}: prompt is invalid`);
    if (!Array.isArray(round.options) || round.options.length < 2 || round.options.length > 4) issues.push(`round ${n}: use 2..4 options`);
    const options = (round.options || []).map((option) => String(option).trim().toLocaleLowerCase());
    if (new Set(options).size !== options.length) issues.push(`round ${n}: options must be unique`);
    if (!round.options?.some((option) => String(option).trim().toLocaleLowerCase() === String(round.answer || '').trim().toLocaleLowerCase())) issues.push(`round ${n}: answer must match an option`);
  });
  const seconds = Number(spec.settings?.round_seconds ?? 30);
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 180) issues.push('settings.round_seconds must be 10..180');
  return { ok: issues.length === 0, issues };
}

export function runContractTests(spec) {
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, status: pass ? 'passed' : 'failed', detail });
  add('JSON object', Boolean(spec && typeof spec === 'object' && !Array.isArray(spec)));
  add('Allowed game type', GAME_TYPES.has(spec?.type));
  add('Safe command slug', slugRegex.test(String(spec?.slug || '')));
  add('Title length', Boolean(String(spec?.title || '').trim() && String(spec.title).length <= 100));
  add('Description length', Boolean(String(spec?.description || '').trim() && String(spec.description).length <= 500));
  add('Round count', Array.isArray(spec?.content?.rounds) && spec.content.rounds.length >= 1 && spec.content.rounds.length <= 30);
  add('Round timer', Number.isInteger(Number(spec?.settings?.round_seconds ?? 30)) && Number(spec?.settings?.round_seconds ?? 30) >= 10 && Number(spec?.settings?.round_seconds ?? 30) <= 180);
  const rounds = spec?.content?.rounds || [];
  add('All rounds have prompts', rounds.length > 0 && rounds.every((r) => String(r?.prompt || '').trim().length > 0 && String(r.prompt).length <= 1000));
  add('All rounds have 2-4 choices', rounds.length > 0 && rounds.every((r) => Array.isArray(r?.options) && r.options.length >= 2 && r.options.length <= 4));
  add('All answers match a choice', rounds.length > 0 && rounds.every((r) => (r.options || []).some((o) => String(o).trim().toLowerCase() === String(r.answer || '').trim().toLowerCase())));
  add('No duplicate choices', rounds.length > 0 && rounds.every((r) => new Set((r.options || []).map((o) => String(o).trim().toLowerCase())).size === (r.options || []).length));
  add('Text payload size', Buffer.byteLength(JSON.stringify(spec), 'utf8') <= 50000);
  return { total: checks.length, passed: checks.filter((c) => c.status === 'passed').length, failed: checks.filter((c) => c.status === 'failed').length, checks };
}
