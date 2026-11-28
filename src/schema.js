const slugRegex = /^[a-z][a-z0-9_]{1,23}$/;
const commandRegex = /^[a-z][a-z0-9_]{1,23}$/;
const stateKeyRegex = /^[a-z][a-z0-9_]{0,23}$/;
const RESERVED = new Set(['start','help','setup','send','newgame','games','editgame','deletegame','restoregame','versions','rollback','leaderboard','cancel','mygroups','mygames','vip','setvip','removevip','setgroupname']);
const ACTIONS = new Set(['reply','random_reply','award_random_points','award_points','spend_points','show_leaderboard','show_stats','create_challenge','accept_challenge','cancel_challenge','show_help','set_value','increment_value','random_value','show_value','reset_values','if_value','store_argument','compare_values']);
const SCOPES = new Set(['player','group']);

const isText = (value, max, min = 1) => typeof value === 'string' && value.trim().length >= min && value.length <= max;
const isFiniteNumber = (value) => Number.isFinite(Number(value));

function validateActions(actions, issues, location, depth = 0) {
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > 8) {
    issues.push(`${location}: actions must contain 1..8 items`);
    return;
  }
  if (depth > 2) { issues.push(`${location}: conditional nesting is too deep`); return; }
  actions.forEach((action, index) => {
    const at = `${location}, action ${index + 1}`;
    if (!action || typeof action !== 'object' || Array.isArray(action) || !ACTIONS.has(action.type)) {
      issues.push(`${at}: unsupported action type`); return;
    }
    if (action.type === 'reply' && !isText(action.text, 700)) issues.push(`${at}: reply.text must be 1..700 chars`);
    if (action.type === 'random_reply' && (!Array.isArray(action.responses) || action.responses.length < 2 || action.responses.length > 20 || action.responses.some((x) => !isText(x, 500)))) issues.push(`${at}: responses must contain 2..20 short texts`);
    if (action.type === 'award_random_points') {
      const min = Number(action.min_points), max = Number(action.max_points), cooldown = Number(action.cooldown_seconds);
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 100000 || min > max) issues.push(`${at}: invalid random points range`);
      if (!Number.isInteger(cooldown) || cooldown < 1 || cooldown > 604800) issues.push(`${at}: cooldown_seconds must be 1..604800`);
      if (action.success_message != null && !isText(action.success_message, 500)) issues.push(`${at}: invalid success_message`);
    }
    if (action.type === 'award_points' && (!Number.isInteger(Number(action.points)) || Number(action.points) < 1 || Number(action.points) > 100000)) issues.push(`${at}: points must be 1..100000`);
    if (action.type === 'spend_points') {
      if (!Number.isInteger(Number(action.points)) || Number(action.points) < 1 || Number(action.points) > 100000) issues.push(`${at}: spend points must be 1..100000`);
      if (action.message != null && !isText(action.message, 500)) issues.push(`${at}: invalid success message`);
      if (action.insufficient_message != null && !isText(action.insufficient_message, 500)) issues.push(`${at}: invalid insufficient-points message`);
    }
    if (action.type === 'show_leaderboard') {
      const limit = Number(action.limit ?? 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) issues.push(`${at}: limit must be 1..20`);
      if (action.metric != null && action.metric !== 'score' && !stateKeyRegex.test(String(action.metric))) issues.push(`${at}: invalid leaderboard metric`);
    }
    if (['set_value','increment_value','random_value','show_value','reset_values'].includes(action.type)) {
      if (!SCOPES.has(action.scope)) issues.push(`${at}: scope must be player or group`);
      if (action.type !== 'reset_values' && !stateKeyRegex.test(String(action.key || ''))) issues.push(`${at}: invalid state key`);
      if (action.type === 'set_value' && (!['string','number','boolean'].includes(typeof action.value) || String(action.value).length > 500)) issues.push(`${at}: value must be a short string, number or boolean`);
      if (action.type === 'increment_value' && (!isFiniteNumber(action.amount) || Math.abs(Number(action.amount)) > 1000000)) issues.push(`${at}: amount must be numeric and bounded`);
      if (action.type === 'random_value') {
        const min = Number(action.min), max = Number(action.max);
        if (!Number.isInteger(min) || !Number.isInteger(max) || min > max || min < -1000000 || max > 1000000) issues.push(`${at}: random range must be bounded integers`);
      }
      if (action.type === 'show_value' && action.label != null && !isText(action.label, 100)) issues.push(`${at}: label is invalid`);
      if (action.type === 'reset_values' && action.keys != null && (!Array.isArray(action.keys) || action.keys.length > 24 || action.keys.some((x) => !stateKeyRegex.test(String(x))))) issues.push(`${at}: invalid reset keys`);
    }
    if (action.type === 'if_value') {
      if (!SCOPES.has(action.scope) || !stateKeyRegex.test(String(action.key || ''))) issues.push(`${at}: invalid condition scope/key`);
      if (!['eq','neq','gt','gte','lt','lte','contains','exists'].includes(action.operator)) issues.push(`${at}: invalid condition operator`);
      if (action.operator !== 'exists' && (action.value == null || String(action.value).length > 500)) issues.push(`${at}: condition value is required and bounded`);
      validateActions(action.then_actions, issues, `${at}.then_actions`, depth + 1);
      if (action.else_actions != null && (!Array.isArray(action.else_actions) || action.else_actions.length > 8)) issues.push(`${at}: else_actions must contain at most 8 items`);
      if (Array.isArray(action.else_actions) && action.else_actions.length) validateActions(action.else_actions, issues, `${at}.else_actions`, depth + 1);
    }
    if (action.type === 'store_argument') {
      const maxLength = Number(action.max_length ?? 120);
      const valueType = String(action.value_type || 'text');
      if (!SCOPES.has(action.scope) || !stateKeyRegex.test(String(action.key || ''))) issues.push(`${at}: invalid argument target`);
      if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 500) issues.push(`${at}: max_length must be 1..500`);
      if (!['text','number','choice'].includes(valueType)) issues.push(`${at}: value_type must be text, number or choice`);
      if (valueType === 'number') {
        if (action.min != null && !Number.isFinite(Number(action.min))) issues.push(`${at}: invalid numeric minimum`);
        if (action.max != null && !Number.isFinite(Number(action.max))) issues.push(`${at}: invalid numeric maximum`);
        if (action.min != null && action.max != null && Number(action.min) > Number(action.max)) issues.push(`${at}: numeric minimum exceeds maximum`);
      }
      if (valueType === 'choice' && (!Array.isArray(action.choices) || action.choices.length < 2 || action.choices.length > 20 || action.choices.some((x) => !isText(x, 100)))) issues.push(`${at}: choice input requires 2..20 short choices`);
      if (action.message != null && !isText(action.message, 500)) issues.push(`${at}: invalid missing-argument message`);
      if (action.invalid_message != null && !isText(action.invalid_message, 500)) issues.push(`${at}: invalid invalid-argument message`);
    }
    if (action.type === 'compare_values') {
      if (!SCOPES.has(action.left_scope) || !SCOPES.has(action.right_scope) || !stateKeyRegex.test(String(action.left_key || '')) || !stateKeyRegex.test(String(action.right_key || ''))) issues.push(`${at}: invalid compared state references`);
      if (!['eq','neq','gt','gte','lt','lte','contains'].includes(action.operator)) issues.push(`${at}: invalid compare_values operator`);
      validateActions(action.then_actions, issues, `${at}.then_actions`, depth + 1);
      if (action.else_actions != null && (!Array.isArray(action.else_actions) || action.else_actions.length > 8)) issues.push(`${at}: else_actions must contain at most 8 items`);
      if (Array.isArray(action.else_actions) && action.else_actions.length) validateActions(action.else_actions, issues, `${at}.else_actions`, depth + 1);
    }
    if (action.type === 'create_challenge') {
      const expiry = Number(action.expires_seconds ?? 60);
      if (!Number.isInteger(expiry) || expiry < 15 || expiry > 3600) issues.push(`${at}: expires_seconds must be 15..3600`);
      if (!commandRegex.test(String(action.accept_command || ''))) issues.push(`${at}: invalid accept_command`);
      if (action.cancel_command && !commandRegex.test(String(action.cancel_command))) issues.push(`${at}: invalid cancel_command`);
      if ((action.result || 'random') !== 'random' || (action.transfer || 'loser_all_score') !== 'loser_all_score') issues.push(`${at}: unsupported challenge result/transfer`);
    }
    if (action.type === 'reply' || action.type === 'random_reply' || action.type === 'award_points') {
      if (action.message != null && String(action.message).length > 500) issues.push(`${at}: message is too long`);
    }
  });
}

