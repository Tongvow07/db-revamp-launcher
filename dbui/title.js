// The launcher's title in the game's own lettering. The background (ui.js's BG picture) has a painted
// "DUNGEON BLITZ / REVAMP" on its gold-and-stone plate. This step paints it over:
//   - the old letters go: the plate's own dark stone is rebuilt where they were, from the plate's
//     clean stone round them;
//   - "REVAMP" becomes "REVAMPED" in the painting's own lettering: the painted word is lifted off
//     whole, the E and D it lacks are lifted from the painted "DUNGEON" (same face and finish), the
//     old word is taken out (refilled from the stone and forest round it) and the new one set,
//     centred between the ribbons, with no plate behind it (owner, 2026-11-05);
//   - "DUNGEON BLITZ" is set on the plate in one of three designs (--title 1|2|3; TITLES below), all
//     in the game's own fonts or letters: Berlin Sans FB Demi (the game's event-banner face) in the
//     plate's own gold, the game logo's own letters set tight, or Berlin Sans in the logo's colours.
// The plate's frame, gems, end diamonds, ribbons and the two portraits stay as painted.
//
//   node dbui\title.js [--title N]    write the new BG into launcher-assets\ui.js (the untouched picture
//                                     is kept as launcher-assets\background.orig.jpg, always the source)
//   node dbui\title.js --out x.jpg [--title N]   write the picture to a file instead
//   node dbui\title.js --verify       change nothing; make every design again, check ui.js has one of
//                                     them, and that no bright pixel of the old lettering is left
//
// Draws with Microsoft Edge (headless, its canvas), as dbui/build.js does. Run dbui/build.js first:
// it exports the fonts (dbui/db-title-*.woff, used here only, baked into the picture) and the letters.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const ASSETS = path.join(REPO, 'launcher-assets');
const UI_JS = path.join(ASSETS, 'ui.js');
const ORIGINAL = path.join(ASSETS, 'background.orig.jpg');
const KIT = path.join(ASSETS, 'dbui');
const EDGE = process.env.EDGE_EXE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BG_LINE = /^var BG="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)";\s*$/;

/**
 * Where things are on the 1280 x 690 background (measured off it: dbui/title.js --verify checks the
 * old lettering is gone from these places).
 *   plate     the plate's dark inside: a long hexagon, its top and bottom edges at y 47 and 121,
 *             its pointed ends at x 400 and 880 (row 83)
 *   gap       a column of clean stone between the old words: the stone's colour, row by row
 *   letters   the columns the old DUNGEON BLITZ and its glow lie in
 *   revamp    the old "REVAMP" with its glow
 *   painted   REVAMPED, from the painting's own letters (see paintedRevamped): the old word's box,
 *             DUNGEON's E and D, the P's columns, the gap before the added letters, its size against
 *             the painted word, its middle and its foot
 *   title     the box the name is fitted into, centred (inside the plate, clear of its end diamonds);
 *             a design may give its own (box)
 *   plateSurface  the rebuilt plate inside (rebuildPlate): fade beyond the old letters (px), light
 *             at the top middle and dark at the ends (shares), edge wear (px, share), the window
 *             stone's cracks (share; from the slab's top and bottom edges, at u, v), fine grain (+-)
 */
const LAYOUT = {
    plate: { top: 47, bottom: 121, apexY: 83, left: 400, leftCorner: 418, right: 880, rightCorner: 860 },
    gap: { x0: 693, x1: 706 },
    letters: { x0: 413, x1: 864 },
    plateSurface: { fade: 10, light: 0.22, ends: 0.12, wear: 6, wearDark: 0.3, grain: 0.7, noise: 3.5,
        top: { u: 170, v: 14 }, bottom: { u: 90, v: 429 } },
    revamp: { x0: 521, y0: 110, x1: 760, y1: 178 },
    painted: { word: { x0: 515, y0: 112, x1: 760, y1: 182 }, e: { x0: 580, y0: 46, x1: 612, y1: 118 }, d: { x0: 410, y0: 45, x1: 463, y1: 120 },
        pColumns: [713, 758], gap: 3, scale: 0.88, centre: 640, bottom: 171,
        foliage: { from: 147, blend: 8, y0: 181, y1: 186, strength: 1 }, stoneU: -300, stoneV: 120, stoneGrain: 0.25 },
    title: { x0: 434, x1: 846, y0: 55, y1: 113 },
    jpegQuality: 0.9
};

/** The game logo's letter colours (UI_0 shape 164, its letter layer): fill top to bottom, outline. */
const LOGO = { stops: [[0, '#ffb928'], [0.51, '#f58727'], [1, '#e25e25']], outline: '#801517' };
/**
 * Gold read off the painted scene round the plate: the ribbons and the end diamonds (light
 * #ffe9a8 / #f6cf6e, mid #d89a3a, shade #9a5f1e), outlined in the plate frame's darkest brown.
 */
const GOLD = { stops: [[0, '#fff1bd'], [0.32, '#f7d27a'], [0.62, '#d99a3a'], [1, '#93591b']], outline: '#24120a' };

