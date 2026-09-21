const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mainservice',
      },
    ],
    areas: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hub',
      },
    ],
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'partner',
      default: null,
    },
    teamLeaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'partner',
      default: null,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'partner',
      },
    ],
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate team code if not provided
teamSchema.pre('save', async function (next) {
  if (this.isNew && !this.code) {
    try {
      const count = await mongoose.model('Team').countDocuments();
      this.code = `TM_${String(count + 1).padStart(4, '0')}`;
    } catch (err) {
      this.code = `TM_${Date.now().toString().slice(-4)}`;
    }
  }
  next();
});

const Team = mongoose.model('Team', teamSchema);

module.exports = Team;
