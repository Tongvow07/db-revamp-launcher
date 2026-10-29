// Builds the Mac download on Windows: dist\DB Revamped for Mac <version>.zip, holding
// "DB Revamped.app" (the AIR engine as a macOS captive-runtime app) and "Install DB Revamped.command".
//
// adt only packages a Mac app on a Mac, so the .app is put together here from the same pieces adt
// would use: the HARMAN SDK's universal (Intel + Apple Silicon) captive launcher lib\nai\lib\
// CaptiveAppEntry as Contents/MacOS, its Mac runtime runtimes\air-captive\mac as Contents/
// Frameworks, and the app's files (with their AIR signature, from a Windows bundle of the same app)
// as Contents/Resources. The zip keeps the Unix modes and the framework's symlinks, which Windows
// cannot hold on disk (the SDK's copies of them are small text files naming their target).
//
// The app is not notarized (that needs an Apple developer account and a Mac). The install script
// copies it to Applications, clears the download quarantine and signs it ad hoc on the player's Mac,
// which Apple Silicon needs before it will run changed code.
//
// Started without a game URL, the app opens the live game (src\DBRevampedAir.as LIVE_GAME), which
// signs in on its own login screen.
//
//   node air\build-mac.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const REPO = path.dirname(HERE);
const SDK = process.env.AIR_SDK_HOME || 'C:\\DungeonBlitzLab\\airsdk\\AIRSDK_51.4.1';
const CERT_DIR = process.env.AIR_CERT_DIR || 'C:\\DungeonBlitzLab\\air-cert';
const CERT = path.join(CERT_DIR, 'dbrevamped.p12');
const PASS_FILE = path.join(CERT_DIR, 'storepass.txt');
const APP = 'DB Revamped';
const BUNDLE_ID = 'org.dbrevamped.game';

function bat(name, args) {
    const quoted = args.map((arg) => (/[\s&()^|<>]/.test(arg) ? `"${arg}"` : arg));
    execFileSync('cmd.exe', ['/d', '/s', '/c', `"${path.join(SDK, 'bin', name)}" ${quoted.join(' ')}`], {
        stdio: 'inherit',
        windowsVerbatimArguments: true
    });
}

const appXml = fs.readFileSync(path.join(HERE, 'DBRevampedAir-app.xml'), 'utf8');
const VERSION = (appXml.match(/<versionNumber>([^<]+)<\/versionNumber>/) || [])[1] || '1.0.0';

// 1. The app's SWF and its signed files, by way of a Windows bundle in a scratch folder.
if (!fs.existsSync(CERT)) {
    throw new Error(`No signing certificate at ${CERT}; run node air\\build.js once first.`);
}
const work = path.join(HERE, 'build-mac');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(path.join(HERE, 'build'), { recursive: true });
bat('amxmlc.bat', ['-output', path.join(HERE, 'build', 'DBRevampedAir.swf'), path.join(HERE, 'src', 'DBRevampedAir.as')]);
const winBundle = path.join(work, 'win-bundle');
bat('adt.bat', [
    '-package', '-storetype', 'pkcs12', '-keystore', CERT,
    '-storepass', fs.readFileSync(PASS_FILE, 'utf8').trim(),
    '-target', 'bundle', winBundle, path.join(HERE, 'DBRevampedAir-app.xml'),
    '-C', path.join(HERE, 'build'), 'DBRevampedAir.swf',
    '-C', HERE, 'icons'
]);

// 2. The .app, as a list of zip entries: [path in zip, Buffer | {link: target}, mode].
const entries = [];
const root = `${APP}.app/Contents`;
function addFile(zipPath, data, mode) {
    entries.push({ name: zipPath, data, mode });
}
function addTree(dir, zipDir, modeOf) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const zipPath = `${zipDir}/${name}`;
        if (fs.statSync(full).isDirectory()) {
            entries.push({ name: zipPath + '/', dir: true });
            addTree(full, zipPath, modeOf);
        } else {
            addFile(zipPath, fs.readFileSync(full), modeOf(zipPath));
        }
    }
}

entries.push({ name: `${APP}.app/`, dir: true }, { name: `${root}/`, dir: true });
addFile(`${root}/Info.plist`, Buffer.from(infoPlist()), 0o644);
addFile(`${root}/PkgInfo`, Buffer.from('APPL????'), 0o644);
entries.push({ name: `${root}/MacOS/`, dir: true });
addFile(`${root}/MacOS/${APP}`, fs.readFileSync(path.join(SDK, 'lib', 'nai', 'lib', 'CaptiveAppEntry')), 0o755);

// The framework: its three symlinks come back as links, its binary stays executable.
const framework = path.join(SDK, 'runtimes', 'air-captive', 'mac', 'Adobe AIR.framework');
const LINKS = {
    'Adobe AIR.framework/Adobe AIR': 'Versions/Current/Adobe AIR',
    'Adobe AIR.framework/Resources': 'Versions/Current/Resources',
    'Adobe AIR.framework/Versions/Current': '1.0'
};
entries.push({ name: `${root}/Frameworks/`, dir: true });
(function walk(dir, rel) {
    entries.push({ name: `${root}/Frameworks/${rel}/`, dir: true });
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const relPath = `${rel}/${name}`;
        if (LINKS[relPath]) {
            const onDisk = fs.readFileSync(full, 'utf8').trim();
            if (onDisk !== LINKS[relPath]) {
                throw new Error(`${relPath} names ${onDisk}, expected ${LINKS[relPath]}`);
            }
            entries.push({ name: `${root}/Frameworks/${relPath}`, link: LINKS[relPath] });
        } else if (fs.statSync(full).isDirectory()) {
            walk(full, relPath);
        } else {
            const exec = relPath === 'Adobe AIR.framework/Versions/1.0/Adobe AIR' || /\/MacOS\/[^/]+$/.test(relPath);
            addFile(`${root}/Frameworks/${relPath}`, fs.readFileSync(full), exec ? 0o755 : 0o644);
        }
    }
})(framework, 'Adobe AIR.framework');

