const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
   
    category: {
      type: String,
      required: [true, 'Category is required'],
      index: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    contact_email: {
      type: String,
      required: [true, 'Contact email is required'],
      lowercase: true,
      trim: true,
    },
    contact_phone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending', 'approved'],
      default: 'pending',
    },
    posted_by: {
     
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
      
    },
    logo: { type: String, default: "" },
    banner: { type: String, default: "" },

  },
  {
    // Automatically adds createdAt and updatedAt fields
    timestamps: true,
  }
);

module.exports = mongoose.model('Business', businessSchema);