/**
 * The three designs for the name (REVAMPED is the painting's own lettering in all three), fitted
 * into the title box:
 *   font      a game font (its CSS name, below) and the text; or letters: the logo's own letters
 *   spacing   tracking, in em
 *   fill      gradient stops, top to bottom of the capitals
 *   outline   colour and width (em)
 *   shadow    a soft dark drop shadow (offset and blur, em) to seat it in the stone
 *   edge      the logo's own trick: its outline colour again, low and right, as a hard shadow
 *   bevel     a light rim along the top of each letter and a darker one along its foot
 *   glow      a faint warm light round it, as the gems and diamonds have
 */
const TITLES = {
    1: {
        name: 'Berlin Sans in the plate\'s gold',
        title: { font: 'DB Title Berlin', text: 'DUNGEON BLITZ', spacing: 0.05, fill: GOLD.stops, outline: [GOLD.outline, 0.06],
            shadow: [0, 0.05, 0.07, 'rgba(0,0,0,0.8)'], bevel: true, glow: 'rgba(255,200,110,0.22)' },
    },
    2: {
        name: 'The logo\'s own letters, set tight',
        title: { letters: true, evenRows: true, kern: -0.04, space: 0.32, shadow: [0, 0.05, 0.08, 'rgba(0,0,0,0.75)'] },
    },
    3: {
        name: 'Berlin Sans in the logo\'s colours',
        title: { font: 'DB Title Berlin', text: 'DUNGEON BLITZ', spacing: 0.04, fill: LOGO.stops, outline: [LOGO.outline, 0.09],
            edge: [0.035, 0.05], shadow: [0, 0.05, 0.08, 'rgba(0,0,0,0.65)'], bevel: true, glow: 'rgba(255,170,60,0.22)',
            // The owner's pick (2026-11-05), a size up: its box ~6% wider than the shared one (the name is width-bound).
            box: { x0: 421, x1: 859, y0: 52, y1: 115 } },
    }
};
/** The design the launcher ships. */
const RECOMMENDED = '3';

// Trajan Pro Bold is in the game too (UI_0), but only the few capitals the game's own text uses have
// shapes in it; the rest come out in the browser's fallback serif, so it cannot set this name.
const FONT_FILES = { 'DB Game UI': 'db-game-ui.woff', 'DB Title Berlin': 'db-title-berlin.woff' };

// ---- Edge ----------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens `url` in a headless Edge and gives a function that runs page code: run(expression) -> value. */
async function openPage(url, temp) {
    const profile = path.join(temp, 'edge-profile');
    const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
        '--remote-debugging-port=0', '--allow-file-access-from-files', `--user-data-dir=${profile}`, '--window-size=1280,690', 'about:blank'], { stdio: 'ignore' });
    let port = null;
    for (let i = 0; i < 80 && !port; i++) {
        await sleep(250);
        try {
            port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0];
        } catch (error) {
            // Not started yet.
        }
    }
    if (!port) {
        edge.kill();
        throw new Error('Edge did not start');
    }
    let target = null;
    for (let i = 0; i < 40 && !target; i++) {
        try {
            target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
        } catch (error) {
            await sleep(250);
        }
    }
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve) => socket.addEventListener('open', resolve));
    let id = 0;
    const waiting = {};
    socket.addEventListener('message', (message) => {
        const data = JSON.parse(message.data);
        if (data.id && waiting[data.id]) {
            waiting[data.id](data);
            delete waiting[data.id];
        }
    });
    const send = (method, params = {}) => new Promise((resolve) => {
        const n = ++id;
        waiting[n] = resolve;
        socket.send(JSON.stringify({ id: n, method, params }));
    });
    await send('Page.enable');
    await send('Page.navigate', { url });
    await sleep(1500);
    const run = async (expression) => {
        const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (reply.result && reply.result.exceptionDetails) {
            throw new Error('Page: ' + JSON.stringify(reply.result.exceptionDetails.exception || reply.result.exceptionDetails));
        }
        return reply.result.result.value;
    };
    const close = () => {
        socket.close();
        edge.kill();
    };
    return { run, close };
}

const fileUrl = (file) => 'file:///' + file.replace(/\\/g, '/');

// ---- the page's drawing code (runs in Edge) -------------------------------------------------------

