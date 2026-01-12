const RateCard = require('../models/rateCard.model');

// Create a new rate card item
exports.createRateCard = async (req, res) => {
  try {
    const { applicationTypeId, name, type, price, description, itemName, itemCost, itemType } = req.body;
    console.log('[DEBUG] createRateCard req.body:', req.body);
    
    // Map frontend fields if necessary
    const finalName = name || itemName;
    const finalPrice = price || itemCost;
    const finalType = type || itemType;

    if (!applicationTypeId || !finalName || !finalPrice) {
      console.log('[ERROR] Missing required fields');
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newRateCard = new RateCard({
      applicationTypeId,
      name: finalName,
      type: finalType,
      price: finalPrice, // Ensure this matches schema type (Number)
      description,
    });

    const savedRateCard = await newRateCard.save();
    res.status(201).json(savedRateCard);
  } catch (error) {
    console.error('Error creating rate card:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Get all rate cards for a specific application type
exports.getRateCardsByAppType = async (req, res) => {
  try {
    const { applicationTypeId } = req.params;
    const rateCards = await RateCard.find({ applicationTypeId, isActive: true });
    res.status(200).json(rateCards);
  } catch (error) {
    console.error('Error fetching rate cards:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Update a rate card item
exports.updateRateCard = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedRateCard = await RateCard.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updatedRateCard) {
      return res.status(404).json({ message: 'Rate card item not found' });
    }

    res.status(200).json(updatedRateCard);
  } catch (error) {
    console.error('Error updating rate card:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Delete (soft delete) a rate card item
exports.deleteRateCard = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Soft delete (set isActive to false) or hard delete? User said "delete", but usually soft delete is better.
    // I'll stick to hard delete if they strictly want to remove it, or soft.
    // Let's do hard delete for now as per "add update or delet" usually implies removal from list. 
    // But for historical data integrity in quotations, soft delete is vastly superior.
    // I will do soft delete by setting isActive: false if it's referenced elsewhere, 
    // but here let's just do findByIdAndDelete for simplicity unless explicitly asked for soft.
    // Actually, consistency with getRateCardsByAppType (isActive: true) suggests soft delete is intended or allowed.
    // Let's implement soft delete (isActive=false) as the primary "delete" action exposed to admin for safety.
    
    const deletedRateCard = await RateCard.findByIdAndUpdate(id, { isActive: false }, { new: true });
    // const deletedRateCard = await RateCard.findByIdAndDelete(id);

    if (!deletedRateCard) {
      return res.status(404).json({ message: 'Rate card item not found' });
    }

    res.status(200).json({ message: 'Rate card item deleted successfully' });
  } catch (error) {
    console.error('Error deleting rate card:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
