const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const applicationTypeSchema = new mongoose.Schema(
  {
    mainServiceCategoriesId:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "MainservicesCategories"
    },
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

const ApplicationType = mongoose.model('applicationType', applicationTypeSchema);

module.exports = ApplicationType;