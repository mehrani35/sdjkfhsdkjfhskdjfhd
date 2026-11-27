import { generateText, parseJson } from './gemini.js';
import { validateSpec, runContractTests } from './schema.js';
import { plannerPrompt, designerPrompt, developerPrompt, reviewerPrompt, testerPrompt, fixerPrompt } from './prompts.js';

function cleanSpec(spec) {
  const rounds = Array.isArray(spec?.content?.rounds) ? spec.content.rounds : [];
  return {
    slug: String(spec?.slug || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24),
    title: String(spec?.title || '').trim().slice(0, 100),
    description: String(spec?.description || '').trim().slice(0, 500),
    type: String(spec?.type || '').trim(),
    version: String(spec?.version || '1.0.0').slice(0, 32),
    settings: { round_seconds: Number(spec?.settings?.round_seconds || 30) },
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
  const v = String(existingSpec.version || '1.0.0').split('.').map((x) => Number(x) || 0);
  spec.version = `${v[0]}.${v[1]}.${v[2] + 1}`;
  return spec;
}

export async function buildGame({ prompt, groupTitle, existingSpec = null }) {
  const agents = [];
  const run = async (name, keyIndex, createPrompt) => {
    const started = Date.now();
    const output = await generateText({ keyIndex, prompt: createPrompt() });
    agents.push({ name, model: 'configured', keySlot: keyIndex, durationMs: Date.now() - started, status: 'completed' });
    return parseJson(output);
  };

  const plan = await run('Planner AI', 1, () => plannerPrompt({ prompt, groupTitle, existingSpec }));
  const design = await run('Game Designer AI', 2, () => designerPrompt({ prompt, plan, groupTitle, existingSpec }));
  let spec = cleanSpec(await run('Developer AI', 3, () => developerPrompt({ prompt, plan, design, existingSpec })));

  spec = applyEditIdentity(spec, existingSpec);
  const review = await run('Reviewer AI', 4, () => reviewerPrompt({ prompt, spec }));
  if (review?.corrected_spec && typeof review.corrected_spec === 'object') spec = cleanSpec(review.corrected_spec);
  spec = applyEditIdentity(spec, existingSpec);

  let validation = validateSpec(spec);
  if (!validation.ok) {
    spec = cleanSpec(await run('Repair pass', 3, () => fixerPrompt({ spec, issues: validation.issues })));
    spec = applyEditIdentity(spec, existingSpec);
    validation = validateSpec(spec);
  }
  if (!validation.ok) throw new Error(`Game manifest failed schema validation: ${validation.issues.join('; ')}`);
  if (review?.approved === false && !review?.corrected_spec) throw new Error('Reviewer rejected the manifest without a valid correction. Please refine the game prompt.');

  const qa = await run('QA Tester AI', 5, () => testerPrompt({ spec }));
  const testSummary = runContractTests(spec);
  if (testSummary.failed > 0) throw new Error(`QA contract tests failed: ${testSummary.checks.filter((x) => x.status === 'failed').map((x) => x.name).join(', ')}`);

  const testCases = Array.isArray(qa?.test_cases) ? qa.test_cases.slice(0, 12) : [];
  const readme = `# ${spec.title}\n\n${spec.description}\n\n- Command: /${spec.slug}\n- Type: ${spec.type}\n- Version: ${spec.version}\n- Round time: ${spec.settings.round_seconds}s\n\n## Rules\n\n1. Run the command in the group.\n2. Read the prompt and options.\n3. Reply with the option number or exact answer before the timer ends.\n4. Correct answers award experience points. No wagers or paid stakes are used.\n`;
  return {
    success: true,
    spec,
    readme,
    tests: { ai_test_cases: testCases, contract_checks: testSummary.checks },
    testSummary: { total: testSummary.total, passed: testSummary.passed, failed: testSummary.failed },
    agents
  };
}
