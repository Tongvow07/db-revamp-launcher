// Builds the AIR engine: air\bundle\DB Revamped.exe with its own AIR runtime, which the installer
// copies to {app}\air and the launcher (launcher-assets\ui.js) starts instead of flashplayer.exe.
//
// Needs the HARMAN AIR SDK (AIR_SDK_HOME, default C:\DungeonBlitzLab\airsdk\AIRSDK_51.4.1) and a
// signing certificate (AIR_CERT_DIR, default C:\DungeonBlitzLab\air-cert: dbrevamped.p12 and its
// password in storepass.txt; neither belongs in git). Missing, the certificate is made, self-signed.
//
//   node air\build.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const SDK = process.env.AIR_SDK_HOME || 'C:\\DungeonBlitzLab\\airsdk\\AIRSDK_51.4.1';
const CERT_DIR = process.env.AIR_CERT_DIR || 'C:\\DungeonBlitzLab\\air-cert';
const CERT = path.join(CERT_DIR, 'dbrevamped.p12');
const PASS_FILE = path.join(CERT_DIR, 'storepass.txt');

function bat(name, args) {
    // A .bat runs through cmd.exe, which splits unquoted arguments at spaces.
    const quoted = args.map((arg) => (/[\s&()^|<>]/.test(arg) ? `"${arg}"` : arg));
    execFileSync('cmd.exe', ['/d', '/s', '/c', `"${path.join(SDK, 'bin', name)}" ${quoted.join(' ')}`], {
        stdio: 'inherit',
        windowsVerbatimArguments: true
    });
}

if (!fs.existsSync(path.join(SDK, 'bin', 'adt.bat'))) {
    throw new Error(`No AIR SDK at ${SDK}; set AIR_SDK_HOME.`);
}
if (!fs.existsSync(CERT)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
    fs.writeFileSync(PASS_FILE, require('crypto').randomBytes(18).toString('base64url'));
    bat('adt.bat', ['-certificate', '-cn', 'DBRevamped', '2048-RSA', CERT, fs.readFileSync(PASS_FILE, 'utf8').trim()]);
}

fs.mkdirSync(path.join(HERE, 'build'), { recursive: true });
bat('amxmlc.bat', ['-output', path.join(HERE, 'build', 'DBRevampedAir.swf'), path.join(HERE, 'src', 'DBRevampedAir.as')]);

const bundle = path.join(HERE, 'bundle');
fs.rmSync(bundle, { recursive: true, force: true });
bat('adt.bat', [
    '-package', '-storetype', 'pkcs12', '-keystore', CERT,
    '-storepass', fs.readFileSync(PASS_FILE, 'utf8').trim(),
    '-target', 'bundle', bundle, path.join(HERE, 'DBRevampedAir-app.xml'),
    '-C', path.join(HERE, 'build'), 'DBRevampedAir.swf',
    // The window, taskbar and exe icons (made by installer\make-icon.ps1).
    '-C', HERE, 'icons'
]);
if (!fs.existsSync(path.join(bundle, 'DB Revamped.exe'))) {
    throw new Error('adt produced no DB Revamped.exe');
}
console.log(`AIR engine built: ${bundle}`);

// 1.5.5: game slots 2-4, so several games can run at once (AIR runs one copy per application ID).
// Each slot is the same app packaged and signed with the ID org.dbrevamped.game<n>; the descriptor is
// signed, so the ID cannot be edited afterwards (AIR refuses it). Only the files that differ from
// slot 1 are kept, in air\instances\<n>; the launcher lays them over a copy of {app}\air.
const crypto = require('crypto');
const hashOf = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function filesUnder(dir, base = dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) filesUnder(full, base, out);
        else out.push(path.relative(base, full));
    }
    return out;
}
const instances = path.join(HERE, 'instances');
fs.rmSync(instances, { recursive: true, force: true });
const scratch = path.join(HERE, 'build', 'instances');
for (const slot of [2, 3, 4]) {
    const xml = fs.readFileSync(path.join(HERE, 'DBRevampedAir-app.xml'), 'utf8')
        .replace(/<id>([^<]+)<\/id>/, (m, id) => `<id>${id}${slot}</id>`);
    const dir = path.join(scratch, String(slot));
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const descriptor = path.join(scratch, `app-${slot}.xml`);
    fs.writeFileSync(descriptor, xml);
    bat('adt.bat', [
        '-package', '-storetype', 'pkcs12', '-keystore', CERT,
        '-storepass', fs.readFileSync(PASS_FILE, 'utf8').trim(),
        '-target', 'bundle', dir, descriptor,
        '-C', path.join(HERE, 'build'), 'DBRevampedAir.swf',
        '-C', HERE, 'icons'
    ]);
    const changed = filesUnder(dir).filter((rel) => {
        const main = path.join(bundle, rel);
        return !fs.existsSync(main) || hashOf(main) !== hashOf(path.join(dir, rel));
    });
    if (!changed.some((rel) => /application\.xml$/i.test(rel))) throw new Error(`slot ${slot}: its descriptor did not change`);
    for (const rel of changed) {
        fs.mkdirSync(path.dirname(path.join(instances, String(slot), rel)), { recursive: true });
        fs.copyFileSync(path.join(dir, rel), path.join(instances, String(slot), rel));
    }
    console.log(`Game slot ${slot}: ${changed.length} files differ (${changed.join(', ')})`);
}
fs.rmSync(scratch, { recursive: true, force: true });