const PAGE_CODE = `
window.loadImage = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('cannot load ' + src)); i.src = src; });

/** Inside the plate's hexagon? */
window.inPlate = (P, x, y) => {
  if (y < P.top || y > P.bottom) return false;
  const half = y <= P.apexY ? (y - P.top) / (P.apexY - P.top) : (P.bottom - y) / (P.bottom - P.apexY);
  const left = P.leftCorner - (P.leftCorner - P.left) * half;
  const right = P.rightCorner + (P.right - P.rightCorner) * half;
  return x >= left && x <= right;
};
window.plateEdges = (P, y) => {
  const half = y <= P.apexY ? (y - P.top) / (P.apexY - P.top) : (P.bottom - y) / (P.bottom - P.apexY);
  return [Math.ceil(P.leftCorner - (P.leftCorner - P.left) * half), Math.floor(P.rightCorner + (P.right - P.rightCorner) * half)];
};

/**
 * The grain of the game's own window stone (UI_Library _WindowBaseOldStone02, dbui/stone.png): how
 * much lighter or darker than its average the slab is at a point, so a surface can take its chips,
 * mottling and cracks. (u, v) is a point in the slab.
 */
window.stoneGrain = (stone) => {
  const c = canvasOf(stone.width, stone.height), q = c.getContext('2d'); q.drawImage(stone, 0, 0);
  const d = q.getImageData(0, 0, c.width, c.height).data;
  const lum = (u, v) => { const i = (v * c.width + u) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
  let s = 0, n = 0;
  for (let v = 60; v < c.height - 60; v += 2) for (let u = 60; u < c.width - 60; u += 2) { s += lum(u, v); n++; }
  const mean = s / n;
  return (u, v) => lum(Math.max(0, Math.min(c.width - 1, Math.round(u))), Math.max(0, Math.min(c.height - 1, Math.round(v)))) - mean;
};

/**
 * The plate's inside, made again where the old letters were: the plate's own dark slate, row by row
 * as painted (each row's colour from the clean stone between the old words, so its top and bottom
 * shadows stay), lit as the painted plate is (lighter towards the top middle, darker towards its
 * ends), worn darker along its edges, with the grain of the game's window stone in it so it reads
 * as stone, not flat paint. It replaces the whole inside across the old letters' columns and fades
 * into the painted plate beyond them, so no old letter and no seam is left.
 */
window.rebuildPlate = (g, L, stone) => {
  const P = L.plate, T = L.plateSurface, W = g.canvas.width;
  const img = g.getImageData(0, 0, W, g.canvas.height), d = img.data;
  const at = (x, y) => (y * W + x) * 4;
  const lum = (x, y) => { const i = at(x, y); return (d[i] + d[i + 1] + d[i + 2]) / 3; };
  const rowColour = {};
  for (let y = P.top; y <= P.bottom; y++) {
    let r = 0, gr = 0, b = 0, n = 0;
    for (let yy = y - 1; yy <= y + 1; yy++) for (let x = L.gap.x0; x <= L.gap.x1; x++) {
      if (yy < P.top || yy > P.bottom || lum(x, yy) >= 62) continue;
      const i = at(x, yy); r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++;
    }
    rowColour[y] = n ? [r / n, gr / n, b / n] : rowColour[y - 1];
  }
  const grain = stoneGrain(stone);
  const mid = (P.left + P.right) / 2, half = (P.right - P.left) / 2;
  let changed = 0, seed = 7;
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff - 0.5) * 2 * T.noise; };
  for (let y = P.top; y <= P.bottom; y++) {
    const c = rowColour[y]; if (!c) continue;
    const [left, right] = plateEdges(P, y);
    for (let x = left; x <= right; x++) {
      // How much of the new surface: all of it over the old letters, fading out beyond them.
      const out = x < L.letters.x0 ? L.letters.x0 - x : x > L.letters.x1 ? x - L.letters.x1 : 0;
      let w = Math.max(0, 1 - out / T.fade);
      const edge = Math.min(y - P.top, P.bottom - y, x - left, right - x);
      if (edge < 1.5) w *= 0.5;
      if (w <= 0) continue;
      const dx = (x - mid) / half;
      const light = 1 + T.light * Math.exp(-dx * dx * 2.2) * (1 - (y - P.top) / (P.bottom - P.top) * 0.7) - T.ends * dx * dx;
      const wear = edge < T.wear ? 1 - T.wearDark * (1 - edge / T.wear) : 1;
      // The slab is plain in its middle and cracked along its edges: the plate's upper half takes the
      // slab's top edge (cracks hanging down), its lower half the slab's bottom edge (cracks rising).
      const upper = y - P.top <= (P.bottom - P.top) / 2;
      const k = (upper ? grain(T.top.u + x - P.left, T.top.v + y - P.top) : grain(T.bottom.u + x - P.left, T.bottom.v - (P.bottom - y))) * T.grain + noise();
      const i = at(x, y);
      for (let ch = 0; ch < 3; ch++) {
        const v = c[ch] * light * wear + k * (ch === 2 ? 1.08 : 1);
        d[i + ch] = d[i + ch] * (1 - w) + v * w;
      }
      changed++;
    }
  }
  g.putImageData(img, 0, 0);
  return changed;
};

/** The game's window art as a nine-slice plate: border \`b\` px of the art's 88 (PNG px) corners. */
window.nineSlice = (g, img, s, x0, y0, x1, y1, b) => {
  const W = img.width, H = img.height, sx = [0, s, W - s, W], sy = [0, s, H - s, H];
  const dx = [x0, x0 + b, x1 - b, x1], dy = [y0, y0 + b, y1 - b, y1];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.drawImage(img, sx[c], sy[r], sx[c + 1] - sx[c], sy[r + 1] - sy[r], dx[c], dy[r], dx[c + 1] - dx[c], dy[r + 1] - dy[r]);
};

/** A canvas trimmed to the pixels that show (alpha above 4). */
window.trim = (c) => {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 4) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
};

window.canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/**
 * Lettering with its finish, drawn large (S px) on its own canvas and trimmed: \`paint(g, colour)\`
 * fills the letters' shape in one colour at 0, 0; capTop and capBottom are where the capitals run
 * (for the gradient). Layers, back to front: glow, drop shadow, the logo-style hard edge, outline,
 * gradient fill, bevel (a light rim on top, a darker one at the foot, inside the letters only).
 */
window.finish = (W, H, S, paint, capTop, capBottom, o) => {
  const out = canvasOf(W, H), g = out.getContext('2d');
  const layer = (colour, dx, dy) => { const c = canvasOf(W, H), x = c.getContext('2d'); x.translate(dx, dy); paint(x, colour, 0); return c; };
  const stroked = (colour, width, dx, dy) => { const c = canvasOf(W, H), x = c.getContext('2d'); x.translate(dx, dy); paint(x, colour, width); return c; };
  const outlineW = o.outline ? o.outline[1] * S : 0;
  const body = (colour, dx, dy) => { const c = canvasOf(W, H), x = c.getContext('2d'); x.drawImage(stroked(colour, outlineW * 2, dx, dy), 0, 0); x.drawImage(layer(colour, dx, dy), 0, 0); return c; };
  if (o.glow) { g.save(); g.shadowColor = o.glow; g.shadowBlur = S * 0.35; g.drawImage(body(o.glow, 0, 0), 0, 0); g.restore(); }
  if (o.shadow) { const [sx, sy, blur, colour] = o.shadow; g.save(); g.filter = 'blur(' + (blur * S) + 'px)'; g.drawImage(body(colour, sx * S, sy * S), 0, 0); g.restore(); }
  if (o.edge) g.drawImage(body(o.outline[0], o.edge[0] * S, o.edge[1] * S), 0, 0);
  if (o.outline) g.drawImage(stroked(o.outline[0], outlineW * 2, 0, 0), 0, 0);
  const fill = layer('#fff', 0, 0), f = fill.getContext('2d');
  f.globalCompositeOperation = 'source-in';
  const gradient = f.createLinearGradient(0, capTop, 0, capBottom);
  for (const [at, colour] of o.fill) gradient.addColorStop(at, colour);
  f.fillStyle = gradient; f.fillRect(0, 0, W, H);
  if (o.bevel) {
    const rim = (colour, dy, alpha) => { const c = layer(colour, 0, 0), x = c.getContext('2d'); x.globalCompositeOperation = 'destination-out'; x.drawImage(layer('#000', 0, dy), 0, 0); f.globalCompositeOperation = 'source-atop'; f.globalAlpha = alpha; f.drawImage(c, 0, 0); f.globalAlpha = 1; };
    rim('#fffbe6', S * 0.035, 0.85);
    rim('#3a1a06', -S * 0.035, 0.45);
  }
  g.drawImage(fill, 0, 0);
  return trim(out);
};

/** Text in a game font with its finish (see finish), trimmed. */
window.styledText = (o) => {
  const S = 160, probe = canvasOf(10, 10).getContext('2d');
  const font = S + 'px "' + o.font + '"';
  probe.font = font; probe.letterSpacing = (o.spacing || 0) * S + 'px';
  const m = probe.measureText(o.text), cap = probe.measureText('H');
  const pad = Math.ceil(S * 0.6), W = Math.ceil(m.width + pad * 2), H = Math.ceil(S * 1.6 + pad);
  const baseline = Math.ceil(pad + cap.actualBoundingBoxAscent);
  const paint = (x, colour, strokeWidth) => {
    x.font = font; x.letterSpacing = (o.spacing || 0) * S + 'px'; x.textBaseline = 'alphabetic'; x.lineJoin = 'round';
    if (strokeWidth) { x.strokeStyle = colour; x.lineWidth = strokeWidth; x.strokeText(o.text, pad, baseline); }
    else { x.fillStyle = colour; x.fillText(o.text, pad, baseline); }
  };
  return finish(W, H, S, paint, baseline - cap.actualBoundingBoxAscent, baseline, o);
};

/**
 * The logo's own letters upright, set tight on one line: bottoms on one baseline, the logo's own
 * sizes between them, neighbours drawn \`kern\` (em of the letters' height) closer, a word space of
 * \`space\` between the words; with a soft drop shadow.
 */
window.letterLine = async (letters, o) => {
  const ups = [];
  for (const l of letters) ups.push({ l, c: await uprightLetter(l.src, l.turn) });
  if (o.evenRows) {
    // Both words as tall as each other (the logo's BLITZ is the smaller line).
    const tallest = (row) => Math.max(...ups.filter((u) => u.l.row === row).map((u) => u.c.height));
    const k = tallest(1) / tallest(2);
    for (const u of ups) if (u.l.row === 2) { const c = canvasOf(Math.round(u.c.width * k), Math.round(u.c.height * k)); const q = c.getContext('2d'); q.imageSmoothingQuality = 'high'; q.drawImage(u.c, 0, 0, c.width, c.height); u.c = c; }
  }
  const hMax = Math.max(...ups.map((u) => u.c.height));
  const kern = o.kern * hMax, space = o.space * hMax;
  let width = 0;
  ups.forEach((u, i) => { if (i) width += (u.l.row !== ups[i - 1].l.row ? space : kern); width += u.c.width; });
  const pad = Math.ceil(hMax * 0.4), W = Math.ceil(width + pad * 2), H = Math.ceil(hMax + pad * 2);
  const line = canvasOf(W, H), g = line.getContext('2d');
  let x = pad;
  ups.forEach((u, i) => { if (i) x += (u.l.row !== ups[i - 1].l.row ? space : kern); g.drawImage(u.c, x, pad + hMax - u.c.height); x += u.c.width; });
  if (!o.shadow) return trim(line);
  const out = canvasOf(W, H), q = out.getContext('2d');
  const [sx, sy, blur, colour] = o.shadow;
  const dark = canvasOf(W, H), dq = dark.getContext('2d');
  dq.drawImage(line, sx * hMax, sy * hMax); dq.globalCompositeOperation = 'source-in'; dq.fillStyle = colour; dq.fillRect(0, 0, W, H);
  q.filter = 'blur(' + (blur * hMax) + 'px)'; q.drawImage(dark, 0, 0); q.filter = 'none';
  q.drawImage(line, 0, 0);
  return trim(out);
};

/** A logo letter stood upright: turned back by its \`turn\` and trimmed to its own pixels. */
window.uprightLetter = async (src, turn) => {
  const img = await loadImage(src);
  const r = Math.abs(turn) * Math.PI / 180, W = img.width, H = img.height;
  const cw = Math.ceil(W * Math.cos(r) + H * Math.sin(r)) + 4, ch = Math.ceil(W * Math.sin(r) + H * Math.cos(r)) + 4;
  const c = canvasOf(cw, ch), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.translate(cw / 2, ch / 2); g.rotate(-turn * Math.PI / 180); g.drawImage(img, -W / 2, -H / 2);
  return trim(c);
};

/** \`art\` scaled to fit inside the box (no wider than maxW, no taller than maxH), centred on cx, cy. */
window.place = (g, art, cx, cy, maxW, maxH) => {
  const k = Math.min(maxW / art.width, maxH / art.height);
  const w = art.width * k, h = art.height * k;
  g.drawImage(art, cx - w / 2, cy - h / 2, w, h);
  return { x0: Math.round(cx - w / 2), y0: Math.round(cy - h / 2), x1: Math.round(cx + w / 2), y1: Math.round(cy + h / 2), scale: k };
};

/**
 * The painted "REVAMPED". The background's own "REVAMP" (gold bevelled serif capitals, dark brown
 * outline) is lifted off the picture whole, the "E" and "D" it lacks are lifted from the same painted
 * lettering in "DUNGEON" (same face, same finish) and brought to its height, and the word is set
 * again, centred between the ribbons, after the old word has been taken out of the picture (its
 * pixels refilled from the stone and forest round them).
 *   P.word      the box the painted REVAMP lies in
 *   P.e, P.d    the boxes of DUNGEON's E and D
 *   P.scale     the new word's size against the painted one
 *   P.centre    the new word's middle (x) and P.bottom its foot (y)
 *   P.gap       the space put before the E and the D, in the painting's pixels
 */
window.paintedRevamped = (g, orig, P, check, grain) => {
  const W = g.canvas.width, H = g.canvas.height;
  const oc = canvasOf(W, H), og = oc.getContext('2d'); og.drawImage(orig, 0, 0);
  const od = og.getImageData(0, 0, W, H).data;
  const at = (x, y) => (y * W + x) * 4;
  const gold = (x, y) => { const i = at(x, y); return od[i] > 120 && od[i] - od[i + 2] > 45 && od[i] >= od[i + 1]; };
  const brown = (x, y) => { const i = at(x, y); return od[i] - od[i + 2] >= 10 && od[i] >= od[i + 1] - 4 && od[i] < 170; };
  // The letters in a box: their gold, and the dark brown outline round it (up to 3 px).
  const lettersIn = (b) => {
    const m = new Uint8Array(W * H);
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (gold(x, y)) m[y * W + x] = 1;
    for (let pass = 0; pass < 3; pass++) {
      const add = [];
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
        if (m[y * W + x]) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (m[(y + dy) * W + x + dx]) { near = true; break; }
        if (near && brown(x, y)) add.push(y * W + x);
      }
      for (const k of add) m[k] = 1;
    }
    // Only the letters: pieces of at least minSize pixels (stray specks of trim are left out).
    const seen = new Uint8Array(W * H), pieces = [];
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const s = y * W + x; if (!m[s] || seen[s]) continue;
      const piece = [], stack = [s];
      while (stack.length) { const k = stack.pop(); if (seen[k] || !m[k]) continue; seen[k] = 1; piece.push(k); stack.push(k + 1, k - 1, k + W, k - W); }
      pieces.push(piece);
    }
    pieces.sort((p, q) => q.length - p.length);
    return b.largest ? pieces.slice(0, 1) : pieces.filter((p) => p.length >= b.minSize);
  };
  const cut = (pieces) => {
    const all = [].concat(...pieces);
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const k of all) { const x = k % W, y = (k - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const c = canvasOf(x1 - x0 + 1, y1 - y0 + 1), q = c.getContext('2d'), im = q.createImageData(c.width, c.height);
    for (const k of all) { const x = k % W, y = (k - x) / W, i = at(x, y), j = ((y - y0) * c.width + x - x0) * 4; im.data[j] = od[i]; im.data[j + 1] = od[i + 1]; im.data[j + 2] = od[i + 2]; im.data[j + 3] = 255; }
    q.putImageData(im, 0, 0);
    return { c, all, x0, y0, x1, y1 };
  };
  const word = cut(lettersIn(Object.assign({ minSize: 300 }, P.word)));
  const e = cut(lettersIn(Object.assign({ largest: true }, P.e)));
  const d = cut(lettersIn(Object.assign({ largest: true }, P.d)));

  // Take the old word out: its pixels and 3 px round them are refilled from what is round them
  // (repeated averaging of the neighbours, the known pixels held), with a little grain.
  const data = g.getImageData(0, 0, W, H), px = data.data;
  const hole = new Uint8Array(W * H);
  for (const k of word.all) { const x = k % W, y = (k - x) / W; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) hole[(y + dy) * W + x + dx] = 1; }
  const list = []; for (let k = 0; k < W * H; k++) if (hole[k]) list.push(k);
  const val = new Float32Array(W * H * 3);
  for (const k of list) { val[k * 3] = 40; val[k * 3 + 1] = 40; val[k * 3 + 2] = 40; }
  const v = (k, ch) => hole[k] ? val[k * 3 + ch] : px[k * 4 + ch];
  for (let it = 0; it < 500; it++) for (const k of list) for (let ch = 0; ch < 3; ch++) val[k * 3 + ch] = (v(k - 1, ch) + v(k + 1, ch) + v(k - W, ch) + v(k + W, ch)) / 4;
  // The refill has the right light but no surface: the foliage below the word gets the leaves and
  // branches of the painted foliage under it (the strip between the word and the panel frame, its
  // detail continued upwards, as the branches run), the plate's dark underside above it the grain
  // of the game's window stone.
  const F = P.foliage;
  const detail = (x, y) => {
    let s = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const i = at(x + dx, y + dy); s += (od[i] + od[i + 1] + od[i + 2]) / 3; }
    const i = at(x, y);
    return [od[i] - s / 25, od[i + 1] - s / 25, od[i + 2] - s / 25];
  };
  for (const k of list) {
    const x = k % W, y = (k - x) / W;
    const leafy = Math.max(0, Math.min(1, (y - F.from) / F.blend));
    const rows = F.y1 - F.y0 + 1;
    const leaf = leafy > 0 ? detail(x, F.y0 + (((y - F.from) % rows) + rows) % rows) : [0, 0, 0];
    const rock = (1 - leafy) * (grain ? grain(P.stoneU + x, P.stoneV + y) * P.stoneGrain : 0);
    for (let ch = 0; ch < 3; ch++) px[k * 4 + ch] = val[k * 3 + ch] + leaf[ch] * leafy * F.strength + rock;
  }
  g.putImageData(data, 0, 0);
  const leftovers = check ? check() : null;

  // Set REVAMPED: the painted block, then the E and the D at the block's height (its P's), feet level.
  // The P's top and foot give the capitals' height and the line the letters stand on (the R's tail
  // hangs below it).
  let pTop = H, pFoot = 0;
  for (const k of word.all) { const x = k % W, y = (k - x) / W; if (x >= P.pColumns[0] && x <= P.pColumns[1]) { if (y < pTop) pTop = y; if (y > pFoot) pFoot = y; } }
  const capH = pFoot - pTop + 1;
  const scaleE = capH / (e.y1 - e.y0 + 1), scaleD = capH / (d.y1 - d.y0 + 1);
  const parts = [
    { c: word.c, w: word.c.width, h: word.c.height },
    { c: e.c, w: e.c.width * scaleE, h: e.c.height * scaleE },
    { c: d.c, w: d.c.width * scaleD, h: d.c.height * scaleD }
  ];
  const total = parts[0].w + P.gap + parts[1].w + P.gap + parts[2].w;
  const pad = 20, art = canvasOf(Math.ceil(total + pad * 2), Math.ceil(word.c.height + pad * 2)), a = art.getContext('2d');
  a.imageSmoothingQuality = 'high';
  const base = pad + (pFoot - word.y0 + 1);
  let x = pad;
  a.drawImage(parts[0].c, x, pad); x += parts[0].w + P.gap;
  a.drawImage(parts[1].c, x, base - parts[1].h, parts[1].w, parts[1].h); x += parts[1].w + P.gap;
  a.drawImage(parts[2].c, x, base - parts[2].h, parts[2].w, parts[2].h);
  // Its soft dark shadow, as the painted word has, then the word.
  const shadow = canvasOf(art.width, art.height), s = shadow.getContext('2d');
  s.drawImage(art, 0, 2); s.globalCompositeOperation = 'source-in'; s.fillStyle = 'rgba(0,0,0,0.65)'; s.fillRect(0, 0, art.width, art.height);
  const k = P.scale, wNew = art.width * k, hNew = art.height * k;
  const left = P.centre - wNew / 2, top = P.bottom - (base) * k;
  g.save(); g.filter = 'blur(2px)'; g.drawImage(shadow, left, top, wNew, hNew); g.restore();
  g.drawImage(art, left, top, wNew, hNew);
  return { leftovers, x0: Math.round(left + pad * k), y0: Math.round(top + pad * k), x1: Math.round(left + wNew - pad * k), y1: Math.round(P.bottom), oldWord: [word.x0, word.y0, word.x1, word.y1], e: [e.x0, e.y0, e.x1, e.y1], d: [d.x0, d.y0, d.x1, d.y1] };
};

/** Bright pixels left where the old lettering was (it was bright gold): on the plate and below it. */
window.countLeftovers = (g, L) => {
  const W = g.canvas.width, d = g.getImageData(0, 0, W, g.canvas.height).data, R = L.painted.word;
  let bright = 0; const where = [];
  const look = (x, y) => { const i = (y * W + x) * 4; if ((d[i] + d[i + 1] + d[i + 2]) / 3 > 80) { bright++; if (where.length < 12) where.push(x + ',' + y); } };
  // The plate, where DUNGEON BLITZ was.
  for (let y = L.plate.top + 2; y <= L.plate.bottom - 2; y++) for (let x = L.letters.x0; x <= L.letters.x1; x++) {
    if (!inPlate(L.plate, x, y)) continue;
    const [left, right] = plateEdges(L.plate, y); if (x < left + 2 || x > right - 2) continue;
    look(x, y);
  }
  // Below the plate, where REVAMP was (its box, inside the ribbons' tips).
  for (let y = L.plate.bottom + 1; y <= R.y1; y++) for (let x = R.x0 + 8; x <= R.x1 - 8; x++) look(x, y);
  return { bright, where };
};

window.buildTitle = async (o) => {
  for (const face of o.fonts) { await document.fonts.load('40px "' + face + '"'); if (!document.fonts.check('40px "' + face + '"')) throw new Error(face + ' did not load'); }
  const [bg, stone] = await Promise.all([loadImage(o.background), loadImage(o.stone)]);
  const L = o.layout, D = o.design;
  const canvas = canvasOf(bg.width, bg.height), g = canvas.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(bg, 0, 0);
  const rebuilt = rebuildPlate(g, L, stone);
  // REVAMPED in the painting's own letters (it takes the old word out first), then the check that
  // nothing of the old title is left, made before it is drawn over.
  const wordBox = paintedRevamped(g, bg, L.painted, () => countLeftovers(g, L), stoneGrain(stone));
  const leftovers = wordBox.leftovers;
  // The name, as big as its box lets it be.
  const name = D.title.letters ? await letterLine(o.letters, D.title) : styledText(D.title);
  const B = D.title.box || L.title;
  const nameBox = place(g, name, (B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, B.x1 - B.x0, B.y1 - B.y0);
  return { jpeg: canvas.toDataURL('image/jpeg', o.quality), rebuilt, leftovers, nameBox, wordBox, width: canvas.width, height: canvas.height };
};

/** Largest channel difference between two pictures, and the share of pixels off by more than 8. */
window.difference = async (a, b) => {
  const [p, q] = await Promise.all([loadImage(a), loadImage(b)]);
  const read = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
  if (p.width !== q.width || p.height !== q.height) return { max: 255, share: 1 };
  const x = read(p), y = read(q); let max = 0, off = 0;
  for (let i = 0; i < x.length; i += 4) { const m = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2])); if (m > max) max = m; if (m > 8) off++; }
  return { max, share: off / (x.length / 4) };
};
`;

