import { generateText, parseJson } from './gemini.js';
import { validateSpec, runContractTests } from './schema.js';
import { plannerPrompt, designerPrompt, developerPrompt, reviewerPrompt, testerPrompt, fixerPrompt } from './prompts.js';

function normalizeAction(action, depth = 0) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return {};
  const type = String(action.type || '');
  const base = { type };
  if (type === 'reply') return { ...base, text: String(action.text || '').trim().slice(0, 700) };
  if (type === 'random_reply') return { ...base, responses: Array.isArray(action.responses) ? action.responses.slice(0, 20).map((x) => String(x).slice(0, 500)) : [] };
  if (type === 'award_random_points') return { ...base, min_points: Number(action.min_points), max_points: Number(action.max_points), cooldown_seconds: Number(action.cooldown_seconds), success_message: String(action.success_message || '').slice(0, 500) };
  if (type === 'award_points' || type === 'spend_points') return { ...base, points: Number(action.points), ...(action.message ? { message: String(action.message).slice(0, 500) } : {}), ...(action.insufficient_message ? { insufficient_message: String(action.insufficient_message).slice(0, 500) } : {}) };
  if (type === 'show_leaderboard') return { ...base, limit: Number(action.limit ?? 10), title: String(action.title || '').slice(0, 100), metric: String(action.metric || 'score').slice(0, 24) };
  if (type === 'show_stats' || type === 'accept_challenge' || type === 'cancel_challenge' || type === 'show_help') return base;
  if (type === 'create_challenge') return { ...base, accept_command: String(action.accept_command || '').toLowerCase().slice(0, 24), cancel_command: String(action.cancel_command || '').toLowerCase().slice(0, 24), expires_seconds: Number(action.expires_seconds ?? 60), result: String(action.result || 'random'), transfer: String(action.transfer || 'loser_all_score') };
  if (['set_value','increment_value','random_value','show_value','reset_values'].includes(type)) {
    const result = { ...base, scope: String(action.scope || 'player') };
    if (action.key != null) result.key = String(action.key).toLowerCase().slice(0, 24);
    if (type === 'set_value') result.value = action.value;
    if (type === 'increment_value') Object.assign(result, { amount: Number(action.amount), min: action.min == null ? undefined : Number(action.min), max: action.max == null ? undefined : Number(action.max) });
    if (type === 'random_value') Object.assign(result, { min: Number(action.min), max: Number(action.max) });
    if (type === 'show_value' && action.label) result.label = String(action.label).slice(0, 100);
    if (type === 'reset_values' && Array.isArray(action.keys)) result.keys = action.keys.slice(0, 24).map((x) => String(x).toLowerCase().slice(0, 24));
    if (action.message) result.message = String(action.message).slice(0, 500);
    return result;
  }
  if (type === 'store_argument') return { ...base, scope: String(action.scope || 'player'), key: String(action.key || '').toLowerCase().slice(0, 24), max_length: Number(action.max_length ?? 120), required: action.required !== false, value_type: String(action.value_type || 'text'), ...(action.min != null ? { min: Number(action.min) } : {}), ...(action.max != null ? { max: Number(action.max) } : {}), ...(Array.isArray(action.choices) ? { choices: action.choices.slice(0, 20).map((x) => String(x).slice(0, 100)) } : {}), ...(action.message ? { message: String(action.message).slice(0, 500) } : {}), ...(action.invalid_message ? { invalid_message: String(action.invalid_message).slice(0, 500) } : {}) };
  if (type === 'compare_values' && depth < 2) return { ...base, left_scope: String(action.left_scope || 'player'), left_key: String(action.left_key || '').toLowerCase().slice(0, 24), right_scope: String(action.right_scope || 'group'), right_key: String(action.right_key || '').toLowerCase().slice(0, 24), operator: String(action.operator || 'eq'), then_actions: (Array.isArray(action.then_actions) ? action.then_actions : []).slice(0, 8).map((item) => normalizeAction(item, depth + 1)), else_actions: (Array.isArray(action.else_actions) ? action.else_actions : []).slice(0, 8).map((item) => normalizeAction(item, depth + 1)) };
  if (type === 'if_value' && depth < 2) return {
    ...base, scope: String(action.scope || 'player'), key: String(action.key || '').toLowerCase().slice(0, 24),
    operator: String(action.operator || 'eq'), value: action.value,
    then_actions: (Array.isArray(action.then_actions) ? action.then_actions : []).slice(0, 8).map((item) => normalizeAction(item, depth + 1)),
    else_actions: (Array.isArray(action.else_actions) ? action.else_actions : []).slice(0, 8).map((item) => normalizeAction(item, depth + 1))
  };
  return base;
}

