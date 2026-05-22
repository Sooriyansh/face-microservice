const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const Student = require('../models/Student');
const { deleteImages, uploadImageBuffer } = require('../services/cloudinary');
const { DATASET_ROOT, trainEmbeddings } = require('../services/faceModel');

const router = express.Router();

async function saveEnrollmentImages(faceLabel, images, savedImages) {
  const labelDir = path.join(DATASET_ROOT, faceLabel);
  await fs.rm(labelDir, { recursive: true, force: true });
  await fs.mkdir(labelDir, { recursive: true });

  for (const [index, image] of images.entries()) {
    const [, encoded] = String(image).split(',');
    if (!encoded) {
      throw new Error(`Invalid image payload at index ${index}`);
    }

    const fileName = `${String(index).padStart(3, '0')}.jpg`;
    const filePath = path.join(labelDir, fileName);
    const imageBuffer = Buffer.from(encoded, 'base64');

    await fs.writeFile(filePath, imageBuffer);

    const publicId = `${String(index).padStart(3, '0')}`;
    const uploadResult = await uploadImageBuffer(imageBuffer, {
      folder: `faceAttendance/dataset/${faceLabel}`,
      publicId,
    });

    savedImages.push({
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileName,
    });
  }

  return savedImages;
}

router.get('/', async (req, res, next) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, students });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, faceLabel, rollNumber, joiningDate, department, email, enrollmentImages = [] } = req.body;

    if (!name || !faceLabel || !joiningDate) {
      return res.status(400).json({
        success: false,
        message: 'name and faceLabel are required',
      });
    }

    if (!Array.isArray(enrollmentImages) || enrollmentImages.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'At least 6 face scan images are required',
      });
    }

    const existingStudent = await Student.findOne({ faceLabel }).lean();

    if (existingStudent) {
      return res.status(409).json({
        success: false,
        message: 'faceLabel already exists',
      });
    }

    let savedImages = [];

    try {
      savedImages = await saveEnrollmentImages(faceLabel, enrollmentImages, savedImages);
      await trainEmbeddings();

      const student = await Student.create({
        name,
        faceLabel,
        rollNumber,
        joiningDate,
        department,
        email,
        enrollmentImages: savedImages,
      });

      return res.status(201).json({ success: true, student });
    } catch (error) {
      await fs.rm(path.join(DATASET_ROOT, faceLabel), { recursive: true, force: true });
      await deleteImages(savedImages.map((image) => image.publicId));

      return res.status(500).json({
        success: false,
        message:
          'Student could not be saved because images could not be stored or the face model could not be trained. Check Cloudinary and Python setup.',
        details: error.message,
      });
    }
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'faceLabel already exists',
      });
    }

    next(error);
  }
});

module.exports = router;
