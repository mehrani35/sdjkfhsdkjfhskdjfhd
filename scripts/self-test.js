import assert from 'node:assert/strict';
import { validateSpec, runContractTests } from '../src/schema.js';

const commandGame = {
  slug: 'laugh_arena', title: 'مسابقه خنده', description: 'امتیاز بگیر، رتبه‌ات را ببین و دوستانت را به چالش دعوت کن.',
  type: 'command_game', version: '1.0.0', settings: { mode: 'command_dsl_v2' },
  content: { help: 'با /lol امتیاز بگیر و با /top رتبه‌ها را ببین.', commands: [
    { command: 'lol', description: 'گرفتن امتیاز تصادفی', actions: [{ type: 'award_random_points', min_points: 1, max_points: 10, cooldown_seconds: 30, success_message: '{player}: {points}' }] },
    { command: 'top', description: 'نمایش نفرات برتر', actions: [{ type: 'show_leaderboard', limit: 10, metric: 'score' }] },
    { command: 'fight', description: 'ساخت چالش', actions: [{ type: 'create_challenge', accept_command: 'accept', cancel_command: 'cancel_fight', expires_seconds: 60, result: 'random', transfer: 'loser_all_score' }] },
    { command: 'accept', description: 'پذیرفتن چالش', actions: [{ type: 'accept_challenge' }] },
    { command: 'cancel_fight', description: 'لغو چالش', actions: [{ type: 'cancel_challenge' }] },
    { command: 'energy', description: 'افزایش انرژی و بررسی شرط', actions: [
      { type: 'increment_value', scope: 'player', key: 'energy', amount: 5, min: 0, max: 100 },
      { type: 'if_value', scope: 'player', key: 'energy', operator: 'gte', value: 10, then_actions: [{ type: 'reply', text: 'انرژی کافی داری: {value:energy}' }], else_actions: [{ type: 'reply', text: 'انرژی کم است.' }] }
    ] },
    { command: 'guess', description: 'ثبت حدس و بررسی آن', actions: [
      { type: 'store_argument', scope: 'player', key: 'guess', value_type: 'number', min: 1, max: 100, max_length: 20, required: true },
      { type: 'compare_values', left_scope: 'player', left_key: 'guess', right_scope: 'group', right_key: 'secret', operator: 'eq', then_actions: [{ type: 'reply', text: 'درست است!' }], else_actions: [{ type: 'reply', text: 'دوباره تلاش کن.' }] }
    ] },
    { command: 'buy', description: 'خرید با امتیاز', actions: [{ type: 'spend_points', points: 10, message: 'خرید انجام شد.' }, { type: 'reply', text: 'جایزه دریافت شد.' }] }
  ] }
};

assert.equal(validateSpec(commandGame).ok, true, validateSpec(commandGame).issues.join('; '));
const summary = runContractTests(commandGame);
assert.equal(summary.failed, 0, JSON.stringify(summary.checks));
assert.equal(validateSpec({ ...commandGame, settings: { mode: 'untrusted_code' } }).ok, false);
assert.equal(validateSpec({ ...commandGame, content: { ...commandGame.content, commands: [{ command: 'x', description: 'bad', actions: [{ type: 'store_argument', scope: 'player', key: 'pick', value_type: 'choice', choices: ['only-one'] }] }] } }).ok, false);
assert.equal(validateSpec({ ...commandGame, content: { ...commandGame.content, commands: [{ command: 'x', description: 'bad', actions: [{ type: 'run_js', code: 'process.exit()' }] }] } }).ok, false);
assert.equal(validateSpec({ ...commandGame, content: { ...commandGame.content, commands: [{ command: 'a', description: 'one', actions: [{ type: 'create_challenge', accept_command: 'b' }] }] } }).ok, false);