// ---- main -----------------------------------------------------------------------------------------

function readBg() {
    const lines = fs.readFileSync(UI_JS, 'utf8').split('\n');
    const index = lines.findIndex((line) => BG_LINE.test(line.replace(/\r$/, '')));
    if (index < 0) {
        throw new Error('No BG picture line in ui.js');
    }
    return { lines, index, base64: BG_LINE.exec(lines[index].replace(/\r$/, ''))[1] };
}



function pageHtml() {
    const faces = Object.keys(FONT_FILES).map((face) => `@font-face{font-family:'${face}';src:url('${fileUrl(path.join(KIT, FONT_FILES[face]))}') format('woff')}`).join('');
    // Each font only loads once something on the page uses it.
    const users = Object.keys(FONT_FILES).map((face) => `<span style="position:absolute;left:-999px;font-family:'${face}'">Dungeon Blitz REVAMPED</span>`).join('');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + faces + 'body{margin:0;background:#000}</style></head><body>' +
        users + '<script>' + PAGE_CODE + '</script></body></html>';
}

/** The logo's letters from the kit's manifest: [{ src, char, row, turn }], DUNGEON then BLITZ. */
function logoLetters() {
    const manifest = JSON.parse(fs.readFileSync(path.join(KIT, 'pieces.json'), 'utf8'));
    const letters = manifest.pieces.filter((p) => p.letter).map((p) => ({ src: fileUrl(path.join(ASSETS, p.file)), char: p.letter.char, row: p.letter.row, turn: p.letter.turn }));
    if (letters.map((l) => l.char).join('') !== 'DUNGEONBLITZ') {
        throw new Error('The kit\'s logo letters do not spell DUNGEON BLITZ: run node dbui\\build.js');
    }
    return letters;
}

