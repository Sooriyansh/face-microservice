const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { EMBEDDINGS_PATH, ensureFaceModelReady } = require('./faceModel');
const { getPythonExecutable, PROJECT_ROOT } = require('./pythonRuntime');

const RECOGNIZE_WORKER = path.join(PROJECT_ROOT, 'python', 'recognition_worker.py');
let workerProcess = null;
let workerReadyPromise = null;
let workerStdoutBuffer = '';
let lastWorkerError = '';
let nextRequestId = 1;
let workerStartedAt = 0;
const pendingRecognitions = new Map();
const RECOGNITION_TIMEOUT_MS = Number(process.env.RECOGNITION_TIMEOUT_MS || 12000);

function rejectPendingRecognitions(message) {
  for (const [requestId, pending] of pendingRecognitions.entries()) {
    pending.reject(new Error(message));
    pendingRecognitions.delete(requestId);
  }
}

function handleWorkerMessage(rawLine) {
  let message;
  try {
    message = JSON.parse(rawLine);
  } catch (error) {
    return;
  }

  if (message.type === 'result' && message.id) {
    const pending = pendingRecognitions.get(String(message.id));
    if (!pending) return;
    pendingRecognitions.delete(String(message.id));
    pending.resolve(message.result);
  }
}

function createWorkerProcess() {
  workerStartedAt = Date.now();
  workerProcess = spawn(getPythonExecutable(), [RECOGNIZE_WORKER], {
    cwd: PROJECT_ROOT,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  workerProcess.stdout.setEncoding('utf8');
  workerProcess.stdout.on('data', (chunk) => {
    workerStdoutBuffer += chunk;
    const lines = workerStdoutBuffer.split(/\r?\n/);
    workerStdoutBuffer = lines.pop() || '';

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const message = JSON.parse(trimmed);
        if (message.type === 'ready') {
          if (workerReadyPromise) {
            workerReadyPromise.resolve(workerProcess);
            workerReadyPromise = null;
          }
          return;
        }

        if (message.type === 'fatal') {
          const fatalError = new Error(message.message || 'Recognition worker failed to start');
          if (workerReadyPromise) {
            workerReadyPromise.reject(fatalError);
            workerReadyPromise = null;
          }
          rejectPendingRecognitions(fatalError.message);
          return;
        }

        handleWorkerMessage(trimmed);
      } catch (error) {
      }
    });
  });

  workerProcess.stderr.setEncoding('utf8');
  workerProcess.stderr.on('data', (chunk) => {
    lastWorkerError += chunk;
  });

  workerProcess.on('error', (error) => {
    if (workerReadyPromise) {
      workerReadyPromise.reject(error);
      workerReadyPromise = null;
    }
    rejectPendingRecognitions(error.message);
    workerProcess = null;
    workerStartedAt = 0;
  });

  workerProcess.on('exit', (code) => {
    const reason = lastWorkerError.trim() || `Recognition worker exited with code ${code}`;
    if (workerReadyPromise) {
      workerReadyPromise.reject(new Error(reason));
      workerReadyPromise = null;
    }
    rejectPendingRecognitions(reason);
    workerProcess = null;
    workerStartedAt = 0;
    workerStdoutBuffer = '';
    lastWorkerError = '';
  });
}

async function embeddingsChangedAfterWorkerStart() {
  if (!workerProcess || !workerStartedAt) return false;
  const stats = await fs.stat(EMBEDDINGS_PATH);
  return stats.mtimeMs > workerStartedAt;
}

function stopWorkerProcess() {
  if (workerProcess && !workerProcess.killed) {
    workerProcess.kill();
  }

  workerProcess = null;
  workerStartedAt = 0;
  workerStdoutBuffer = '';
  lastWorkerError = '';
}

async function getWorkerProcess() {
  await ensureFaceModelReady();

  if (await embeddingsChangedAfterWorkerStart()) {
    stopWorkerProcess();
  }

  if (workerProcess && !workerProcess.killed && workerReadyPromise === null) {
    return workerProcess;
  }

  if (workerReadyPromise) {
    return workerReadyPromise.promise;
  }

  let resolveReady;
  let rejectReady;
  const promise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  workerReadyPromise = {
    promise,
    resolve: resolveReady,
    reject: rejectReady,
  };

  createWorkerProcess();
  return promise;
}

async function runRecognition(imageBuffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attendance-scan-'));
  const imagePath = path.join(tempDir, 'frame.jpg');

  try {
    await fs.writeFile(imagePath, imageBuffer);
    const worker = await getWorkerProcess();
    const requestId = String(nextRequestId++);

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRecognitions.delete(requestId);
        reject(new Error('Recognition timed out. Keep your face centered and try again.'));
      }, RECOGNITION_TIMEOUT_MS);

      pendingRecognitions.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      worker.stdin.write(`${JSON.stringify({ id: requestId, imagePath })}\n`);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  getWorkerProcess,
  runRecognition,
};
