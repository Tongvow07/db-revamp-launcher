// The version the Mac and Linux downloads carry: the Windows launcher's (installer\DBRevamped.iss
// AppVersion), so all three downloads show one number. DB_APP_VERSION overrides it.
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const DESCRIPTOR = path.join(HERE, 'DBRevampedAir-app.xml');

function launcherVersion() {
    const iss = fs.readFileSync(path.join(HERE, '..', 'installer', 'DBRevamped.iss'), 'utf8');
    const found = /^#define AppVersion "([^"]+)"/m.exec(iss);
    if (!found) throw new Error('No AppVersion in installer\DBRevamped.iss');
    return found[1];
}

const VERSION = String(process.env.DB_APP_VERSION || launcherVersion()).trim();
// AIR's versionNumber: one to three parts of up to three digits.
if (!/^\d{1,3}(\.\d{1,3}){0,2}$/.test(VERSION)) {
    throw new Error(`"${VERSION}" is not an AIR versionNumber (x.y.z, each up to 999)`);
}

/** A copy of DBRevampedAir-app.xml in dir with this versionNumber; returns its path. */
function writeAppXml(dir) {
    const xml = fs.readFileSync(DESCRIPTOR, 'utf8');
    if (!/<versionNumber>[^<]+<\/versionNumber>/.test(xml)) throw new Error('No versionNumber in DBRevampedAir-app.xml');
    const out = path.join(dir, 'DBRevampedAir-app.xml');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(out, xml.replace(/<versionNumber>[^<]+<\/versionNumber>/, `<versionNumber>${VERSION}</versionNumber>`));
    return out;
}

module.exports = { VERSION, writeAppXml };
