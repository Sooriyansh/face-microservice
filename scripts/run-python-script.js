const { spawnSync } = require('child_process');
const path = require('path');

const { getPythonExecutable, PROJECT_ROOT } = require('../services/pythonRuntime');

const scriptName = process.argv[2];
const scriptArgs = process.argv.slice(3);

if (!scriptName) {
  console.error('Usage: node scripts/run-python-script.js <script.py> [...args]');
  process.exit(1);
}

const scriptPath = path.join(PROJECT_ROOT, 'python', scriptName);
const result = spawnSync(getPythonExecutable(), [scriptPath, ...scriptArgs], {
  cwd: PROJECT_ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    TF_CPP_MIN_LOG_LEVEL: process.env.TF_CPP_MIN_LOG_LEVEL || '2',
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status || 0);
