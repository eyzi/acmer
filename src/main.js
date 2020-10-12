"use strict"

const {
	unlinkSync,
	existsSync,
	readFileSync,
	writeFileSync,
	mkdirSync
} = require("fs")
const { resolve } = require("path")
const { EventEmitter } = require("events")
const { Certificate } = require("@fidm/x509")
const pkg = require("../package.json")
const Acme = require("acme")
const punycode = require("punycode")
const mongoose = require("mongoose")
const CSR = require("@root/csr")
const PEM = require("@root/pem")
const Keypairs = require("@root/keypairs")
const AcmeTester = require("acme-dns-01-test")
const mongoPlugin = require("./mongoPlugin")

class Acmer extends EventEmitter {
	constructor(options) {
		super()

		/** Name of account (REQUIRED)
		 * Used both as the unique id in cert folder and database
		 */
		if (!options.name) return null
		this.name = options.name

		/** Email of Acme account (REQUIRED) */
		if (!options.email) return null
		this.email = options.email

		/** List of domains for this certificate (REQUIRED) */
		if (!options.domains || options.domains.length <= 0) return null
		this.domains = options.domains

		/** Directory of certificates (REQUIRED) */
		if (!options.certDir) return null
		this.certDir = options.certDir

		/** DB info (REQUIRED)
		 * Needs either a DB name or connectionString
		 */
		if (
			!options.dbInfo ||
			(!options.dbInfo.connectionString && !options.dbInfo.name)
		) return null
		this.dbInfo = options.dbInfo

		this.customEnvDirectory = options.customEnvDirectory || null
		this.production = options.production || false
		this.renewalDays = options.renewalDays || 30
		this.checkInterval = options.checkInterval || 1000 * 60 * 60 * 24

		if (!options.noAutoStart) this.start()
	}

	start() {
		this.initProperties()
		this.startCheckInterval()
	}

	initProperties() {
		this.emit("info", "Initializing properties")

		this.setupPaths()

		/** Set Environment Directory
		 * options.customEnvDirectory - if set, use custom directory
		 * options.production - if true, use default production directory
		 * if none above is set, use default staging directory
		*/
		this.envDirectory = this.customEnvDirectory
			? this.customEnvDirectory
			: this.production
				? "https://acme-v02.api.letsencrypt.org/directory"
				: "https://acme-staging-v02.api.letsencrypt.org/directory"
		this.emit("info", `Setting environment directory to ${ this.envDirectory }`)

		/** Mongoose setup
		 * options.dbInfo.connectionString - if set, use as connection string
		 * options.dbInfo.user
		 * options.dbInfo.pass
		 * options.dbInfo.host
		 * options.dbInfo.port
		 * options.dbInfo.name
		 * options.dbInfo.auth
		 */
		this.emit("info", `Setting up DB`)
		let dbOptions = {
			useNewUrlParser: true,
			useFindAndModify: false,
			useCreateIndex: true,
			useUnifiedTopology: true
		}
		if (this.dbInfo.connectionString) {
			this.db = mongoose.connect(this.dbInfo.connectionString, dbOptions)
		} else {
			if (!this.dbInfo.host) this.dbInfo.host = "localhost"
			if (!this.dbInfo.port) this.dbInfo.port = "27017"
			if (this.dbInfo.user) dbOptions.user = this.dbInfo.user
			if (this.dbInfo.pass) dbOptions.pass = this.dbInfo.pass
			if (this.dbInfo.auth) dbOptions.auth = { "authSource": this.dbInfo.auth }
			let connectionString  = `mongodb://${ this.dbInfo.host }:${ this.dbInfo.port }/${ this.dbInfo.name }`
			this.db = mongoose.connect(connectionString, dbOptions)
		}
	}

	setupPaths() {
		if (!existsSync(this.certDir)) {
			this.emit("info", `Creating cert directory at ${ this.certDir }`)
			mkdirSync(this.certDir)
		}

		this.certAccountDir = resolve(this.certDir, this.name)
		this.emit("info", `Setting cert account path to ${ this.certAccountDir }`)

		if (!existsSync(this.certAccountDir)) {
			this.emit("info", `Creating cert account directory at ${ this.certAccountDir }`)
			mkdirSync(this.certAccountDir)
		}

		this.privkeyFile = resolve(this.certDir, this.name, "privkey.pem")
		this.emit("info", `Setting privkey path to ${ this.privkeyFile }`)

		this.fullchainFile = resolve(this.certDir, this.name, "fullchain.pem")
		this.emit("info", `Setting fullchain path to ${ this.fullchainFile }`)
	}

