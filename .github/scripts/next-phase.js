const fs = require('fs');
const state = JSON.parse(fs.readFileSync('BUILD_STATE.json', 'utf8'));

const PHASE_ORDER = [
  'scaffold', 'schema', 'xapi_client', 'auth',
  'routes', 'audit', 'tests', 'hardening', 'integration'
];

const DEPENDENCIES = {
  scaffold:    [],
  schema:      ['scaffold'],
  xapi_client: ['schema'],
  auth:        ['xapi_client'],
  routes:      ['auth'],
  audit:       ['routes'],
  tests:       ['audit'],
  hardening:   ['tests'],
  integration: ['hardening'],
};

const next = PHASE_ORDER.find(p => state.phases[p].status === 'pending');
if (!next) {
  console.log('All phases complete');
  process.exit(0);
}

const unmet = DEPENDENCIES[next].filter(d => state.phases[d].status !== 'complete');
if (unmet.length) {
  console.error(`Unmet dependencies for ${next}: ${unmet.join(', ')}`);
  process.exit(1);
}

const output = `phase=${next}`;
fs.appendFileSync(process.env.GITHUB_OUTPUT || '/dev/null', output + '\n');
console.log(`Next phase: ${next}`);
