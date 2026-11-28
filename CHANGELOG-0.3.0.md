# v0.3.0

- Added command_dsl_v2 for custom chat games: player/group state, set/increment/random values, conditions, score, leaderboard, cooldowns and challenges.
- Updated all five agent prompts to preserve the user's requested game mechanics instead of converting custom games into quizzes.
- Added targeted agent retries, up to three manifest repair passes, stage diagnostics and QA repair.
- Added schema validation for every action, nested conditions, size, command count and reserved names.
- Explicitly disallows execution of generated JavaScript, shell, SQL or OS/process commands.
