const mongoose = require('mongoose');

let AccountSchema = new mongoose.Schema({
	name: String,
	domains: [String],
	email: String,
	key: mongoose.Schema.Types.Mixed
},{
	timestamp: true,
	versionKey: false,
	strict: false
});

module.exports = mongoose.model('acmeAccount', AccountSchema, 'acmeAccount');