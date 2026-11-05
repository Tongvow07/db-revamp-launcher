// Builds the Linux download on Windows: dist\DB Revamped for Linux <version>.tar.gz, holding the AIR
// engine as a Linux captive-runtime app (x86-64) and "Install DB Revamped.sh".
//
// adt only packages a Linux app on Linux, so the app is put together here from the same pieces adt
// would use: the HARMAN SDK's Linux launcher (runtimes\air\linux\Adobe AIR\Versions\1.0\Resources\
// captiveappentry) as "DB Revamped", its Linux runtime as "Adobe AIR", and the app's files (with
// their AIR signature, from the Windows bundle of the same app). The tar keeps the Unix modes, which
// Windows cannot hold on disk.
//
// Started without a game URL, the app opens the live game (src\DBRevampedAir.as LIVE_GAME), which
// signs in on its own login screen, as on the Mac.
//
//   node air\build-linux.js      (after node air\build.js)
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const HERE = __dirname;
const REPO = path.dirname(HERE);
const SDK = process.env.AIR_SDK_HOME || 'C:\\DungeonBlitzLab\\airsdk\\AIRSDK_51.4.1';
const RUNTIME = path.join(SDK, 'runtimes', 'air', 'linux', 'Adobe AIR');
const ENTRY = path.join(RUNTIME, 'Versions', '1.0', 'Resources', 'captiveappentry');
const BUNDLE = path.join(HERE, 'bundle');
const APP = 'DB Revamped';
const VERSION = fs.readFileSync(path.join(HERE, 'DBRevampedAir-app.xml'), 'utf8').match(/<versionNumber>([^<]+)</)[1];
const TOP = 'DB Revamped';

const INSTALL_SCRIPT = `#!/bin/sh
# Installs DB Revamped for this user: copies the game to ~/.local/share and adds it to the app menu.
set -e
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEST="\${XDG_DATA_HOME:-$HOME/.local/share}/db-revamped"
APPS="\${XDG_DATA_HOME:-$HOME/.local/share}/applications"

if [ "$(uname -m)" != "x86_64" ]; then
  echo "DB Revamped for Linux needs a 64-bit Intel or AMD computer (this one is $(uname -m))."
  exit 1
fi

MISSING=$(ldd "$HERE/Adobe AIR/Versions/1.0/libCore.so" 2>/dev/null | awk '/not found/ {print $1}' | grep -v -E '^lib(curl|ssl|crypto)' || true)
if [ -n "$MISSING" ]; then
  echo "Some system libraries are missing:"
  echo "$MISSING" | sed 's/^/  /'
  echo
  echo "Ubuntu or Debian:  sudo apt install libgtk-3-0 libnss3 libgl1 libxcursor1"
  echo "Fedora:            sudo dnf install gtk3 nss mesa-libGL libXcursor"
  echo "Arch:              sudo pacman -S gtk3 nss libglvnd libxcursor"
  echo
  echo "Install them, then run this again."
  exit 1
fi

mkdir -p "$DEST" "$APPS"
cp -R "$HERE/." "$DEST/"
chmod +x "$DEST/DB Revamped"
cat > "$APPS/db-revamped.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=DB Revamped
Comment=Free, non-commercial fan project
Exec="$DEST/DB Revamped"
Path=$DEST
Icon=$DEST/icons/icon256.png
Terminal=false
Categories=Game;
DESKTOP
echo "DB Revamped is installed. Open it from your app menu, or run:"
echo "  \\"$DEST/DB Revamped\\""
`;

const README = `DB Revamped for Linux ${VERSION} (64-bit Intel or AMD)

1. Unpack this folder.
2. Open a terminal in it and run:  sh "Install DB Revamped.sh"
3. Open DB Revamped from your app menu.

Create your account first at https://dbrevamped.com/register
then log in on the game's own screen.

DB Revamped is a free, non-commercial fan project. It is not affiliated with or endorsed by the
creators or rights holders of Dungeon Blitz.
`;

// One tar entry per file; USTAR splits a long path across its name and prefix fields.
function tarHeader(name, size, mode, mtime) {
    const header = Buffer.alloc(512);
    let prefix = '';
    let short = name;
    if (Buffer.byteLength(name) > 100) {
        const cut = name.indexOf('/', name.length - 100);
        if (cut < 0 || cut > 155) {
            throw new Error(`path too long for a tar header: ${name}`);
        }
        prefix = name.slice(0, cut);
        short = name.slice(cut + 1);
    }
    const octal = (value, length) => value.toString(8).padStart(length - 1, '0') + '\0';
    header.write(short, 0);
    header.write(octal(mode, 8), 100);
    header.write(octal(0, 8), 108);
    header.write(octal(0, 8), 116);
    header.write(octal(size, 12), 124);
    header.write(octal(mtime, 12), 136);
    header.write('        ', 148);
    header.write('0', 156);
    header.write('ustar\0' + '00', 257);
    header.write(prefix, 345);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    return header;
}

const entries = [];
const add = (name, data, mode) => entries.push({ name: `${TOP}/${name}`, data, mode });
function addTree(source, target, skip = () => false) {
    for (const item of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, item.name);
        const to = `${target}${item.name}`;
        if (skip(to)) continue;
        if (item.isDirectory()) {
            addTree(from, `${to}/`, skip);
        } else {
            add(to, fs.readFileSync(from), /\.so(\.|$)/.test(item.name) ? 0o755 : 0o644);
        }
    }
}

if (!fs.existsSync(path.join(BUNDLE, 'DBRevampedAir.swf'))) {
    throw new Error('Run node air\\build.js first: the signed app files come from air\\bundle.');
}
add(APP, fs.readFileSync(ENTRY), 0o755);
addTree(RUNTIME, 'Adobe AIR/');
addTree(BUNDLE, '', (name) => name === 'Adobe AIR' || name === `${APP}.exe`);
add('Install DB Revamped.sh', Buffer.from(INSTALL_SCRIPT), 0o755);
add('READ ME.txt', Buffer.from(README), 0o644);

const mtime = Math.floor(Date.now() / 1000);
const blocks = [];
for (const entry of entries) {
    blocks.push(tarHeader(entry.name, entry.data.length, entry.mode, mtime), entry.data);
    const pad = (512 - (entry.data.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad));
}
blocks.push(Buffer.alloc(1024));

const out = path.join(REPO, 'dist', `${APP} for Linux ${VERSION}.tar.gz`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, zlib.gzipSync(Buffer.concat(blocks), { level: 9 }));
console.log(`Linux download built: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB, ${entries.length} files)`);
