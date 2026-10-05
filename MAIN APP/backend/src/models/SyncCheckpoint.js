const mongoose = require('mongoose');
const checkpointSchema = new mongoose.Schema({ name: { type: String, unique: true, required: true }, blockNumber: { type: Number, required: true, default: 0 } }, { timestamps: true });
module.exports = mongoose.models.SyncCheckpoint || mongoose.model('SyncCheckpoint', checkpointSchema);
