const path = require('path');
const fs = require('fs');
require('../config/testingEnv').applyTestingEnvDefaults();

const PROJECT_ROOT = path.join(__dirname, '..');
const WINDOWS_VENV_PYTHON = path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
const POSIX_VENV_PYTHON = path.join(PROJECT_ROOT, '.venv', 'bin', 'python');

function getPythonExecutable() {
  if (process.env.PYTHON_EXECUTABLE) {
    return process.env.PYTHON_EXECUTABLE;
  }

  if (process.platform === 'win32') {
    return fs.existsSync(WINDOWS_VENV_PYTHON) ? WINDOWS_VENV_PYTHON : 'python';
  }

  return fs.existsSync(POSIX_VENV_PYTHON) ? POSIX_VENV_PYTHON : 'python3';
}

module.exports = {
  getPythonExecutable,
  PROJECT_ROOT,
};
