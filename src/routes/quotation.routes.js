const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotation.controller');

// Create a new quotation
router.post('/', quotationController.createQuotation);

// Get quotation by ID
router.get('/:id', quotationController.getQuotationById);

// Get quotations by Partner
router.get('/partner/:partnerId', quotationController.getQuotationsByPartner);

// Get quotations by User
router.get('/user/:userId', quotationController.getQuotationsByUser);

// Update a quotation
router.put('/:id', quotationController.updateQuotation);

// Accept a quotation
router.patch('/:id/accept', quotationController.acceptQuotation);

// Reject a quotation
router.patch('/:id/reject', quotationController.rejectQuotation);

module.exports = router;
