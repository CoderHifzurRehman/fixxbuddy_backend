const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

// Load configuration from environment variables
const {
  accessKeyId,
  secretAccessKey,
  bucketName,
  region,
  imagebaseurl
} = require('../config/awsbucketconfig');

// Function to sanitize file names
const sanitizeFileName = (fileName) => {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
};

// Initialize the S3 client
const s3 = new S3Client({
  region: region,
  credentials: {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey
  }
});

// Upload a single image file to S3
exports.uploadSingleImageToS3 = async (file, folderName) => {
  if (!file || !file.buffer) {
    throw new Error('Missing image file or file buffer');
  }

  const filePath = `${folderName}/${file.originalname}`; // The path for the object in the bucket

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filePath,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read' // Make it publicly readable
    });

    const response = await s3.send(command);
    const imageUrl = `${imagebaseurl}/${filePath}`;

    return imageUrl;
  } catch (error) {
    console.error('Error details:', error);
    throw new Error(`Error uploading image: ${error.message}`);
  }
};

// Upload multiple image files to S3
exports.uploadMultipleImagesToS3 = async (files, folderName) => {
  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new Error('Missing or invalid files array');
  }

  const uploadPromises = files.map(async (file) => {
    if (!file || !file.buffer) {
      throw new Error('Missing image file or file buffer');
    }

    const sanitizedFileName = sanitizeFileName(file.originalname);
    const filePath = `${folderName}/${sanitizedFileName}`;

    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: filePath,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read'
      });

      const response = await s3.send(command);
      const imageUrl = `${imagebaseurl}/${filePath}`;

      return imageUrl;
    } catch (error) {
      console.error(`Error uploading file ${file.originalname}:`, error);
      throw new Error(`Error uploading file ${file.originalname}: ${error.message}`);
    }
  });

  try {
    const urls = await Promise.all(uploadPromises);
    return urls;
  } catch (error) {
    console.error('Error details:', error);
    throw new Error(`Error uploading images: ${error.message}`);
  }
};