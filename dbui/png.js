// A small PNG reader and writer for the DB UI build (Node's zlib only, no packages): enough for the
// 8-bit pictures FFDec and Edge write. read() gives { width, height, data } with data as RGBA bytes.
'use strict';
const zlib = require('zlib');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function read(buffer) {
    if (!buffer.slice(0, 8).equals(SIGNATURE)) {
        throw new Error('not a PNG');
    }
    let offset = 8;
    let header = null;
    let palette = null;
    let transparency = null;
    const parts = [];
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const body = buffer.slice(offset + 8, offset + 8 + length);
        offset += 12 + length;
        if (type === 'IHDR') {
            header = {
                width: body.readUInt32BE(0),
                height: body.readUInt32BE(4),
                depth: body[8],
                color: body[9],
                interlace: body[12]
            };
        } else if (type === 'PLTE') {
            palette = body;
        } else if (type === 'tRNS') {
            transparency = body;
        } else if (type === 'IDAT') {
            parts.push(body);
        } else if (type === 'IEND') {
            break;
        }
    }
    if (!header || header.depth !== 8 || header.interlace !== 0 || !(header.color in CHANNELS)) {
        throw new Error('unsupported PNG (8-bit, not interlaced only)');
    }
    const { width, height, color } = header;
    const channels = CHANNELS[color];
    const stride = width * channels;
    const raw = zlib.inflateSync(Buffer.concat(parts));
    const rows = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const out = y * stride;
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? rows[out + x - channels] : 0;
            const up = y > 0 ? rows[out - stride + x] : 0;
            const corner = y > 0 && x >= channels ? rows[out - stride + x - channels] : 0;
            let value = line[x];
            if (filter === 1) value += left;
            else if (filter === 2) value += up;
            else if (filter === 3) value += (left + up) >> 1;
            else if (filter === 4) value += paeth(left, up, corner);
            rows[out + x] = value & 255;
        }
    }
    const data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const s = i * channels;
        let r, g, b, a = 255;
        if (color === 6) { r = rows[s]; g = rows[s + 1]; b = rows[s + 2]; a = rows[s + 3]; }
        else if (color === 2) { r = rows[s]; g = rows[s + 1]; b = rows[s + 2]; }
        else if (color === 4) { r = g = b = rows[s]; a = rows[s + 1]; }
        else if (color === 0) { r = g = b = rows[s]; }
        else {
            const index = rows[s];
            r = palette[index * 3]; g = palette[index * 3 + 1]; b = palette[index * 3 + 2];
            a = transparency && index < transparency.length ? transparency[index] : 255;
        }
        data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
    }
    return { width, height, data };
}

function chunk(type, body) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.slice(4), body])) >>> 0, 0);
    return Buffer.concat([head, body, crc]);
}

/** RGBA to PNG bytes. Each row uses the filter that leaves the smallest sum, as most encoders do. */
function write(image) {
    const { width, height, data } = image;
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    const candidate = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        let best = null;
        let bestScore = Infinity;
        let bestFilter = 0;
        for (let filter = 0; filter <= 4; filter++) {
            let score = 0;
            for (let x = 0; x < stride; x++) {
                const value = data[y * stride + x];
                const left = x >= 4 ? data[y * stride + x - 4] : 0;
                const up = y > 0 ? data[(y - 1) * stride + x] : 0;
                const corner = y > 0 && x >= 4 ? data[(y - 1) * stride + x - 4] : 0;
                let out = value;
                if (filter === 1) out = value - left;
                else if (filter === 2) out = value - up;
                else if (filter === 3) out = value - ((left + up) >> 1);
                else if (filter === 4) out = value - paeth(left, up, corner);
                out &= 255;
                candidate[x] = out;
                score += out < 128 ? out : 256 - out;
            }
            if (score < bestScore) {
                bestScore = score;
                bestFilter = filter;
                best = Buffer.from(candidate);
            }
        }
        raw[y * (stride + 1)] = bestFilter;
        best.copy(raw, y * (stride + 1) + 1);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
        SIGNATURE,
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

/** The smallest box holding every pixel more opaque than `threshold`: { x, y, width, height }. */
function opaqueBounds(image, threshold = 0) {
    const { width, height, data } = image;
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > threshold) {
                if (x < left) left = x;
                if (x > right) right = x;
                if (y < top) top = y;
                if (y > bottom) bottom = y;
            }
        }
    }
    if (right < 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function crop(image, box) {
    const data = Buffer.alloc(box.width * box.height * 4);
    for (let y = 0; y < box.height; y++) {
        image.data.copy(data, y * box.width * 4, ((box.y + y) * image.width + box.x) * 4, ((box.y + y) * image.width + box.x + box.width) * 4);
    }
    return { width: box.width, height: box.height, data };
}

/**
 * Flash's ColorTransform on every pixel: channel * multiplier + offset, clamped. `t` is
 * { r, g, b, a, ro, go, bo, ao } (multipliers default 1, offsets 0).
 */
function colorTransform(image, t) {
    const out = Buffer.from(image.data);
    const m = [t.r ?? 1, t.g ?? 1, t.b ?? 1, t.a ?? 1];
    const o = [t.ro ?? 0, t.go ?? 0, t.bo ?? 0, t.ao ?? 0];
    for (let i = 0; i < out.length; i += 4) {
        for (let c = 0; c < 4; c++) {
            out[i + c] = Math.max(0, Math.min(255, Math.round(out[i + c] * m[c] + o[c])));
        }
    }
    return { width: image.width, height: image.height, data: out };
}

/** How far apart two pictures are: { sameSize, maxDelta, changedShare } (changed: any channel off by more than 8). */
function compare(a, b) {
    if (a.width !== b.width || a.height !== b.height) {
        return { sameSize: false, maxDelta: 255, changedShare: 1 };
    }
    let maxDelta = 0;
    let changed = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        let pixel = 0;
        for (let c = 0; c < 4; c++) {
            pixel = Math.max(pixel, Math.abs(a.data[i + c] - b.data[i + c]));
        }
        maxDelta = Math.max(maxDelta, pixel);
        if (pixel > 8) changed++;
    }
    return { sameSize: true, maxDelta, changedShare: changed / (a.width * a.height) };
}

/**
 * Flash's ColorMatrixFilter on every pixel: `m` is 4 rows of 5 (r, g, b, a multipliers and an
 * offset in 0..255), clamped.
 */
function colorMatrix(image, m) {
    const out = Buffer.from(image.data);
    for (let i = 0; i < out.length; i += 4) {
        const src = [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
        for (let row = 0; row < 4; row++) {
            const value = m[row * 5] * src[0] + m[row * 5 + 1] * src[1] + m[row * 5 + 2] * src[2] + m[row * 5 + 3] * src[3] + m[row * 5 + 4];
            out[i + row] = Math.max(0, Math.min(255, Math.round(value)));
        }
    }
    return { width: image.width, height: image.height, data: out };
}

module.exports = { read, write, opaqueBounds, crop, colorTransform, colorMatrix, compare };
