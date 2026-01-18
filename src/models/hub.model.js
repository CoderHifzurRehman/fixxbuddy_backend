const mongoose = require('mongoose');

const hubSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true 
  },
  pincodes: [{ 
    type: String, 
    index: true 
  }],
  managerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'user',
    default: null 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { timestamps: true });

// Ensure pincodes are unique across ALL hubs to prevent mapping conflicts
hubSchema.pre('save', async function(next) {
  if (this.isModified('pincodes')) {
    const Hub = mongoose.model('Hub');
    const existing = await Hub.findOne({ 
      pincodes: { $in: this.pincodes },
      _id: { $ne: this._id }
    });
    if (existing) {
      next(new Error(`Pincode(s) already assigned to hub: ${existing.name}`));
    }
  }
  next();
});

const Hub = mongoose.model('Hub', hubSchema);

module.exports = Hub;
