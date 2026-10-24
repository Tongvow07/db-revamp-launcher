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
