const fs = require('fs');
const args = process.argv.slice(2);
const phase = args[args.indexOf('--phase') + 1];
const status = args[args.indexOf('--status') + 1];

if (!phase || !status) {
  console.error('Usage: --phase <name> --status <status>');
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync('BUILD_STATE.json', 'utf8'));
state.phases[phase].status = status;
state.current_phase = phase.toUpperCase();

if (status === 'running' && !state.started_at) {
  state.started_at = new Date().toISOString();
}
if (status === 'complete') {
  state.phases[phase].completed_at = new Date().toISOString();
}

fs.writeFileSync('BUILD_STATE.json', JSON.stringify(state, null, 2));
console.log(`Updated ${phase} → ${status}`);