// The app's own files, exactly as signed for the Windows bundle (its runtime folder stays behind).
entries.push({ name: `${root}/Resources/`, dir: true });
for (const name of fs.readdirSync(winBundle)) {
    if (name === 'Adobe AIR' || /\.exe$/i.test(name)) {
        continue;
    }
    const full = path.join(winBundle, name);
    if (fs.statSync(full).isDirectory()) {
        entries.push({ name: `${root}/Resources/${name}/`, dir: true });
        addTree(full, `${root}/Resources/${name}`, () => 0o644);
    } else {
        addFile(`${root}/Resources/${name}`, fs.readFileSync(full), 0o644);
    }
}
addFile(`${root}/Resources/${APP}.icns`, icns(), 0o644);

// 3. The installer script and a short read-me beside the app.
addFile('Install DB Revamped.command', Buffer.from(installScript()), 0o755);
addFile('READ ME.txt', Buffer.from(readMe()), 0o644);

const dist = path.join(REPO, 'dist');
fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, `${APP} for Mac ${VERSION}.zip`);
fs.writeFileSync(out, zip(entries));
fs.rmSync(work, { recursive: true, force: true });
console.log(`Mac download built: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);

// ---- pieces ------------------------------------------------------------------------------

function infoPlist() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>English</string>
	<key>CFBundleExecutable</key>
	<string>${APP}</string>
	<key>CFBundleIconFile</key>
	<string>${APP}.icns</string>
	<key>CFBundleIdentifier</key>
	<string>${BUNDLE_ID}</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>${APP}</string>
	<key>CFBundleDisplayName</key>
	<string>${APP}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>${VERSION}</string>
	<key>CFBundleVersion</key>
	<string>${VERSION}</string>
	<key>LSMinimumSystemVersion</key>
	<string>10.13</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsArbitraryLoads</key>
		<true/>
	</dict>
</dict>
</plist>
`;
}

/** An .icns of the app's PNG icons (ic07 128 px, ic08 256 px: PNG data is allowed in both). */
function icns() {
    const parts = [['ic07', 'icon128.png'], ['ic08', 'icon256.png']].map(([type, file]) => {
        const png = fs.readFileSync(path.join(HERE, 'icons', file));
        const head = Buffer.alloc(8);
        head.write(type, 0, 'ascii');
        head.writeUInt32BE(png.length + 8, 4);
        return Buffer.concat([head, png]);
    });
    const body = Buffer.concat(parts);
    const head = Buffer.alloc(8);
    head.write('icns', 0, 'ascii');
    head.writeUInt32BE(body.length + 8, 4);
    return Buffer.concat([head, body]);
}

function installScript() {
    return `#!/bin/bash
# Installs DB Revamped: copies the app to Applications, clears the download quarantine and signs it
# for this Mac (it is not notarized), then opens it.
cd "$(dirname "$0")"
APP="${APP}.app"
if [ ! -d "$APP" ]; then
  echo "Put this script next to $APP and run it again."; read -n 1 -s -r -p "Press any key to close."; exit 1
fi
DEST="/Applications"
[ -w "$DEST" ] || DEST="$HOME/Applications"
mkdir -p "$DEST"
echo "Installing $APP to $DEST ..."
rm -rf "$DEST/$APP"
cp -R "$APP" "$DEST/"
xattr -cr "$DEST/$APP"
codesign --force --deep --sign - "$DEST/$APP" >/dev/null 2>&1 || echo "(could not sign the app; it may still open)"
echo "Done. Starting DB Revamped..."
open "$DEST/$APP"
`;
}

function readMe() {
    return `DB Revamped for Mac ${VERSION}

1. Double-click "Install DB Revamped.command".
   If macOS says it cannot be opened: right-click it, choose Open, then Open again.
2. DB Revamped is installed in Applications and opens. Sign in on the game's login screen.

Afterwards, start it from Applications or Launchpad like any other app.
Works on Intel and Apple Silicon Macs (macOS 10.13 or newer).
`;
}

// ---- a zip with Unix modes and symlinks ---------------------------------------------------

function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xff;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function zip(list) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const e of list) {
        const name = Buffer.from(e.name, 'utf8');
        let data = Buffer.alloc(0);
        let mode = 0o40755;
        if (e.link !== undefined) {
            data = Buffer.from(e.link, 'utf8');
            mode = 0o120755;
        } else if (!e.dir) {
            data = e.data;
            mode = 0o100000 | e.mode;
        }
        const crc = crc32(data);
        const packed = e.link === undefined && !e.dir && data.length > 0 ? zlib.deflateRawSync(data, { level: 9 }) : data;
        const method = packed === data ? 0 : 8;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // UTF-8 names
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(0x21, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(packed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, name, packed);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, so the modes count
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0x21, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(packed.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(((mode << 16) | (e.dir ? 0x10 : 0)) >>> 0, 38);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);
        offset += 30 + name.length + packed.length;
    }
    const centralBuf = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(list.length, 8);
    end.writeUInt16LE(list.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralBuf, end]);
}
