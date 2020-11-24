# Acmer
ACME/Letsencrypt event-based manager for DNS01 challenge using MongoDB

## Installation
`npm install --save @eyzi/acmer`

## Usage
```
const Acmer = require("@eyzi/acmer")

const testAcmer = new Acmer(AcmerOptions)
```

## Options

### name {String} (Required)
Used as the unique id in cert folder and database.

### email {String} (Required)
Email of Acme account. Used as maintainer and subscriber email.

### domains {String} (Required)
List of domains for this certificate.

### certDir {String} (Required)
Directory of certificates. This is where the private and fullchain keys will be read or saved.

### dbInfo {Object} (Required)
Info to connect to mongodb.
- host `{String}`, (Defaults to `localhost`)
- port `{String}`, (Defaults to `27017`)
- name `{String}`, Database name where the collections will be saved (Required)
- auth `{String}`, Auth source
- user `{String}`
- pass `{String}`
- connectionString `{String}`, optional full connection string override

### production
If `true`, environment directory is set to `https://acme-v02.api.letsencrypt.org/directory`. Otherwise, it's set to `https://acme-staging-v02.api.letsencrypt.org/directory`. (Defaults to `false`)

### customEnvDirectory
Environment directory override. (Defaults to `null`)

### renewalDays
Number of days prior to expiration date to renew certificate. (Defaults to `30`)

### checkInterval
Number of milliseconds to check certificates for renewal. (Defaults to 1 day)

### noAutoStart
If `true`, Acmer will not start check intervals after initialization.

## Methods

### start
Start check intervals.

### testPlugin
Test a domain with `acme-dns-01-test`. Returns a promise that resolves to `PASS` if successful.
- domain `{String}`

## Events

### info
- message `{String}`

### update
Emitted when the certificate has been updated

### error
- message `{String}`