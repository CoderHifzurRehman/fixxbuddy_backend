const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const mainServicesCategoriesSchema = new mongoose.Schema(
  {
    mainServiceId:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mainservices"
    },
    isModalOpen:{
      type: Boolean,
      default: false,
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

const MainservicesCategories = mongoose.model('mainservicecategories', mainServicesCategoriesSchema);

module.exports = MainservicesCategories;