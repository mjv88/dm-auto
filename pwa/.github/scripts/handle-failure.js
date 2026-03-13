const fs = require('fs');
const phase = process.argv.find((a, i, arr) => arr[i - 1] === '--phase');

if (!phase) { console.error('Usage: --phase <name>'); process.exit(1); }

const state = JSON.parse(fs.readFileSync('BUILD_STATE.json', 'utf8'));
state.phases[phase].attempts++;
state.phases[phase].status = 'failed';
state.last_error = `Phase ${phase} failed at ${new Date().toISOString()}`;

if (state.phases[phase].attempts >= 3) {
  state.blocked = true;
  state.blocked_reason = `Phase ${phase} failed 3 times. Human intervention required.`;
  state.phases[phase].status = 'blocked';

  const blocked = `# Pipeline Blocked\n\n## Phase: ${phase}\n## Failed: 3 times\n## Time: ${new Date().toISOString()}\n\n## What to do\n\n1. Check GitHub Actions logs for the last 3 runs\n2. Review \`.github/tasks/${phase}.md\`\n3. Fix manually or update the task prompt\n4. Reset: \`node .github/scripts/reset-phase.js --phase ${phase}\`\n5. Push to main to restart\n`;
  fs.writeFileSync('BLOCKED.md', blocked);
}

fs.writeFileSync('BUILD_STATE.json', JSON.stringify(state, null, 2));