	testPlugin(domain) {
		return new Promise((resolve, reject) => {
			AcmeTester.testZone('dns-01', domain, mongoPlugin.create()).then(() => {
				resolve('PASS')
			}).catch(function(e) {
				reject(e)
			});
		})
	}

	async startCheckInterval() {
		this.emit("info", `Starting check interval`)
		this.runCheck()
		setInterval(_ => {
			this.runCheck()
		}, this.checkInterval)
	}

	async runCheck() {
		this.emit("info", `=== ACMER CHECK === Start @ ${ new Date() }`)
		await this.checkCert()
		this.emit("info", `=== ACMER CHECK === End @ ${ new Date() }`)
	}

	catcher(message) {
		this.emit("error", message)
	}

	async checkCert() {
		if (!existsSync(this.privkeyFile)) {
			this.emit("info", `Privkey file not found`)
			return await this.initAcme().catch(this.catcher)
		}

		if (!existsSync(this.fullchainFile)) {
			this.emit("info", `Fullchain file not found`)
			return await this.initAcme().catch(this.catcher)
		}

		// if PEMs are invalid, run initAcme
		let cert = Certificate.fromPEM(readFileSync(this.fullchainFile))
		let notAfter = new Date(cert.validTo)
		let renewPoint = new Date()
		renewPoint.setDate(renewPoint.getDate() + this.renewalDays)

		if (renewPoint > notAfter) {
			this.emit("info", `Due for renewal`)
			this.deletePem()
			return await this.initAcme().catch(this.catcher)
		}

		this.emit("info", `Current certificates seem to be good`)
	}

	deletePem() {
		this.emit("info", `Deleting privkey and fullchain files`)
		unlinkSync(this.privkeyFile)
		unlinkSync(this.fullchainFile)
	}

	async initAcme() {
		await this.createAcmeInstance()

		let accountKey = await this.getAccountKey()

		this.emit("info", `Creating Acme subscriber account`)
		let account = await this.acme.accounts.create({
			subscriberEmail: this.email,
			agreeToTerms: true,
			accountKey: accountKey
		})
		if (!account)
			return this.emit("error", `Could not create Acme subscriber account`)

		this.emit("info", `Checking server keypair`)
		let serverKey, serverPem
		if (existsSync(this.privkeyFile)) {
			this.emit("info", `Using existing server keypair`)
			serverPem = readFileSync(this.privkeyFile, "ascii")
			serverKey = await Keypairs.import({ pem: serverPem })
		} else {
			this.emit("info", `Creating new server keypair`)
			let serverKeypair = await Keypairs.generate({ kty: "RSA", format: "jwk" })
			serverKey = serverKeypair.private
			serverPem = await Keypairs.export({ jwk: serverKey })
		}

		this.emit("info", `Creating CSR`)
		let domains = this.domains.map(domain => punycode.toASCII(domain));
		let encoding = "der";
		let csrDer = await CSR.csr({ jwk: serverKey, domains, encoding }).catch(error => {
			this.emit("error", `Error creating CSR: ${ error }`)
		});
		let csr = PEM.packBlock({ type: "CERTIFICATE REQUEST", bytes: csrDer });

		this.emit("info", "Setting domain validation strategy using mongodb plugin");
		let challenges = {
			'dns-01': mongoPlugin.create()
		};

		this.emit("info", "Get SSL certificate");
		let pems = await this.acme.certificates.create({
			account,
			accountKey,
			csr,
			domains,
			challenges
		});

		this.emit("info", "Saving certificate");
		writeFileSync(this.privkeyFile, serverPem, "ascii");
		writeFileSync(this.fullchainFile, `${ pems.cert }\n${ pems.chain }\n`, "ascii");
	}

	async createAcmeInstance() {
		this.emit("info", `Creating Acme instance`)
		this.acme = Acme.create({
			maintainerEmail: this.email,
			packageAgent: `acmer/${pkg.version}`,
			notify: (event, details) => {
				if (event === "error") this.emit("error", details)
			}
		})

		this.emit("info", `Fetching environment directory`)
		await this.acme.init(this.envDirectory)
	}

	async getAccountKey() {
		this.emit("info", `Getting account key`)

		const Account = require("./accountSchema")

		let acc = await Account.findOne({ name: this.name })
		if (acc && acc.key) {
			this.emit("info", `Found key in database`)
			return acc.key
		}

		this.emit("info", `Generating new keypair`)
		let keypair = await Keypairs.generate({
			kty: "RSA",
			format: "jwk"
		})
		acc = new Account({
			name: this.name,
			key: keypair.private,
			domains: this.domains,
			email: this.email
		})

		this.emit("info", `Saving key to database`)
		await acc.save()

		return acc.key
	}
}

module.exports = Acmer