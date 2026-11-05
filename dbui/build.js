// The DB UI kit ("DB coded UI"): the game's own window, field, button, check box, menu and pill art,
// exported from the client's UI files into launcher-assets\dbui as PNGs, with the game's UI font.
// launcher-assets\dbui\dbui.css stretches them with CSS nine-slice (border-image) for the launcher
// (ui.js loads it) and for any plain HTML page. Nothing here is drawn: every picture is a stock
// symbol, or a stock sprite with some of its own parts left out, sometimes recoloured.
//
//   node dbui\build.js            export the pieces and the font, write launcher-assets\dbui\pieces.json
//   node dbui\build.js --verify   change nothing; export again into a temp folder and check that the
//                                 shipped pieces still match the game's art, that dbui.css and ui.js
//                                 only use pieces from the manifest with the manifest's slices, that
//                                 the installer ships the kit, and that nothing uses what IE11 lacks
//
// Needs Java 8 and JPEXS FFDec (exports the art), Microsoft Edge (draws the composed pieces from
// FFDec's SVG; FFDec draws the whole symbols itself) and the game client's UI files:
//   DB_CLIENT_DIR  default C:\DungeonBlitzLab\db-r-server\LOCAL\src\client\content\localhost\p (read only)
//   JAVA_EXE       default C:\Program Files\Java\jre1.8.0_503\bin\java.exe
//   FFDEC_JAR      default C:\Program Files (x86)\FFDec\ffdec.jar
//   EDGE_EXE       default C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
//
// Step 1 (2026-11-04): the Sign In screen. Step 2 (2026-11-05): every launcher screen, as a kit.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const png = require('./png');

const REPO = path.resolve(__dirname, '..');
const ASSETS = path.join(REPO, 'launcher-assets');
const OUT = path.join(ASSETS, 'dbui');
const MANIFEST = path.join(OUT, 'pieces.json');
const KIT_CSS = path.join(OUT, 'dbui.css');
const UI_JS = path.join(ASSETS, 'ui.js');
const INSTALLER = path.join(REPO, 'installer', 'DBRevamped.iss');

const CLIENT = process.env.DB_CLIENT_DIR || 'C:\\DungeonBlitzLab\\db-r-server\\LOCAL\\src\\client\\content\\localhost\\p';
const JAVA = process.env.JAVA_EXE || 'C:\\Program Files\\Java\\jre1.8.0_503\\bin\\java.exe';
const FFDEC = process.env.FFDEC_JAR || 'C:\\Program Files (x86)\\FFDec\\ffdec.jar';
const EDGE = process.env.EDGE_EXE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

/** Pieces are drawn at twice the art's own size (small ones at four times), so they stay sharp. */
const SCALE = 2;

/** The game's UI files the pieces come from, relative to DB_CLIENT_DIR. */
const SWFS = {
    UI_0: 'cbp/UI_0.swf',
    UI_1: 'cbp/UI_1.swf',
    UI_3: 'caa/UI_3.swf',
    UI_4: 'cbp/UI_4.swf',
    UI_Library: 'caa/UI_Library.swf'
};

/** The rim parts the game builds its gold window and field rims from (UI_0 characters). */
const RIM_PARTS = ['42', '44', '46', '48', '50'];

/**
 * The game's text boxes in a_LoginSplash, in the sprite's own pixels (am_Email and am_Password:
 * their x, y, width and height). A field's rim is the rim parts placed within RIM_REACH of its box.
 */
const LOGIN_FIELDS = {
    am_Email: { x: 405.5, y: 321.35, width: 338.7, height: 21.2 },
    am_Password: { x: 408.45, y: 393.35, width: 337.25, height: 21.2 }
};
const RIM_REACH = 20;

function nearField(use, field) {
    const box = LOGIN_FIELDS[field];
    return use.tx >= box.x - RIM_REACH && use.tx <= box.x + box.width + RIM_REACH &&
        use.ty >= box.y - RIM_REACH && use.ty <= box.y + box.height + RIM_REACH;
}

