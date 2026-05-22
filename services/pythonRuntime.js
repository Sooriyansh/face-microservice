const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const WINDOWS_VENV_PYTHON = path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
const POSIX_VENV_PYTHON = path.join(PROJECT_ROOT, '.venv', 'bin', 'python');

function getPythonExecutable() {
  if (process.env.PYTHON_EXECUTABLE) {
    return process.env.PYTHON_EXECUTABLE;
  }

  if (process.platform === 'win32') {
    return WINDOWS_VENV_PYTHON;
  }

  if (process.env.RENDER || process.env.NODE_ENV === 'production') {
    return 'python3';
  }

  return POSIX_VENV_PYTHON;
}

module.exports = {
  getPythonExecutable,
  PROJECT_ROOT,
};
