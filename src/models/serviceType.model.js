const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const serviceTypeSchema = new mongoose.Schema(
  {
    applicationTypeId:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApplicationType"
    },
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
    serviceCost: {
        type: String,
        trim: true,
        default:''
    },
    serviceDetails: {
        type: String,
        trim: true,
        default:''
    },   
    serviceVideoLink: {
        type: String,
        trim: true,
        default:''
    },   
    isActive: {
      type:Boolean,
      default:true,
    },
    serviceImage:{
      type:[String],
      default:"",
    },
  },
  {
    timestamps: true,
  }
);

const ServiceType = mongoose.model('serviceType', serviceTypeSchema);

module.exports = ServiceType;