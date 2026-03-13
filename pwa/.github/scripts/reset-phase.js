const fs = require('fs');
const phase = process.argv.find((a, i, arr) => arr[i - 1] === '--phase');

if (!phase) { console.error('Usage: --phase <name>'); process.exit(1); }

const state = JSON.parse(fs.readFileSync('BUILD_STATE.json', 'utf8'));
state.phases[phase].status = 'pending';
state.phases[phase].attempts = 0;
state.blocked = false;
state.blocked_reason = null;
state.last_error = null;

fs.writeFileSync('BUILD_STATE.json', JSON.stringify(state, null, 2));
console.log(`Reset phase ${phase} to pending`);
