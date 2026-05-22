const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const requirementsPath = path.join(projectRoot, 'python', 'requirements-render.txt');
const candidates =
  process.platform === 'win32'
    ? [
        { command: 'py', baseArgs: ['-3.12'] },
        { command: 'python', baseArgs: [] },
      ]
    : [
        { command: 'python3', baseArgs: [] },
        { command: 'python', baseArgs: [] },
      ];

function run(command, args) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}

function findPython() {
  for (const candidate of candidates) {
    const result = run(candidate.command, [...candidate.baseArgs, '--version']);

    if (result.status === 0) {
      return candidate;
    }
  }

  return null;
}

if (process.env.SKIP_PYTHON_INSTALL === '1') {
  console.log('Skipping Python dependency install because SKIP_PYTHON_INSTALL=1.');
  process.exit(0);
}

const python = findPython();

if (!python) {
  console.error('Python was not found. Render needs Python available to install face-recognition dependencies.');
  process.exit(1);
}

const installScopeArgs = process.platform !== 'win32' && !process.env.VIRTUAL_ENV ? ['--user'] : [];
const pipResult = run(python.command, [
  ...python.baseArgs,
  '-m',
  'pip',
  'install',
  ...installScopeArgs,
  '-r',
  requirementsPath,
]);

process.exit(pipResult.status || 0);
