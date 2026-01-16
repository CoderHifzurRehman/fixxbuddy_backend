const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
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

const sanitizeS3Key = (input) => {
  if (!input) return '';
  return input
    .toString()
    .replace(/[^a-zA-Z0-9!\-_.*'()\/]/g, '_') // Added \/ to allow forward slashes
    .replace(/\/{2,}/g, '/') // Replace multiple slashes with single
    .replace(/^\/+|\/+$/g, ''); // Trim leading/trailing slashes
};
// Function to check if a file exists in S3
const checkFileExists = async (filePath) => {
  try {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: filePath
    });
    await s3.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
};
// Function to generate unique file name
const generateUniqueFileName = async (basePath, fileName) => {
  const nameParts = fileName.split('.');
  const extension = nameParts.length > 1 ? nameParts.pop() : '';
  const baseName = nameParts.join('.');
  
  let counter = 0;
  let newFileName = fileName;
  let filePath = `${basePath}/${newFileName}`;
  
  // Check if file exists and increment counter until we find a unique name
  while (await checkFileExists(filePath)) {
    counter++;
    newFileName = extension
      ? `${baseName}_${counter}.${extension}`
      : `${baseName}_${counter}`;
    filePath = `${basePath}/${newFileName}`;
  }
  
  return { uniqueFileName: newFileName, uniqueFilePath: filePath };
};

// Helper function to optimize images
const optimizeImage = async (file) => {
  // Only optimize image files
  if (!file.mimetype.startsWith('image/') || file.mimetype === 'image/svg+xml') {
    return { buffer: file.buffer, extension: null };
  }

  try {
    let pipeline = sharp(file.buffer);
    const metadata = await pipeline.metadata();

    // Resize if wider than 1200px
    if (metadata.width > 1200) {
      pipeline = pipeline.resize({ width: 1200, withoutEnlargement: true });
    }

    // Convert to webp for best compression
    const buffer = await pipeline
      .webp({ quality: 80 })
      .toBuffer();

    return { buffer, extension: 'webp' };
  } catch (error) {
    console.error('Sharp optimization error:', error);
    // Fallback to original buffer if optimization fails
    return { buffer: file.buffer, extension: null };
  }
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

  // Optimize image
  const { buffer, extension } = await optimizeImage(file);
  let fileName = file.originalname;
  let mimetype = file.mimetype;

  if (extension) {
    // Replace extension if optimized to webp
    const nameParts = fileName.split('.');
    nameParts.pop();
    fileName = `${nameParts.join('.')}.${extension}`;
    mimetype = `image/${extension}`;
  }

  const sanitizedFolderName = sanitizeS3Key(folderName);
  const sanitizedFileName = sanitizeFileName(fileName);
  
  // Generate unique file name
  const { uniqueFileName, uniqueFilePath } = await generateUniqueFileName(sanitizedFolderName, sanitizedFileName);

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueFilePath,
      Body: buffer,
      ContentType: mimetype,
      ACL: 'public-read' // Make it publicly readable
    });

    const response = await s3.send(command);
    const imageUrl = `${imagebaseurl}/${uniqueFilePath}`;

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
  const sanitizedFolderName = sanitizeS3Key(folderName);
  const uploadPromises = files.map(async (file) => {
    if (!file || !file.buffer) {
      throw new Error('Missing image file or file buffer');
    }

    // Optimize image
    const { buffer, extension } = await optimizeImage(file);
    let fileName = file.originalname;
    let mimetype = file.mimetype;

    if (extension) {
      const nameParts = fileName.split('.');
      nameParts.pop();
      fileName = `${nameParts.join('.')}.${extension}`;
      mimetype = `image/${extension}`;
    }

    const sanitizedFileName = sanitizeFileName(fileName);
    
    // Generate unique file name for each file
    const { uniqueFileName, uniqueFilePath } = await generateUniqueFileName(sanitizedFolderName, sanitizedFileName);

    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: uniqueFilePath,
        Body: buffer,
        ContentType: mimetype,
        ACL: 'public-read'
      });

      const response = await s3.send(command);
      const imageUrl = `${imagebaseurl}/${uniqueFilePath}`;

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