export function validateSpec(spec) {
  const issues = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { ok: false, issues: ['Game spec must be a JSON object.'] };
  if (!slugRegex.test(String(spec.slug || '')) || RESERVED.has(String(spec.slug || '').toLowerCase())) issues.push('slug is invalid or reserved');
  if (!isText(spec.title, 100)) issues.push('title must be 1..100 chars');
  if (!isText(spec.description, 500)) issues.push('description must be 1..500 chars');

  if (spec.type === 'command_game') {
    if (!['command_dsl_v1','command_dsl_v2'].includes(spec.settings?.mode)) issues.push('settings.mode must be command_dsl_v2');
    const commands = spec.content?.commands;
    if (!Array.isArray(commands) || commands.length < 1 || commands.length > 24) issues.push('commands must contain 1..24 items');
    if (Array.isArray(commands)) {
      const names = commands.map((item) => String(item?.command || '').toLowerCase());
      if (names.some((name) => !commandRegex.test(name) || RESERVED.has(name))) issues.push('command names must be valid and not reserved');
      if (new Set(names).size !== names.length) issues.push('command names must be unique');
      commands.forEach((command, index) => {
        if (!isText(command?.description, 160)) issues.push(`command ${index + 1}: invalid description`);
        validateActions(command?.actions, issues, `command ${index + 1}`);
      });
      for (const command of commands) for (const action of command.actions || []) if (action?.type === 'create_challenge') {
        const accept = commands.find((item) => item.command === action.accept_command);
        if (!accept?.actions?.some((item) => item.type === 'accept_challenge')) issues.push(`/${action.accept_command} must contain accept_challenge`);
        if (action.cancel_command) {
          const cancel = commands.find((item) => item.command === action.cancel_command);
          if (!cancel?.actions?.some((item) => item.type === 'cancel_challenge')) issues.push(`/${action.cancel_command} must contain cancel_challenge`);
        }
      }
    }
    if (spec.content?.help != null && String(spec.content.help).length > 2000) issues.push('help text is too long');
  } else if (['quiz','piano','word_guess','memory'].includes(spec.type)) {
    const rounds = spec.content?.rounds;
    if (!Array.isArray(rounds) || rounds.length < 1 || rounds.length > 30) issues.push('content.rounds must contain 1..30 rounds');
    if (Array.isArray(rounds)) rounds.forEach((round, index) => {
      const n = index + 1;
      if (!round || typeof round !== 'object') { issues.push(`round ${n} is invalid`); return; }
      if (!isText(round.prompt, 1000)) issues.push(`round ${n}: prompt is invalid`);
      if (!Array.isArray(round.options) || round.options.length < 2 || round.options.length > 4) issues.push(`round ${n}: use 2..4 options`);
      const options = (round.options || []).map((option) => String(option).trim().toLocaleLowerCase());
      if (new Set(options).size !== options.length) issues.push(`round ${n}: options must be unique`);
      if (!round.options?.some((option) => String(option).trim().toLocaleLowerCase() === String(round.answer || '').trim().toLocaleLowerCase())) issues.push(`round ${n}: answer must match an option`);
    });
    const seconds = Number(spec.settings?.round_seconds ?? 30);
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 180) issues.push('settings.round_seconds must be 10..180');
  } else {
    issues.push(`unsupported game type: ${String(spec.type || '')}`);
  }
  if (Buffer.byteLength(JSON.stringify(spec), 'utf8') > 60000) issues.push('game manifest is too large');
  return { ok: issues.length === 0, issues };
}

export function runContractTests(spec) {
  const validation = validateSpec(spec);
  const checks = [
    { name: 'JSON manifest', status: spec && typeof spec === 'object' && !Array.isArray(spec) ? 'passed' : 'failed' },
    { name: 'Supported runtime contract', status: spec?.type === 'command_game' ? (['command_dsl_v1','command_dsl_v2'].includes(spec?.settings?.mode) ? 'passed' : 'failed') : (['quiz','piano','word_guess','memory'].includes(spec?.type) ? 'passed' : 'failed') },
    { name: 'Manifest validation', status: validation.ok ? 'passed' : 'failed', detail: validation.issues.join('; ') }
  ];
  return { total: checks.length, passed: checks.filter((x) => x.status === 'passed').length, failed: checks.filter((x) => x.status === 'failed').length, checks };
}
