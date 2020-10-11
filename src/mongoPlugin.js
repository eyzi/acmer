'use strict';

const Record = require("./recordSchema");

module.exports.create = function (options) {

    let m = {};

    m.init = async function ({ request }) {
        // (optional) initialize your module
        m.request = request;
        return null;
    }

    m.zones = async function ({ dnsHosts }) {
        // return a list of "Zones" or "Apex Domains" (i.e. example.com, NOT foo.example.com)
        return dnsHosts;
    }

    m.set = async function ({ challenge }) {
        // set a TXT record for dnsHost with keyAuthorizationDigest as the value
        let host = challenge.dnsHost || `${challenge.dnsPrefix}.${challenge.dnsZone}`;

        let record = new Record({
          name: host,
          type: 'TXT',
          data: challenge.dnsAuthorization
        });

        await record.save().catch(console.error);

        return null;
    }

    m.get = async function ({ challenge }) {
        // check that the EXACT a TXT record that was set, exists, and return it
        let record = await Record.findOne({
          name: challenge.identifier.value,
          type: 'TXT',
          data: challenge.dnsAuthorization
        });

        return !!record ? { dnsAuthorization: record.data } : null;
    }

    m.remove = async function ({ challenge }) {
        // remove the exact TXT record that was set
        let host = challenge.dnsHost || `${challenge.dnsPrefix}.${challenge.dnsZone}`;

        await Record.deleteOne({
          name: host,
          type: 'TXT',
          data: challenge.dnsAuthorization
        });

        return null;
    }

    m.propagationDelay = 5000;

    return m;
}
