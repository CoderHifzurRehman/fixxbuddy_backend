const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const mainServicesSchema = new mongoose.Schema(
  {
    serviceHeading: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    serviceName: {
      type: String,
      trim: true,
      lowercase: true,
    },
    serviceDescription: {
        type: String,
        trim: true,
        lowercase: true,
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

const Mainservices = mongoose.model('mainservice', mainServicesSchema);

module.exports = Mainservices;