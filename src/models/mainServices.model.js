const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const mainServicesSchema = new mongoose.Schema(
  {
    serviceHeading: {
      type: String,
      required: true,
      trim: true,
    },
    serviceName: {
      type: String,
      trim: true,
    },
    serviceDescription: {
        type: String,
        trim: true,
        default:''
      },     
    isActive: {
      type:Boolean,
      default:true,
    },
    serviceImage:{
      type:String,
      default:"",
    },
  },
  {
    timestamps: true,
  }
);

// Add to your existing model
mainServicesSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

mainServicesSchema.statics.findByName = function(name) {
  return this.findOne({ serviceName: name, isActive: true });
};

mainServicesSchema.virtual('categories', {
  ref: 'mainservicecategories',
  localField: '_id',
  foreignField: 'mainServiceId',
  justOne: false
});

const Mainservices = mongoose.model('mainservice', mainServicesSchema);

module.exports = Mainservices;