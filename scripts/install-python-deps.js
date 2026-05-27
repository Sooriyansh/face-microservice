const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const requirementsPath = path.join(projectRoot, 'python', 'requirements-render.txt');
const venvPath = path.join(projectRoot, '.venv');
const venvPython =
  process.platform === 'win32'
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');
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

const shouldInstall = process.env.SKIP_PYTHON_DEPS !== '1';

if (!shouldInstall) {
  console.log(
    'Skipping Python dependency install because SKIP_PYTHON_DEPS=1 is set.'
  );
  process.exit(0);
}

const python = findPython();

if (!python) {
  console.error('Python was not found. Render needs Python available to install face-recognition dependencies.');
  process.exit(1);
}

const venvResult = run(python.command, [...python.baseArgs, '-m', 'venv', venvPath]);

if (venvResult.status !== 0) {
  console.warn('Could not create .venv. Falling back to installing Python packages into the available Python environment.');
  const fallbackPipResult = run(python.command, [...python.baseArgs, '-m', 'pip', 'install', '-r', requirementsPath]);
  process.exit(fallbackPipResult.status || 0);
}

const pipResult = run(venvPython, ['-m', 'pip', 'install', '-r', requirementsPath]);

process.exit(pipResult.status || 0);
