// models/Drawing.js
const mongoose = require('mongoose');

const drawingSchema = new mongoose.Schema({
  image: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: 'Untitled'
  },
  // creatorUsername ve creatorAvatar alanları kaldırıldı.
  // Bu bilgiler artık userId referansı üzerinden populate edilecek.
  userId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true, 
  },
  tags: {
    type: [String],
    default: []
  },
  likes: [{ 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [{
    userId: { 
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true 
    },
    // username ve userAvatar alanları kaldırıldı.
    // Bu bilgiler artık comments.userId referansı üzerinden populate edilecek.
    text: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Misafir kullanıcılar için eklenen alanlar (eğer projenizde misafir çizim/yorum özelliği varsa tutulmalı)
  guestId: { type: String, default: null }, 
  guestIp: { type: String, default: null } 
});

module.exports = mongoose.model('Drawing', drawingSchema);