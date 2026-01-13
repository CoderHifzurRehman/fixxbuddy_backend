const mongoose = require('mongoose');
const Quotation = require('../models/quotation.model');
const RateCard = require('../models/rateCard.model');
const { getIO } = require('../socket');

// Create a new quotation
exports.createQuotation = async (req, res) => {
  try {
    const { partnerId, userId, applicationTypeId, items, orderId } = req.body;
    console.log('[DEBUG] createQuotation req.body:', JSON.stringify(req.body, null, 2));

    if (!partnerId || !userId || !items || !Array.isArray(items) || items.length === 0) {
      console.log('[ERROR] CreateQuotation: Missing or invalid fields', { partnerId: !partnerId, userId: !userId, itemsValid: (items && Array.isArray(items) && items.length > 0) });
      return res.status(400).json({ message: 'Invalid request data', received: req.body });
    }

    // items: [{ rateCardId, quantity }]
    const rateCardIds = items.map(item => item.itemId);
    const rateCards = await RateCard.find({ _id: { $in: rateCardIds } });
    
    // Create a map for easy lookup
    const rateCardMap = {};
    rateCards.forEach(rc => {
      rateCardMap[rc._id.toString()] = rc;
    });

    let totalAmount = 0;
    const quotationItems = [];

    for (const item of items) {
      const rateCard = rateCardMap[item.itemId];
      if (!rateCard) {
        return res.status(404).json({ message: `Rate card item not found: ${item.itemId}` });
      }

      const quantity = item.quantity || 1;
      const itemTotal = rateCard.price * quantity;
      
      quotationItems.push({
        rateCardId: rateCard._id,
        name: rateCard.name,
        price: rateCard.price,
        quantity: quantity,
        total: itemTotal
      });

      totalAmount += itemTotal;
    }

    const newQuotation = new Quotation({
      partnerId,
      userId,
      applicationTypeId,
      orderId,
      items: quotationItems,
      totalAmount,
      status: 'Generated'
    });

    const savedQuotation = await newQuotation.save();
    res.status(201).json(savedQuotation);

  } catch (error) {
    console.error('Error creating quotation:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Get quotation by ID
exports.getQuotationById = async (req, res) => {
  try {
    const { id } = req.params;
    const quotation = await Quotation.findById(id)
      .populate('partnerId', 'firstName lastName email contactNumber')
      .populate('userId', 'firstName lastName email contactNumber')
      .populate('applicationTypeId', 'serviceName');

    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    res.status(200).json(quotation);
  } catch (error) {
    console.error('Error fetching quotation:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Get quotations by Partner
exports.getQuotationsByPartner = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const quotations = await Quotation.find({ partnerId })
      .populate('userId', 'firstName lastName') // Just basic info
      .populate('applicationTypeId', 'serviceName')
      .sort({ createdAt: -1 });

    res.status(200).json(quotations);
  } catch (error) {
    console.error('Error fetching quotations:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Get quotations for a User (Optional util)
exports.getQuotationsByUser = async (req, res) => {
  console.log('getQuotationsByUser');
  try {
    const { userId } = req.params;
    const quotations = await Quotation.find({ userId })
      .populate('partnerId', 'firstName lastName')
      .populate('applicationTypeId', 'serviceName')
      .sort({ createdAt: -1 });

    res.status(200).json(quotations);
  } catch (error) {
    console.error('Error fetching user quotations:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Update a quotation
exports.updateQuotation = async (req, res) => {
  try {
    const { id } = req.params;
    const { items, status, orderId } = req.body; // Allow updating items, status and orderId

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    if (status) {
      quotation.status = status;
    }

    if (orderId) {
      quotation.orderId = orderId;
    }

    if (items && Array.isArray(items)) {
       // Logic to fetch rates and recalc
       const rateCardIds = items.map(item => item.itemId);
       const rateCards = await RateCard.find({ _id: { $in: rateCardIds } });
       
       const rateCardMap = {};
       rateCards.forEach(rc => {
         rateCardMap[rc._id.toString()] = rc;
       });

       let totalAmount = 0;
       const quotationItems = [];

       for (const item of items) {
         const rateCard = rateCardMap[item.itemId];
         if (!rateCard) {
           return res.status(404).json({ message: `Rate card item not found: ${item.itemId}` });
         }

         const quantity = item.quantity || 1;
         const itemTotal = rateCard.price * quantity;
         
         quotationItems.push({
           rateCardId: rateCard._id,
           name: rateCard.name,
           price: rateCard.price,
           quantity: quantity,
           total: itemTotal
         });

         totalAmount += itemTotal;
       }

       quotation.items = quotationItems;
       quotation.totalAmount = totalAmount;
    }

    const updatedQuotation = await quotation.save();
    res.status(200).json(updatedQuotation);

  } catch (error) {
    console.error('Error updating quotation:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Accept a quotation
exports.acceptQuotation = async (req, res) => {
  try {
    const { id } = req.params;
    const quotation = await Quotation.findById(id);

    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    quotation.status = 'Accepted';
    await quotation.save();

    // If there is an associated orderId (Cart _id or custom orderId), update tracking
    if (quotation.orderId) {
       // We need to find by task/cart _id or orderId
       const Cart = require('../models/cart.model');
       // Try both since orderId might be the custom string or the _id
       // We use a safe query to avoid "Cast to ObjectId failed" errors
       const query = mongoose.isValidObjectId(quotation.orderId)
         ? { $or: [{ _id: quotation.orderId }, { orderId: quotation.orderId }] }
         : { orderId: quotation.orderId };
       
       const cart = await Cart.findOne(query);
       
       if (cart) {
         cart.tracking.push({
           message: 'Quotation accepted by customer',
           status: cart.status, // Keep current cart status
           date: new Date()
         });
         await cart.save();
       }
    }

    // Emit socket event to partner
    try {
      const io = getIO();
      io.to(`partner-${quotation.partnerId}`).emit('quotation-response', {
        partnerId: quotation.partnerId,
        quotationId: quotation._id,
        orderId: quotation.orderId,
        status: 'Accepted',
        message: 'Your quotation has been accepted by the customer!'
      });
    } catch (socketError) {
      console.error('[SOCKET] Error emitting quotation-response:', socketError);
    }

    res.status(200).json({ success: true, message: 'Quotation accepted', quotation });
  } catch (error) {
    console.error('Error accepting quotation:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Reject a quotation
exports.rejectQuotation = async (req, res) => {
  try {
    const { id } = req.params;
    const quotation = await Quotation.findById(id);

    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    quotation.status = 'Rejected';
    await quotation.save();

    if (quotation.orderId) {
      const Cart = require('../models/cart.model');
      const query = mongoose.isValidObjectId(quotation.orderId)
        ? { $or: [{ _id: quotation.orderId }, { orderId: quotation.orderId }] }
        : { orderId: quotation.orderId };

      const cart = await Cart.findOne(query);
      
      if (cart) {
        cart.tracking.push({
          message: 'Quotation rejected by customer',
          status: cart.status,
          date: new Date()
        });
        await cart.save();
      }
    }

    // Emit socket event to partner
    try {
      const io = getIO();
      io.to(`partner-${quotation.partnerId}`).emit('quotation-response', {
        partnerId: quotation.partnerId,
        quotationId: quotation._id,
        orderId: quotation.orderId,
        status: 'Rejected',
        message: 'Your quotation has been rejected by the customer.'
      });
    } catch (socketError) {
      console.error('[SOCKET] Error emitting quotation-response:', socketError);
    }

    res.status(200).json({ success: true, message: 'Quotation rejected', quotation });
  } catch (error) {
    console.error('Error rejecting quotation:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