/** Parts a window's own art never needs: its texts, and its named parts (fields, buttons, check box). */
function isContent(use) {
    return use.href.indexOf('#text') === 0 || use.name !== null;
}

function isText(use) {
    return use.href.indexOf('#text') === 0;
}

// Recolourings (the art itself is untouched). A ColorTransform is { r, g, b, ro, go, bo } as Flash
// has it; a matrix is the 4 x 5 colour matrix of Flash's ColorMatrixFilter (offsets in 0..255).

/** The copper role: the gold rim goes to copper, the slate face to a dark bronze. */
const COPPER = { r: 1.0, g: 0.66, b: 0.42, ro: 14, go: 0, bo: 0 };
/**
 * The slate role: the button with its colour taken out, as the game's own AdjustColor
 * (saturation -100) takes it out of the Login button's label on Click: a silver rim on slate.
 */
const SLATE = {
    matrix: [
        0.3086, 0.6094, 0.082, 0, 0,
        0.3086, 0.6094, 0.082, 0, 0,
        0.3086, 0.6094, 0.082, 0, 0,
        0, 0, 0, 1, 0
    ]
};
/** The online light: the game's red dot with its red and green swapped. */
const RED_TO_GREEN = {
    matrix: [
        0, 1, 0, 0, 0,
        1, 0, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1, 0
    ]
};

const LOGIN_BUTTON = { swf: 'UI_0', symbol: 'a_LoginSplash', path: ['am_LoginButton'], kind: 'composed', keep: (use) => !isContent(use), slice: [16, 18, 16, 18] };
const BUTTON_FRAMES = [[1, '', 'Ready'], [2, '-over', 'Over'], [3, '-click', 'Click']];

/** One button role: the Login button's three frames, recoloured with `tint` (none: as the game has it). */
function buttonRole(role, tint, words) {
    return BUTTON_FRAMES.map(([frame, suffix, label]) => Object.assign({}, LOGIN_BUTTON, {
        name: `button${role}${suffix}`,
        what: `the sign-in window's Login button (am_LoginButton), ${label} frame, without its label${words}`,
        frame,
        tint
    }));
}

/**
 * The pieces. kind:
 *   symbol     a whole stock symbol, frame `frame`, drawn by FFDec
 *   composed   a frame of a stock sprite (or of the named child at `path` inside it), drawn from
 *              FFDec's SVG with only the parts `keep` allows (each top-level placement:
 *              { char, href, name, tx, ty }), drawn by Edge
 * slice: the nine-slice border [top, right, bottom, left] in the art's own pixels (the PNG is
 * `scale` times that; dbui.css uses the PNG's numbers); null for pieces shown whole.
 */
