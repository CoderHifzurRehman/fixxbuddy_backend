const mongoose = require('mongoose');

const expertiseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    mappedServices: [
      {
        mainServiceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'mainservice',
          default: null
        },
        categoryId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'mainservicecategories',
          default: null
        },
        applicationTypeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'applicationType',
          default: null
        },
        serviceName: {
          type: String,
          required: true
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

const Expertise = mongoose.model('Expertise', expertiseSchema);

module.exports = Expertise;
