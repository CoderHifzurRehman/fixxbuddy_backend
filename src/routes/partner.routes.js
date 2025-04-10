const express = require('express');
const partnerController = require('../controllers/partner.controller');
const multer = require('multer');
// Set up Multer for file upload handling
const storage = multer.memoryStorage(); // Store files in memory for easier uploading
const upload = multer({ storage });

const {authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const router = express.Router();



//base url
//   /api/partners
router.post("/registration", partnerController.partnerRegistration);

router.patch("/profile/update/:id", partnerController.updateProfile);

router.post('/upload/images/:id', upload.fields([
    { name: 'profilePic', maxCount: 1 },
    { name: 'aadharPic', maxCount: 1 },
    { name: 'pcc', maxCount: 1 }
  ]), partnerController.uploadImages);

router.post("/login", partnerController.partnerLogin);


router.delete("/:id", partnerController.deletePartner);

router.put("/:id", partnerController.updateProfile);

router.get("/single/:id", partnerController.getSinglePartner);



//get all partner

router.get("/", partnerController.getAllPartenrs);

module.exports = router;