const PIECES = [
    {
        name: 'window',
        what: 'the game\'s sign-in window: its stone frame, gold rim and dark well, without its fields, labels, check box and buttons',
        swf: 'UI_0', symbol: 'a_LoginSplash', frame: 1, kind: 'composed',
        keep: (use) => !isContent(use) && use.char !== '2' &&
            !(RIM_PARTS.includes(use.char) && (nearField(use, 'am_Email') || nearField(use, 'am_Password'))),
        slice: [44, 44, 44, 44]
    },
    {
        name: 'field',
        what: 'the sign-in window\'s Email field rim (the gold rim parts round am_Email), transparent inside',
        swf: 'UI_0', symbol: 'a_LoginSplash', frame: 1, kind: 'composed',
        keep: (use) => RIM_PARTS.includes(use.char) && nearField(use, 'am_Email'),
        slice: [20, 20, 20, 20]
    },
    ...buttonRole('', undefined, ' (the gold role: the button as the game has it)'),
    ...buttonRole('-copper', COPPER, ', recoloured copper'),
    ...buttonRole('-slate', SLATE, ', its colour taken out (slate)'),
    {
        name: 'header',
        what: 'the battlement the game crowns its talent window with (Kael\'s arena keep wears it too)',
        swf: 'UI_Library', symbol: '_WindowSkinHeaderTalents', frame: 1, kind: 'symbol',
        slice: [0, 130, 0, 130]
    },
    // The round check of the sign-in window's Remember Password (am_SavePass), as a radio.
    {
        name: 'radio', what: 'the sign-in window\'s Remember Password check (am_SavePass), Ready frame, without its tick',
        swf: 'UI_0', symbol: 'a_LoginSplash', path: ['am_SavePass'], frame: 1, kind: 'composed', scale: 1,
        keep: (use) => use.name !== 'am_CheckMark', slice: null
    },
    {
        name: 'radio-over', what: 'the Remember Password check, Over frame, without its tick',
        swf: 'UI_0', symbol: 'a_LoginSplash', path: ['am_SavePass'], frame: 2, kind: 'composed', scale: 1,
        keep: (use) => use.name !== 'am_CheckMark', slice: null
    },
    {
        name: 'radio-on', what: 'the Remember Password check, Ready frame, ticked',
        swf: 'UI_0', symbol: 'a_LoginSplash', path: ['am_SavePass'], frame: 1, kind: 'composed', scale: 1,
        keep: () => true, slice: null
    },
    {
        name: 'radio-on-over', what: 'the Remember Password check, Over frame, ticked',
        swf: 'UI_0', symbol: 'a_LoginSplash', path: ['am_SavePass'], frame: 2, kind: 'composed', scale: 1,
        keep: () => true, slice: null
    },
    // The square check box of the Options window (a_Menu am_ProfaneFilter, the one GameUi.Check uses).
    {
        name: 'check', what: 'the Options window\'s Profanity Filter check box (am_ProfaneFilter), without its tick',
        swf: 'UI_4', symbol: 'a_Menu', path: ['am_MenuWrapper', 'am_ProfaneFilter'], frame: 1, kind: 'composed', scale: 2,
        keep: (use) => use.name !== 'am_CheckMark' && !isText(use), slice: null
    },
    {
        name: 'check-on', what: 'the Options window\'s Profanity Filter check box, ticked',
        swf: 'UI_4', symbol: 'a_Menu', path: ['am_MenuWrapper', 'am_ProfaneFilter'], frame: 1, kind: 'composed', scale: 2,
        keep: (use) => !isText(use), slice: null
    },
    // The status pill and its light.
    {
        name: 'pill', what: 'the dark stat plate the game puts numbers on (GameUi.Matte)',
        swf: 'UI_Library', symbol: '_DoodadStatMatte01', frame: 1, kind: 'symbol',
        slice: [0, 10, 0, 10]
    },
    {
        name: 'dot', what: 'the game\'s dot (UI_1 a_Dot), red: offline',
        swf: 'UI_1', symbol: 'a_Dot', frame: 1, kind: 'symbol', scale: 4, slice: null
    },
    {
        name: 'dot-on', what: 'the game\'s dot with its red and green swapped: online',
        swf: 'UI_1', symbol: 'a_Dot', frame: 1, kind: 'symbol', scale: 4, slice: null, tint: RED_TO_GREEN
    },
    // The menu: the rows of the game's right-click menu on a friend (a_FriendPopupOption).
    {
        name: 'menu-item', what: 'a row of the game\'s friend menu (a_FriendPopupOption), without its texts',
        swf: 'UI_1', symbol: 'a_FriendPopupOption', frame: 1, kind: 'composed',
        keep: (use) => !isText(use), slice: [3, 3, 3, 3]
    },
    {
        name: 'menu-item-over', what: 'a row of the game\'s friend menu, its hover frame, without its texts',
        swf: 'UI_1', symbol: 'a_FriendPopupOption', frame: 2, kind: 'composed',
        keep: (use) => !isText(use), slice: [3, 3, 3, 3]
    },
    // The light rim the game puts round a button under the pointer.
    {
        name: 'hover-rim', what: 'the cream rim the game lights round a button under the pointer (_ButtonFrameOver01)',
        swf: 'UI_Library', symbol: '_ButtonFrameOver01', frame: 1, kind: 'symbol',
        slice: [14, 14, 14, 14]
    }
];

