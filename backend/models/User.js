// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true
  },
  hasPublished: {
    type: Boolean,
    default: false
  },
  avatar: {
    type: String,
    default: 'https://ui-avatars.com/api/?name=User&background=9945FF&color=fff&size=128'
  },
  bio: {
    type: String,
    default: '',
    maxlength: 500
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  googleId: { type: String, unique: true, sparse: true }, // EKLEDİK
  twitterId: { type: String, unique: true, sparse: true }, // EKLEDİK
  // password, resetPasswordToken ve resetPasswordExpires KALDIRILDI
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);