function cleanSpec(input) {
  const spec = {
    slug: String(input?.slug || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24),
    title: String(input?.title || '').trim().slice(0, 100),
    description: String(input?.description || '').trim().slice(0, 500),
    type: String(input?.type || '').trim(),
    version: String(input?.version || '1.0.0').slice(0, 32)
  };
  if (spec.type === 'command_game') {
    const commands = Array.isArray(input?.content?.commands) ? input.content.commands.slice(0, 24) : [];
    return {
      ...spec,
      settings: { mode: 'command_dsl_v2' },
      content: {
        help: String(input?.content?.help || '').slice(0, 2000),
        commands: commands.map((command) => ({
          command: String(command?.command || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24),
          description: String(command?.description || '').trim().slice(0, 160),
          actions: (Array.isArray(command?.actions) ? command.actions : []).slice(0, 8).map((action) => normalizeAction(action))
        }))
      }
    };
  }
  const rounds = Array.isArray(input?.content?.rounds) ? input.content.rounds : [];
  return {
    ...spec,
    settings: { round_seconds: Number(input?.settings?.round_seconds || 30) },
    content: { rounds: rounds.slice(0, 30).map((r) => ({
      prompt: String(r?.prompt || '').trim().slice(0, 1000),
      options: Array.isArray(r?.options) ? r.options.slice(0, 4).map((x) => String(x).trim().slice(0, 120)) : [],
      answer: String(r?.answer || '').trim().slice(0, 120),
      hint: String(r?.hint || '').trim().slice(0, 300)
    })) }
  };
}

function applyEditIdentity(spec, existingSpec) {
  if (!existingSpec) return spec;
  spec.slug = String(existingSpec.slug || spec.slug);
  spec.type = String(existingSpec.type || spec.type);
  const version = String(existingSpec.version || '1.0.0').split('.').map((x) => Number(x) || 0);
  spec.version = `${version[0]}.${version[1]}.${version[2] + 1}`;
  return spec;
}

