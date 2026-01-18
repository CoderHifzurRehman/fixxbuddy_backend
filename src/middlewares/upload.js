const multer = require('multer');

// Configure storage
const storage = multer.memoryStorage();

// Shared upload instance with 20MB limit
const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20 MB
  }
});

module.exports = upload;