const quiz = {
  slug: 'piano', title: 'حدس نت‌ها', description: 'یک بازی برای حدس نت‌ها.', type: 'piano', version: '1.0.0',
  settings: { round_seconds: 30 },
  content: { rounds: [{ prompt: 'الگوی نت؟', options: ['C-E-G','D-F-A'], answer: 'C-E-G' }] }
};
assert.equal(validateSpec(quiz).ok, true);
assert.equal(runContractTests(quiz).failed, 0);

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
  if (role === 'PLANNER') value = { core_loop: 'امتیاز جمع کن و چالش بده', target_experience: 'رقابت گروهی', suitable_type: 'command_game', mechanics: [], commands_outline: [], state_variables: [], safety_notes: [], uncertainties: [] };
  else if (role === 'GAME DESIGNER') value = { title: commandGame.title, slug: commandGame.slug, description: commandGame.description, type: 'command_game', rules: [], commands: commandGame.content.commands, help: commandGame.content.help };
  else if (role === 'DEVELOPER') value = commandGame;
  else if (role === 'STRICT REVIEWER') value = { approved: true, issues: [], corrected_spec: null };
  else if (role === 'QA TESTER') value = { test_cases: [{ name: 'cooldown', steps: ['/lol twice within 30 seconds'], expected: 'second call is rate-limited' }] };
  else throw new Error(`Unexpected mocked role: ${role}`);
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }) };
};
try {
  const built = await buildGame({ prompt: 'یک بازی گروهی بساز با /lol امتیاز بده، /top رتبه بندی و /fight چالش دو نفره', groupTitle: 'گروه آزمایشی' });
  assert.equal(built.success, true);
  assert.equal(built.spec.type, 'command_game');
  assert.equal(built.spec.settings.mode, 'command_dsl_v2');
  assert.equal(built.testSummary.failed, 0);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map((x) => x.key), [1,2,3,4,5].map((i) => `mock-authorized-key-${i}`));
} finally {
  globalThis.fetch = realFetch;
}


// Targeted retry + repair test: one malformed Planner response is retried, then
// only the invalid manifest stage is repaired without restarting the whole pipeline.
let plannerAttempts = 0;
let reviewAttempts = 0;
const invalidSpec = structuredClone(commandGame);
invalidSpec.content.commands[0].actions = [{ type: 'run_js', code: 'unsafe()' }];
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  const prompt = body.contents[0].parts[0].text;
  const role = prompt.match(/ROLE: ([^\.\n]+)/)?.[1] || 'unknown';
  let value;
  if (role === 'PLANNER') {
    plannerAttempts += 1;
    if (plannerAttempts === 1) return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not valid json' }] } }] }) };
    value = { core_loop: 'بازی گروهی', target_experience: 'تعامل', suitable_type: 'command_game', mechanics: [], commands_outline: [], state_variables: [], safety_notes: [], uncertainties: [] };
  } else if (role === 'GAME DESIGNER') value = { title: commandGame.title, slug: commandGame.slug, description: commandGame.description, type: 'command_game', rules: [], commands: commandGame.content.commands, help: commandGame.content.help };
  else if (role === 'DEVELOPER') value = invalidSpec;
  else if (role === 'STRICT REVIEWER') { reviewAttempts += 1; value = { approved: true, issues: [], corrected_spec: null }; }
  else if (role === 'REPAIR DEVELOPER') value = commandGame;
  else if (role === 'QA TESTER') value = { test_cases: [{ name: 'repair', steps: ['/lol'], expected: 'valid command game' }] };
  else throw new Error(`Unexpected repair-test role: ${role}`);
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }) };
};
try {
  const repairedBuild = await buildGame({ prompt: 'یک بازی گروهی اختصاصی با دستور و امتیاز بساز', groupTitle: 'گروه تست' });
  assert.equal(repairedBuild.success, true);
  assert.equal(plannerAttempts, 2, 'Planner should retry malformed output once');
  assert.equal(reviewAttempts, 2, 'Reviewer should run again after targeted repair');
  assert.equal(repairedBuild.repairPasses, 1);
  assert.equal(repairedBuild.stages.find((x) => x.key === 'planning').attempts, 2);
  assert.equal(repairedBuild.stages.some((x) => x.key === 'repair_1' && x.status === 'completed'), true);
} finally {
  globalThis.fetch = realFetch;
}
console.log('Railway tests: generic DSL, five-agent pipeline, stage retry and targeted auto-repair passed.');
