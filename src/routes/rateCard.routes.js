const express = require('express');
const router = express.Router();
const rateCardController = require('../controllers/rateCard.controller');

// Create a new rate card
router.post('/', rateCardController.createRateCard);

// Get all rate cards for a specific application type
// Get all rate cards for a specific application type
router.get('/:applicationTypeId', rateCardController.getRateCardsByAppType);

// Update a rate card
router.put('/:id', rateCardController.updateRateCard);

// Delete a rate card
router.delete('/:id', rateCardController.deleteRateCard);

module.exports = router;
