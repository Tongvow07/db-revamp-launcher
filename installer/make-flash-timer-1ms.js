// Makes flashplayer.exe ask Windows for a 1 ms timer when it starts.
//
// Flash schedules its frames on the Windows timer, which ticks every 15.625 ms unless a program
// asks for finer timing (timeBeginPeriod). The projector imports timeBeginPeriod but never asks, so
// a frame that takes a little longer than one tick waits for the next one: live frame times came
// out 16, 32 or 0 ms apart (2026-10-24, a 240 Hz screen) -- the stutter of every camera pan. With a
// 1 ms timer a 17 ms frame is shown at 17 ms.
//
// The patch: 20 bytes of new code in the unused tail of .text, made the entry point.
//
//   call $+5 ; pop eax                  eax = this code's own address (works under ASLR)
//   add eax, <slot - here>              eax = WINMM!timeBeginPeriod's delay-load IAT slot
//   push 1 ; call dword ptr [eax]       timeBeginPeriod(1); the delay-load helper fills the slot
//   jmp <original entry point>
//
// .text's VirtualSize grows to cover the code; the header checksum is recomputed. Running it on a
// patched file changes nothing. Run after make-flash-large-address-aware.ps1 (the file is unsigned
// by then).
//   node installer\make-flash-timer-1ms.js [path\to\flashplayer.exe]
'use strict';
const fs = require('fs');
const path = require('path');

const exe = path.resolve(process.argv[2] || path.join(__dirname, '..', 'flashplayer.exe'));
const b = fs.readFileSync(exe);
const pe = b.readUInt32LE(0x3c);
if (b.readUInt32LE(pe) !== 0x4550 || b.readUInt16LE(pe + 4) !== 0x14c || b.readUInt16LE(pe + 24) !== 0x10b) {
    throw new Error(`${exe} is not a 32-bit PE32 program`);
}
const opt = pe + 24;
const optSize = b.readUInt16LE(pe + 20);
const sectionCount = b.readUInt16LE(pe + 6);
const entryAt = opt + 16;
const checksumAt = opt + 64;
const sections = [];
for (let i = 0; i < sectionCount; i++) {
    const o = opt + optSize + i * 40;
    sections.push({
        header: o,
        name: b.toString('latin1', o, o + 8).replace(/\0+$/, ''),
        vs: b.readUInt32LE(o + 8), va: b.readUInt32LE(o + 12), rs: b.readUInt32LE(o + 16), rp: b.readUInt32LE(o + 20)
    });
}
const rvaToOffset = (rva) => {
    for (const s of sections) {
        if (rva >= s.va && rva < s.va + Math.max(s.vs, s.rs)) return rva - s.va + s.rp;
    }
    throw new Error(`rva ${rva.toString(16)} is in no section`);
};
const cString = (rva) => b.toString('latin1', rvaToOffset(rva), rvaToOffset(rva) + 64).split('\0')[0];

// WINMM!timeBeginPeriod's slot in the delay-load import table (directory 13, RVA-based entries).
function delaySlot(dllName, fnName) {
    const dirRva = b.readUInt32LE(opt + 96 + 13 * 8);
    if (!dirRva) throw new Error('no delay-load imports');
    for (let o = rvaToOffset(dirRva); ; o += 32) {
        const attributes = b.readUInt32LE(o);
        const nameRva = b.readUInt32LE(o + 4);
        if (!nameRva) break;
        if ((attributes & 1) !== 1) throw new Error('delay-load table is not RVA-based');
        if (cString(nameRva).toLowerCase() !== dllName) continue;
        const iat = b.readUInt32LE(o + 12);
        const names = b.readUInt32LE(o + 16);
        for (let i = 0; ; i++) {
            const thunk = b.readUInt32LE(rvaToOffset(names) + i * 4);
            if (!thunk) break;
            if (!(thunk & 0x80000000) && cString(thunk + 2) === fnName) return iat + i * 4;
        }
    }
    throw new Error(`${dllName}!${fnName} is not delay-imported`);
}

const text = sections.find((s) => s.name === '.text');
const entry = b.readUInt32LE(entryAt);
const PROLOGUE = Buffer.from([0xe8, 0, 0, 0, 0, 0x58, 0x05]);
if (b.subarray(rvaToOffset(entry), rvaToOffset(entry) + PROLOGUE.length).equals(PROLOGUE)) {
    console.log(`Already asks for a 1 ms timer: ${exe}`);
    process.exit(0);
}

const slot = delaySlot('winmm.dll', 'timeBeginPeriod');
const caveRva = (text.va + text.vs + 15) & ~15;
const code = Buffer.alloc(20);
PROLOGUE.copy(code, 0);                              // call $+5; pop eax; add eax, imm32
code.writeInt32LE(slot - (caveRva + 5), 7);          // slot - (address of the pop)
code[11] = 0x6a; code[12] = 0x01;                    // push 1
code[13] = 0xff; code[14] = 0x10;                    // call dword ptr [eax]
code[15] = 0xe9;                                     // jmp rel32
code.writeInt32LE(entry - (caveRva + 20), 16);

const caveOffset = caveRva - text.va + text.rp;
if (caveRva + code.length - text.va > text.rs) throw new Error('no room at the end of .text');
if (!b.subarray(caveOffset, caveOffset + code.length).every((byte) => byte === 0)) throw new Error('the end of .text is not free');
const next = sections.filter((s) => s.va > text.va).sort((l, r) => l.va - r.va)[0];
if (next && caveRva + code.length > next.va) throw new Error('the code would run into the next section');

code.copy(b, caveOffset);
b.writeUInt32LE(caveRva + code.length - text.va, text.header + 8);   // .text VirtualSize
b.writeUInt32LE(caveRva, entryAt);

// PE header checksum: 16-bit one's-complement sum with the checksum field taken as 0, plus length.
b.writeUInt32LE(0, checksumAt);
let sum = 0;
for (let i = 0; i + 1 < b.length; i += 2) {
    sum += b.readUInt16LE(i);
    sum = (sum & 0xffff) + (sum >>> 16);
}
if (b.length & 1) { sum += b[b.length - 1]; sum = (sum & 0xffff) + (sum >>> 16); }
sum = (sum & 0xffff) + (sum >>> 16);
b.writeUInt32LE((sum + b.length) >>> 0, checksumAt);

fs.writeFileSync(exe, b);
console.log(`Asks for a 1 ms timer at start (entry ${entry.toString(16)} -> ${caveRva.toString(16)}, slot ${slot.toString(16)}): ${exe}`);
