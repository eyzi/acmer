"use strict"

require('dotenv').config()

const { resolve } = require("path")
const Acmer = require("..")

let testAcmer = new Acmer({
	name: process.env.NAME,
	email: process.env.EMAIL,
	domains: process.env.DOMAINS.split(","),
	certDir: resolve(__dirname, "certs"),
	dbInfo: {
		host: process.env.DB_HOST,
		port: process.env.DB_PORT,
		name: process.env.DB_NAME,
		user: process.env.DB_USER,
		pass: process.env.DB_PASS,
		auth: process.env.DB_AUTH
	},
	noAutoStart: true
})
testAcmer.on("info", console.log)
testAcmer.on("error", console.error)
testAcmer.start()