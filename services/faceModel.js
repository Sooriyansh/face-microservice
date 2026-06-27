const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const Student = require('../models/Student');
const { getImageDeliveryUrl } = require('./cloudinary');
const { getPythonExecutable, PROJECT_ROOT } = require('./pythonRuntime');

const execFileAsync = promisify(execFile);
const DATASET_ROOT = path.join(PROJECT_ROOT, 'python', 'data', 'dataset');
const MODELS_ROOT = path.join(PROJECT_ROOT, 'python', 'data', 'models');
const EMBEDDINGS_PATH = path.join(MODELS_ROOT, 'face_embeddings.npz');
const TRAIN_SCRIPT = path.join(PROJECT_ROOT, 'python', 'train_model.py');

let modelBuildPromise = null;

class ImageDownloadError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'ImageDownloadError';
    this.status = status;
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function trainEmbeddings() {
  await fs.mkdir(MODELS_ROOT, { recursive: true });

  await execFileAsync(getPythonExecutable(), [TRAIN_SCRIPT], {
    cwd: PROJECT_ROOT,
    timeout: 300000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      TF_CPP_MIN_LOG_LEVEL: '2',
    },
  });
}

async function downloadImage(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new ImageDownloadError(
      `Could not download enrollment image: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

async function downloadEnrollmentImage(image) {
  const urls = [image.url, getImageDeliveryUrl(image.publicId)].filter(Boolean);
  const uniqueUrls = [...new Set(urls)];
  const errors = [];

  for (const url of uniqueUrls) {
    try {
      return await downloadImage(url);
    } catch (error) {
      errors.push(error);
    }
  }

  const lastError = errors[errors.length - 1];
  if (errors.length && errors.every(isPermanentlyUnavailable)) {
    throw lastError;
  }

  throw errors.find((error) => !isPermanentlyUnavailable(error)) || lastError || new Error('Could not download enrollment image: missing URL');
}

function isPermanentlyUnavailable(error) {
  return error instanceof ImageDownloadError && [404, 410].includes(error.status);
}

async function removeUnavailableEnrollmentImages(student, unavailableImageIds, restoredForStudent) {
  if (!unavailableImageIds.length) {
    return;
  }

  const update = {
    $pull: {
      enrollmentImages: {
        _id: {
          $in: unavailableImageIds,
        },
      },
    },
  };

  if (student.enrollmentImages.length - unavailableImageIds.length < 6) {
    update.$set = {
      faceLoginEnabled: false,
      enrollmentStatus: 'Re-enrollment Required',
      enrollmentReviewedAt: new Date(),
      enrollmentReviewNote:
        restoredForStudent > 0
          ? 'Some stored biometric images are no longer available. Capture a new enrollment set.'
          : 'Stored biometric images are no longer available. Capture a new enrollment set.',
    };
  }

  await Student.updateOne({ _id: student._id }, update);
}

async function restoreDatasetFromMongo() {
  await fs.rm(DATASET_ROOT, { recursive: true, force: true });
  await fs.mkdir(DATASET_ROOT, { recursive: true });

  const students = await Student.find({
    enrollmentImages: {
      $exists: true,
      $ne: [],
    },
  })
    .select('faceLabel enrollmentImages')
    .lean();

  let restoredCount = 0;
  const skippedImages = [];

  for (const student of students) {
    const labelDir = path.join(DATASET_ROOT, student.faceLabel);
    await fs.mkdir(labelDir, { recursive: true });
    let restoredForStudent = 0;
    const unavailableImageIds = [];

    for (const [index, image] of student.enrollmentImages.entries()) {
      if (!image.url && !image.publicId) {
        skippedImages.push(`${student.faceLabel}/${image.fileName || index}: missing URL`);
        continue;
      }

      const fileName = image.fileName || `${String(index).padStart(3, '0')}.jpg`;
      try {
        const imageBuffer = await downloadEnrollmentImage(image);
        await fs.writeFile(path.join(labelDir, fileName), imageBuffer);
        restoredCount += 1;
        restoredForStudent += 1;
      } catch (error) {
        if (isPermanentlyUnavailable(error) && image._id) {
          unavailableImageIds.push(image._id);
        }

        skippedImages.push(`${student.faceLabel}/${fileName}: ${error.message}`);
      }
    }

    await removeUnavailableEnrollmentImages(student, unavailableImageIds, restoredForStudent);

    if (!restoredForStudent) {
      await fs.rm(labelDir, { recursive: true, force: true });
    }
  }

  if (!restoredCount) {
    const skippedSummary = skippedImages.length ? ` Skipped images: ${skippedImages.slice(0, 5).join('; ')}` : '';
    throw new Error(`No downloadable enrollment images found in MongoDB to train the face model.${skippedSummary}`);
  }

  if (skippedImages.length) {
    console.warn(`Skipped ${skippedImages.length} unavailable enrollment image(s) while rebuilding the face model.`);
    skippedImages.slice(0, 10).forEach((item) => console.warn(`- ${item}`));
  }
}

async function rebuildFaceModelFromCloud() {
  try {
    await restoreDatasetFromMongo();
    await trainEmbeddings();
  } finally {
    await fs.rm(DATASET_ROOT, { recursive: true, force: true });
  }
}

async function tryRebuildFaceModelFromCloud() {
  try {
    await rebuildFaceModelFromCloud();
    return { success: true };
  } catch (error) {
    console.error('Face model rebuild failed:', error.message);
    return {
      success: false,
      message: error.message,
    };
  }
}

async function ensureFaceModelReady() {
  if (await pathExists(EMBEDDINGS_PATH)) {
    return;
  }

  if (!modelBuildPromise) {
    modelBuildPromise = rebuildFaceModelFromCloud().finally(() => {
      modelBuildPromise = null;
    });
  }

  await modelBuildPromise;
}

module.exports = {
  DATASET_ROOT,
  EMBEDDINGS_PATH,
  ensureFaceModelReady,
  rebuildFaceModelFromCloud,
  trainEmbeddings,
  tryRebuildFaceModelFromCloud,
};