export async function buildGame({ prompt, groupTitle, existingSpec = null, runtimeContract = 'command_dsl_v2' }) {
  const agents = [];
  const stages = [];
  const run = async (name, keyIndex, createPrompt, options = {}) => {
    const maxAttempts = options.maxAttempts || 2;
    const stage = { key: options.stageKey || name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name, status: 'running', attempts: 0, startedAt: new Date().toISOString() };
    stages.push(stage);
    const started = Date.now();
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      stage.attempts = attempt;
      try {
        const promptText = attempt === 1 ? createPrompt() : `${createPrompt()}\n\nRETRY REQUIREMENT: Your previous response was invalid or incomplete. Return one complete valid JSON object only, matching the requested schema. Do not add commentary.`;
        const output = await generateText({ keyIndex, prompt: promptText, maxOutputTokens: options.maxOutputTokens || 7000, temperature: attempt > 1 ? 0.15 : 0.25 });
        const parsed = parseJson(output);
        stage.status = 'completed';
        stage.durationMs = Date.now() - started;
        stage.finishedAt = new Date().toISOString();
        agents.push({ name, roleSlot: keyIndex, durationMs: stage.durationMs, status: 'completed', attempts: attempt });
        return parsed;
      } catch (error) {
        lastError = error;
        if (/\b(401|403|429)\b/.test(String(error.message))) break;
      }
    }
    stage.status = 'failed';
    stage.error = String(lastError?.message || 'Agent failed').slice(0, 500);
    stage.durationMs = Date.now() - started;
    stage.finishedAt = new Date().toISOString();
    agents.push({ name, roleSlot: keyIndex, durationMs: stage.durationMs, status: 'failed', attempts: stage.attempts, error: stage.error });
    throw new Error(`${name} failed after ${stage.attempts} attempt(s): ${stage.error}`);
  };

  try {
  const plan = await run('Planner AI', 1, () => plannerPrompt({ prompt, groupTitle, existingSpec, runtimeContract }), { stageKey: 'planning' });
  const design = await run('Game Designer AI', 2, () => designerPrompt({ prompt, plan, groupTitle, existingSpec }), { stageKey: 'design' });
  let spec = applyEditIdentity(cleanSpec(await run('Developer AI', 3, () => developerPrompt({ prompt, plan, design, existingSpec }), { stageKey: 'development' })), existingSpec);

  let validation = validateSpec(spec);
  let review = null;
  let repairCount = 0;
  const maxRepairs = 3;
  while (repairCount <= maxRepairs) {
    review = await run('Reviewer AI', 4, () => reviewerPrompt({ prompt, spec }), { stageKey: 'review' });
    if (review?.corrected_spec && typeof review.corrected_spec === 'object') {
      spec = applyEditIdentity(cleanSpec(review.corrected_spec), existingSpec);
      validation = validateSpec(spec);
    }
    const reviewerOk = review?.approved === true;
    if (validation.ok && reviewerOk) break;
    if (repairCount === maxRepairs) {
      const problems = [...validation.issues, ...(Array.isArray(review?.issues) ? review.issues : ['Reviewer did not approve the game manifest'])];
      throw new Error(`Game could not be repaired after ${maxRepairs} repair passes: ${problems.join('; ').slice(0, 1200)}`);
    }
    repairCount += 1;
    const issues = [...validation.issues, ...(Array.isArray(review?.issues) ? review.issues : [])];
    spec = applyEditIdentity(cleanSpec(await run(`Repair Developer AI (pass ${repairCount})`, 3, () => fixerPrompt({ spec, issues, prompt, failedStage: validation.ok ? 'review' : 'schema validation' }), { stageKey: `repair_${repairCount}`, maxAttempts: 2 })), existingSpec);
    validation = validateSpec(spec);
  }

  const qa = await run('QA Tester AI', 5, () => testerPrompt({ spec, prompt }), { stageKey: 'qa' });
  const testSummary = runContractTests(spec);
  if (testSummary.failed > 0) {
    // Targeted self-heal: repair only the manifest/contract stage, then re-run deterministic tests.
    const repaired = await run('QA Repair AI', 3, () => fixerPrompt({ spec, issues: testSummary.checks.filter((x) => x.status === 'failed'), prompt, failedStage: 'QA contract checks' }), { stageKey: 'qa_repair' });
    spec = applyEditIdentity(cleanSpec(repaired), existingSpec);
    validation = validateSpec(spec);
    const afterRepair = runContractTests(spec);
    if (!validation.ok || afterRepair.failed > 0) throw new Error(`QA repair failed: ${[...validation.issues, ...afterRepair.checks.filter((x) => x.status === 'failed').map((x) => x.name)].join('; ')}`);
  }

  const testCases = Array.isArray(qa?.test_cases) ? qa.test_cases.slice(0, 12) : [];
  const readme = spec.type === 'command_game'
    ? `# ${spec.title}\n\n${spec.description}\n\n- Entry: /${spec.slug}\n- Runtime: safe command DSL v2\n- Version: ${spec.version}\n\n## Commands\n\n${(spec.content.commands || []).map((c) => `- /${c.command} — ${c.description}`).join('\n')}\n\n${spec.content.help || ''}\n\nThe game uses validated, declarative actions and persistent player/group state. No generated source code is executed.\n`
    : `# ${spec.title}\n\n${spec.description}\n\n- Command: /${spec.slug}\n- Type: ${spec.type}\n- Version: ${spec.version}\n- Round time: ${spec.settings.round_seconds}s\n\n## Rules\n\n1. Run the command in the group.\n2. Read the prompt and options.\n3. Reply with the option number or exact answer before the timer ends.\n4. Correct answers award experience points. No wagers or paid stakes are used.\n`;

  return {
    success: true,
    spec,
    readme,
    tests: { ai_test_cases: testCases, contract_checks: runContractTests(spec).checks },
    testSummary: (() => { const summary = runContractTests(spec); return { total: summary.total, passed: summary.passed, failed: summary.failed }; })(),
    agents,
    stages,
    repairPasses: repairCount
  };
  } catch (error) {
    error.agents = agents;
    error.stages = stages;
    throw error;
  }
}