/** Opens the drawing page; make(design) gives { jpeg, rebuilt, leftovers, nameBox, wordBox, ... }. */
async function open(temp) {
    if (!fs.existsSync(ORIGINAL)) {
        // First run: the picture in ui.js is the painted original.
        fs.writeFileSync(ORIGINAL, Buffer.from(readBg().base64, 'base64'));
    }
    for (const file of ['pieces.json', 'stone.png'].concat(Object.values(FONT_FILES))) {
        if (!fs.existsSync(path.join(KIT, file))) {
            throw new Error(`No launcher-assets\\dbui\\${file}: run node dbui\\build.js first.`);
        }
    }
    const letters = logoLetters();
    const page = path.join(temp, 'title.html');
    fs.writeFileSync(page, pageHtml());
    const edge = await openPage(fileUrl(page), temp);
    const make = (design) => edge.run(`buildTitle(${JSON.stringify({
        background: fileUrl(ORIGINAL),
        stone: fileUrl(path.join(KIT, 'stone.png')),
        fonts: Object.keys(FONT_FILES),
        letters,
        design: TITLES[design],
        layout: LAYOUT,
        quality: LAYOUT.jpegQuality
    })})`);
    const compare = (a, b) => edge.run(`difference(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
    return { edge, make, compare };
}

function argument(name, fallback) {
    const at = process.argv.indexOf(name);
    return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

async function main() {
    const checking = process.argv.includes('--verify');
    const design = argument('--title', RECOMMENDED);
    if (!TITLES[design]) {
        throw new Error(`--title is one of ${Object.keys(TITLES).join(', ')}`);
    }
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbui-title-'));
    let edge = null;
    try {
        const page = await open(temp);
        edge = page.edge;
        const failures = [];
        const check = (made, label) => {
            if (made.width !== 1280 || made.height !== 690) {
                failures.push(`${label}: the background is ${made.width}x${made.height}, not 1280x690`);
            }
            if (made.leftovers.bright > 0) {
                failures.push(`${label}: ${made.leftovers.bright} bright pixels of the old lettering are left on the plate (${made.leftovers.where.join(' ')})`);
            }
        };
        const bg = readBg();
        if (checking) {
            const shipped = 'data:image/jpeg;base64,' + bg.base64;
            let match = null;
            for (const key of Object.keys(TITLES)) {
                const made = await page.make(key);
                check(made, 'title ' + key);
                const diff = await page.compare(made.jpeg, shipped);
                if (diff.share <= 0.002) {
                    match = { key, diff };
                }
            }
            if (!match) {
                failures.push('ui.js\'s background is none of the title designs (run node dbui\\title.js)');
            } else {
                console.log(`note: ui.js has title ${match.key} (${TITLES[match.key].name})` + (match.diff.max ? `, within ${match.diff.max}/255 of a fresh one` : '') +
                    (match.key === RECOMMENDED ? '' : `; the recommended one is ${RECOMMENDED}`));
            }
            if (Buffer.from(bg.base64, 'base64').equals(fs.readFileSync(ORIGINAL))) {
                failures.push('ui.js still has the original painted title');
            }
        } else {
            const made = await page.make(design);
            check(made, 'title ' + design);
            const summary = `title ${design} (${TITLES[design].name}); ${made.rebuilt} plate pixels rebuilt; name at ${JSON.stringify(made.nameBox)}, REVAMPED at ${JSON.stringify(made.wordBox)}`;
            if (process.argv.includes('--out')) {
                const out = argument('--out');
                fs.writeFileSync(out, Buffer.from(made.jpeg.split(',')[1], 'base64'));
                console.log(`wrote ${out}: ${summary}`);
            } else if (!failures.length) {
                bg.lines[bg.index] = `var BG="${made.jpeg}";` + (bg.lines[bg.index].endsWith('\r') ? '\r' : '');
                fs.writeFileSync(UI_JS, bg.lines.join('\n'));
                console.log(`ui.js: new background, ${Math.round(made.jpeg.length * 3 / 4 / 1024)} KB JPEG; ${summary}`);
            }
        }
        for (const failure of failures) {
            console.log('FAIL: ' + failure);
        }
        if (checking && !failures.length) {
            console.log('OK: the title is the game\'s lettering, and none of the old one is left.');
        }
        process.exitCode = failures.length ? 1 : 0;
    } finally {
        if (edge) {
            edge.close();
        }
        await sleep(500);
        fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