/** The game's UI font (GameUi.as: HelveticaRounded LT Std Bd, UI_3 a_Font_GameUI), shipped in the kit. */
const FONT = { swf: 'UI_3', symbol: 'a_Font_GameUI', file: 'db-game-ui' };

// ---- tools -------------------------------------------------------------------------------------

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function ffdec(args) {
    execFileSync(JAVA, ['-jar', FFDEC].concat(args), { stdio: ['ignore', 'pipe', 'pipe'] });
}

function swfPath(key) {
    const file = path.join(CLIENT, SWFS[key]);
    if (!fs.existsSync(file)) {
        throw new Error(`Missing ${file}; set DB_CLIENT_DIR.`);
    }
    return file;
}

/** class name -> character id, from FFDec's symbol-class table. */
function symbolIds(key, temp) {
    const dir = path.join(temp, 'classes-' + key);
    if (!fs.existsSync(path.join(dir, 'symbols.csv'))) {
        ffdec(['-export', 'symbolClass', dir, swfPath(key)]);
    }
    const ids = {};
    for (const line of fs.readFileSync(path.join(dir, 'symbols.csv'), 'utf8').split(/\r?\n/)) {
        const match = /^(\d+);"(.*)"$/.exec(line.trim());
        if (match) {
            ids[match[2]] = match[1];
        }
    }
    return ids;
}

/** The folder FFDec exported character `id` into, under `dir`. */
function exportedDir(dir, id) {
    const name = fs.readdirSync(dir).find((entry) => entry === `DefineSprite_${id}` || entry.indexOf(`DefineSprite_${id}_`) === 0);
    if (!name) {
        throw new Error(`FFDec wrote nothing for character ${id} in ${dir}`);
    }
    return path.join(dir, name);
}

/** FFDec's SVG of every frame of sprite `id` (one export per sprite and run). */
function spriteSvgDir(key, id, temp) {
    const dir = path.join(temp, `svg-${key}-${id}`);
    if (!fs.existsSync(dir)) {
        ffdec(['-format', 'sprite:svg', '-selectid', id, '-export', 'sprite', dir, swfPath(key)]);
    }
    return exportedDir(dir, id);
}

/** FFDec's own PNG of every frame of symbol `id` at `scale`. */
function spritePngDir(key, id, scale, temp) {
    const dir = path.join(temp, `png-${key}-${id}-${scale}`);
    if (!fs.existsSync(dir)) {
        ffdec(['-zoom', String(scale), '-format', 'sprite:png', '-selectid', id, '-export', 'sprite', dir, swfPath(key)]);
    }
    return exportedDir(dir, id);
}

/** The top-level placements of an FFDec frame SVG, one per line, with what keep() needs. */
function placements(svg) {
    const lines = svg.split(/\r?\n/);
    return lines.map((line, index) => {
        if (!/^ {4}<use /.test(line)) {
            return null;
        }
        const attr = (name) => {
            const match = new RegExp(`\\s${name}="([^"]*)"`).exec(line);
            return match ? match[1] : null;
        };
        const matrix = (attr('transform') || '').match(/-?[\d.]+/g) || [1, 0, 0, 1, 0, 0];
        return {
            index,
            char: attr('ffdec:characterId'),
            href: attr('xlink:href') || '',
            name: attr('id'),
            tx: Number(matrix[4]),
            ty: Number(matrix[5])
        };
    }).filter(Boolean);
}

/** A named child's character id in an FFDec frame SVG of its parent. */
function childId(svg, name) {
    const use = placements(svg).find((entry) => entry.name === name);
    if (!use) {
        throw new Error(`No ${name} in the exported sprite`);
    }
    return use.char;
}

