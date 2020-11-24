const mongoose = require('mongoose');

let RecordSchema = new mongoose.Schema({
	name: String,
	type: String,
	data: mongoose.Schema.Types.Mixed,
	ttl: {
		type: String,
		default: '14400'
	}
},{
	timestamp: true,
	versionKey: false,
	strict: false
});

module.exports = mongoose.model('dns', RecordSchema, 'dns');