/** The SVG with only the kept placements, sized `scale` times, its art at the same place. */
function pruneSvg(svg, keep, scale) {
    const lines = svg.split(/\r?\n/);
    const drop = new Set(placements(svg).filter((use) => !keep(use)).map((use) => use.index));
    const kept = lines.filter((line, index) => !drop.has(index)).join('\n');
    const width = Number(/<svg[^>]*\swidth="([\d.]+)px"/.exec(kept)[1]);
    const height = Number(/<svg[^>]*\sheight="([\d.]+)px"/.exec(kept)[1]);
    const pixelsW = Math.ceil(width * scale);
    const pixelsH = Math.ceil(height * scale);
    const sized = kept.replace(/<svg([^>]*)\sheight="[\d.]+px"([^>]*)\swidth="[\d.]+px"/,
        `<svg$1 height="${pixelsH}px"$2 width="${pixelsW}px" viewBox="0 0 ${pixelsW / scale} ${pixelsH / scale}"`);
    if (sized === kept) {
        throw new Error('Unexpected SVG header from FFDec');
    }
    return { svg: sized, width: pixelsW, height: pixelsH, dropped: drop.size, kept: placements(svg).length - drop.size };
}

/** Edge draws `svgFile` at its own size on a transparent page and saves the PNG. */
function drawWithEdge(svgFile, width, height, outFile, temp) {
    const page = svgFile.replace(/\.svg$/, '.html');
    fs.writeFileSync(page, `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}img{display:block}</style></head>` +
        `<body><img src="${path.basename(svgFile)}" width="${width}" height="${height}"></body></html>`);
    execFileSync(EDGE, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
        '--force-device-scale-factor=1', '--default-background-color=00000000',
        `--user-data-dir=${path.join(temp, 'edge-profile')}`,
        `--window-size=${width},${height}`, `--screenshot=${outFile}`,
        'file:///' + page.replace(/\\/g, '/')
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const image = png.read(fs.readFileSync(outFile));
    if (image.width !== width || image.height !== height) {
        throw new Error(`Edge drew ${image.width}x${image.height}, wanted ${width}x${height}`);
    }
    return image;
}

/** Draws every piece into `dir`; returns the manifest entries. */
function buildPieces(dir, temp) {
    const ids = {};
    for (const key of new Set(PIECES.map((piece) => piece.swf))) {
        ids[key] = symbolIds(key, temp);
    }
    const entries = [];
    for (const piece of PIECES) {
        const id = ids[piece.swf][piece.symbol];
        if (!id) {
            throw new Error(`${piece.symbol} is not in ${SWFS[piece.swf]}`);
        }
        const scale = piece.scale || SCALE;
        let image;
        const source = { swf: SWFS[piece.swf], symbol: piece.symbol, id: Number(id), frame: piece.frame };
        if (piece.kind === 'symbol') {
            image = png.read(fs.readFileSync(path.join(spritePngDir(piece.swf, id, scale, temp), `${piece.frame}.png`)));
        } else {
            let spriteId = id;
            for (const name of piece.path || []) {
                const parent = fs.readFileSync(path.join(spriteSvgDir(piece.swf, spriteId, temp), '1.svg'), 'utf8');
                spriteId = childId(parent, name);
            }
            if (piece.path) {
                source.path = piece.path;
                source.childId = Number(spriteId);
            }
            const svg = fs.readFileSync(path.join(spriteSvgDir(piece.swf, spriteId, temp), `${piece.frame}.svg`), 'utf8');
            const pruned = pruneSvg(svg, piece.keep, scale);
            const work = path.join(temp, 'draw-' + piece.name);
            fs.mkdirSync(work, { recursive: true });
            // Beside FFDec's own files, so nothing the SVG names is out of reach.
            const svgFile = path.join(spriteSvgDir(piece.swf, spriteId, temp), `piece-${piece.name}.svg`);
            fs.writeFileSync(svgFile, pruned.svg);
            image = drawWithEdge(svgFile, pruned.width, pruned.height, path.join(work, 'edge.png'), temp);
            source.parts = { kept: pruned.kept, left_out: pruned.dropped };
        }
        image = png.crop(image, png.opaqueBounds(image));
        if (piece.tint) {
            image = piece.tint.matrix ? png.colorMatrix(image, piece.tint.matrix) : png.colorTransform(image, piece.tint);
            source.tint = piece.tint;
        }
        const bytes = png.write(image);
        const file = `${piece.name}.png`;
        fs.writeFileSync(path.join(dir, file), bytes);
        entries.push({
            file: `dbui/${file}`,
            what: piece.what,
            source,
            scale,
            width: image.width,
            height: image.height,
            slice: piece.slice ? piece.slice.map((value) => value * scale) : null,
            sha256: sha256(bytes)
        });
    }
    return entries;
}

/** Exports the game's UI font as WOFF (IE11) and TTF into `dir`; returns the manifest entries. */
function buildFont(dir, temp) {
    const id = symbolIds(FONT.swf, temp)[FONT.symbol];
    if (!id) {
        throw new Error(`${FONT.symbol} is not in ${SWFS[FONT.swf]}`);
    }
    const entries = [];
    for (const format of ['woff', 'ttf']) {
        const work = path.join(temp, 'font-' + format + '-' + path.basename(dir));
        ffdec(['-format', `font:${format}`, '-selectid', id, '-export', 'font', work, swfPath(FONT.swf)]);
        const made = fs.readdirSync(work).find((entry) => entry.toLowerCase().endsWith('.' + format));
        if (!made) {
            throw new Error(`FFDec wrote no ${format} font`);
        }
        const bytes = fs.readFileSync(path.join(work, made));
        fs.writeFileSync(path.join(dir, `${FONT.file}.${format}`), bytes);
        entries.push({
            file: `dbui/${FONT.file}.${format}`,
            what: 'the game\'s UI font, HelveticaRounded LT Std Bd (the font every game window uses)',
            source: { swf: SWFS[FONT.swf], symbol: FONT.symbol, id: Number(id) },
            sha256: sha256(bytes)
        });
    }
    return entries;
}

function sourceHashes() {
    const hashes = {};
    for (const key of Object.keys(SWFS)) {
        hashes[SWFS[key]] = sha256(fs.readFileSync(swfPath(key)));
    }
    return hashes;
}

// ---- checks ------------------------------------------------------------------------------------

/** Syntax IE11 (the HTA's engine) does not have. `css`: also looked for in a stylesheet. */
const IE11_MISSING = [
    { what: 'arrow function', test: /=>/ },
    { what: 'let / const', test: /(^|[^\w.$'"])(let|const)\s+[\w$[{]/ },
    { what: 'template string', test: /`/ },
    { what: 'class', test: /(^|[^\w.$'"-])class\s+[A-Z]\w*\s*(extends|\{)/ },
    { what: 'spread / rest', test: /\(\s*\.\.\.|,\s*\.\.\.|\[\s*\.\.\./ },
    { what: 'for...of', test: /for\s*\(\s*(var\s+)?\w+\s+of\s/ },
    { what: 'Promise / fetch', test: /\b(Promise|fetch)\s*\(/ },
    { what: 'CSS variable', test: /var\(--|--[\w-]+\s*:/, css: true },
    { what: 'flex / grid gap', test: /(^|[{;"\s])(row-|column-)?gap\s*:/, css: true },
    { what: 'CSS grid', test: /display\s*:\s*grid/, css: true },
    { what: 'object-fit', test: /object-fit/, css: true },
    { what: 'position: sticky', test: /position\s*:\s*sticky/, css: true },
    { what: 'CSS filter', test: /(^|[{;"\s])filter\s*:\s*(brightness|grayscale|blur|drop-shadow|contrast|saturate)/, css: true },
    { what: ':is / :where / :has', test: /:(is|where|has)\(/, css: true }
];

/** What IE11 lacks in a file, by line (comments and ui.js's picture data left out). */
function ie11Problems(code, label, cssOnly) {
    const problems = [];
    // Comments are not code; keep their line breaks so the line numbers stay right.
    const bare = code.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
    bare.split(/\r?\n/).forEach((line, index) => {
        if (/^var BG="data:/.test(line)) {
            return;
        }
        for (const rule of IE11_MISSING) {
            if ((!cssOnly || rule.css) && rule.test.test(line)) {
                problems.push(`${label} line ${index + 1}: ${rule.what}`);
            }
        }
    });
    return problems;
}

/** The kit files a stylesheet or ui.js names: url('x.png') / art('x') and the font files. */
function usedFiles(text) {
    const used = new Set();
    for (const match of text.matchAll(/\bart\('([\w-]+)'\)/g)) {
        used.add(`dbui/${match[1]}.png`);
    }
    for (const match of text.matchAll(/url\(['"]?(?:[^'")]*\/)?([\w-]+\.(png|woff|ttf))['"]?\)/g)) {
        used.add(`dbui/${match[1]}`);
    }
    return used;
}

/** Every border-image slice given to `name`: [[t, r, b, l], ...]. */
function slicesOf(text, name) {
    const found = [];
    const patterns = [
        new RegExp(`art\\('${name}'\\)\\+"\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)`, 'g'),
        new RegExp(`url\\(['"]?(?:[^'")]*/)?${name}\\.png['"]?\\)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)`, 'g')
    ];
    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
            found.push(match.slice(1, 5).map(Number));
        }
    }
    return found;
}

function verify(manifest, temp) {
    const failures = [];
    const notes = [];
    // 1. The game's art is still what the pieces were made from.
    const now = sourceHashes();
    for (const file of Object.keys(manifest.sources)) {
        if (now[file] !== manifest.sources[file]) {
            notes.push(`${file} changed since the pieces were made (the check below says whether they still match)`);
        }
    }
    // 2. The shipped files are the manifest's.
    for (const entry of manifest.pieces.concat(manifest.fonts)) {
        const file = path.join(ASSETS, entry.file);
        if (!fs.existsSync(file)) {
            failures.push(`missing ${entry.file}`);
        } else if (sha256(fs.readFileSync(file)) !== entry.sha256) {
            failures.push(`${entry.file} is not the file the manifest records`);
        }
    }
    // 3. Drawn again from the game's files, the pieces come out the same.
    const fresh = path.join(temp, 'fresh');
    fs.mkdirSync(fresh, { recursive: true });
    for (const entry of buildPieces(fresh, temp)) {
        const shipped = path.join(ASSETS, entry.file);
        if (!fs.existsSync(shipped)) {
            failures.push(`${entry.file} is a piece but is not shipped`);
            continue;
        }
        const diff = png.compare(png.read(fs.readFileSync(shipped)), png.read(fs.readFileSync(path.join(fresh, path.basename(entry.file)))));
        if (!diff.sameSize || diff.changedShare > 0.002) {
            failures.push(`${entry.file} no longer matches the game's art (${diff.sameSize ? (diff.changedShare * 100).toFixed(2) + '% of pixels differ' : 'size differs'})`);
        } else if (diff.maxDelta > 0) {
            notes.push(`${entry.file} drew within ${diff.maxDelta}/255 of the shipped copy`);
        }
    }
    for (const entry of buildFont(fresh, temp)) {
        const recorded = manifest.fonts.find((font) => font.file === entry.file);
        if (!recorded || recorded.sha256 !== entry.sha256) {
            failures.push(`${entry.file} no longer matches the game's font`);
        }
    }
    // 4. dbui.css and ui.js use only manifest pieces, with the manifest's slices.
    const ui = fs.readFileSync(UI_JS, 'utf8');
    const css = fs.existsSync(KIT_CSS) ? fs.readFileSync(KIT_CSS, 'utf8') : '';
    if (!css) {
        failures.push('launcher-assets\\dbui\\dbui.css is missing');
    }
    if (!/dbui\/dbui\.css/.test(ui)) {
        failures.push('ui.js does not load dbui/dbui.css');
    }
    const known = new Set(manifest.pieces.concat(manifest.fonts).map((entry) => entry.file));
    const used = new Set([...usedFiles(ui), ...usedFiles(css)]);
    for (const file of used) {
        if (!known.has(file)) {
            failures.push(`${file} is used but is not in the manifest`);
        }
    }
    let slicesChecked = 0;
    for (const entry of manifest.pieces.concat(manifest.fonts)) {
        if (!used.has(entry.file)) {
            notes.push(`${entry.file} is shipped but nothing uses it`);
        }
        if (!entry.slice) {
            continue;
        }
        const name = path.basename(entry.file, '.png');
        for (const slice of slicesOf(ui, name).concat(slicesOf(css, name))) {
            slicesChecked++;
            if (slice.join() !== entry.slice.join()) {
                failures.push(`${entry.file} is sliced ${slice.join(' ')}; the manifest says ${entry.slice.join(' ')}`);
            }
        }
    }
    notes.push(`${slicesChecked} border-image slices in dbui.css and ui.js checked against the manifest`);
    // 5. The installer ships the kit.
    const iss = fs.readFileSync(INSTALLER, 'utf8');
    for (const [pattern, words] of [
        [/launcher-assets\\dbui\\\*\.png/, 'launcher-assets\\dbui\\*.png'],
        [/launcher-assets\\dbui\\db-game-ui\.\*/, 'launcher-assets\\dbui\\db-game-ui.*'],
        [/launcher-assets\\dbui\\dbui\.css/, 'launcher-assets\\dbui\\dbui.css']
    ]) {
        if (!pattern.test(iss)) {
            failures.push(`installer\\DBRevamped.iss does not ship ${words}`);
        }
    }
    // 6. IE11 can run ui.js and use dbui.css.
    for (const problem of ie11Problems(ui, 'ui.js', false).concat(ie11Problems(css, 'dbui.css', true))) {
        failures.push(problem);
    }
    // 7. The previews load the same ui.js and the kit page the same dbui.css.
    const preview = path.join(ASSETS, 'preview-signin.html');
    if (!fs.existsSync(preview) || !/src="ui\.js"/.test(fs.readFileSync(preview, 'utf8'))) {
        failures.push('launcher-assets\\preview-signin.html is missing or does not load ui.js');
    }
    return { failures, notes };
}

// ---- main --------------------------------------------------------------------------------------

function main() {
    const checking = process.argv.includes('--verify');
    for (const [what, file] of [['Java', JAVA], ['FFDec', FFDEC], ['Edge', EDGE]]) {
        if (!fs.existsSync(file)) {
            throw new Error(`No ${what} at ${file}`);
        }
    }
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbui-'));
    try {
        if (checking) {
            if (!fs.existsSync(MANIFEST)) {
                throw new Error('No launcher-assets\\dbui\\pieces.json: run node dbui\\build.js first.');
            }
            const result = verify(JSON.parse(fs.readFileSync(MANIFEST, 'utf8')), temp);
            for (const note of result.notes) {
                console.log('note: ' + note);
            }
            for (const failure of result.failures) {
                console.log('FAIL: ' + failure);
            }
            console.log(result.failures.length ? `${result.failures.length} problem(s).` : 'OK: the DB UI kit matches the game\'s art, dbui.css and ui.js.');
            process.exitCode = result.failures.length ? 1 : 0;
            return;
        }
        fs.mkdirSync(OUT, { recursive: true });
        const pieces = buildPieces(OUT, temp);
        const fonts = buildFont(OUT, temp);
        const manifest = {
            note: 'Written by node dbui\\build.js from the game client\'s UI files; check with --verify. Slices are in the PNG\'s pixels (the art at `scale` times its own size).',
            sources: sourceHashes(),
            pieces,
            fonts
        };
        fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
        for (const entry of pieces) {
            console.log(`${entry.file}  ${entry.width}x${entry.height}  ${entry.slice ? 'slice ' + entry.slice.join(' ') : 'whole'}`);
        }
        for (const entry of fonts) {
            console.log(entry.file);
        }
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

main();
