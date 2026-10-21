const fs = require('node:fs/promises');
const zlib = require('node:zlib');
const {imageQuality} = require('./media-quality');

const LIMIT = 30 * 1024 * 1024;
const crcTable = Array.from({length: 256}, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(bytes);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}
async function readAt(file, length, offset) {
  const bytes = Buffer.alloc(length);
  const {bytesRead} = await file.read(bytes, 0, length, offset);
  if (bytesRead !== length) throw new Error('Incomplete ZIP record');
  return bytes;
}

// Repairs legacy card previews from the original product JPEG in the archive.
// This reads bounded records directly; it never extracts names to the disk.
async function readArchivePreview(filename) {
  let file;
  try {
    file = await fs.open(filename, 'r');
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 22 || stat.size > 0xffffffff) return null;
    const tailLength = Math.min(stat.size, 65557);
    const tail = await readAt(file, tailLength, stat.size - tailLength);
    let eocd = -1;
    for (let index = tail.length - 22; index >= 0; index--) {
      if (tail.readUInt32LE(index) === 0x06054b50 && index + 22 + tail.readUInt16LE(index + 20) === tail.length) {eocd = index;break;}
    }
    if (eocd < 0 || tail.readUInt16LE(eocd + 4) || tail.readUInt16LE(eocd + 6)) return null;
    const count = tail.readUInt16LE(eocd + 10);
    const size = tail.readUInt32LE(eocd + 12), offset = tail.readUInt32LE(eocd + 16);
    if (!count || count > 5000 || count !== tail.readUInt16LE(eocd + 8) || size > 4*1024*1024 || offset + size > stat.size - tailLength + eocd) return null;
    const central = await readAt(file, size, offset);
    const candidates = [];
    for (let position = 0, index = 0; index < count; index++) {
      if (position + 46 > central.length || central.readUInt32LE(position) !== 0x02014b50) return null;
      const nameLength = central.readUInt16LE(position + 28), extraLength = central.readUInt16LE(position + 30), commentLength = central.readUInt16LE(position + 32);
      const next = position + 46 + nameLength + extraLength + commentLength;
      if (next > central.length) return null;
      const name = central.toString('utf8', position + 46, position + 46 + nameLength);
      const flags = central.readUInt16LE(position + 8), method = central.readUInt16LE(position + 10);
      const compressed = central.readUInt32LE(position + 20), length = central.readUInt32LE(position + 24), start = central.readUInt32LE(position + 42);
      if (/^Images\/[^/\\]+\.jpg$/i.test(name) && !(flags & 1) && [0, 8].includes(method) && length > 0 && length <= LIMIT && compressed > 0 && compressed <= LIMIT && start + 30 < offset) {
        const rank = /^Images\/main-/i.test(name) ? 0 : /^Images\/variation-/i.test(name) ? 1 : 2;
        candidates.push({name, rank, flags, method, compressed, length, start, crc: central.readUInt32LE(position + 16), index});
      }
      position = next;
    }
    candidates.sort((left, right) => left.rank - right.rank || left.index - right.index);
    let readBudget = 64 * 1024 * 1024;
    for (const candidate of candidates.slice(0, 24)) {
      if (candidate.compressed > readBudget) continue;
      readBudget -= candidate.compressed;
      const local = await readAt(file, 30, candidate.start);
      if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(6) & 1 || local.readUInt16LE(8) !== candidate.method) continue;
      const dataOffset = candidate.start + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      if (dataOffset + candidate.compressed > offset) continue;
      const compressed = await readAt(file, candidate.compressed, dataOffset);
      let bytes;
      try {bytes = candidate.method === 0 ? compressed : zlib.inflateRawSync(compressed, {maxOutputLength: Math.min(LIMIT, candidate.length)});} catch {continue;}
      if (bytes.length !== candidate.length || crc32(bytes) !== candidate.crc) continue;
      try {if (imageQuality(bytes).accepted) return bytes;} catch {}
    }
  } catch {}
  finally {await file?.close().catch(() => {});}
  return null;
}
module.exports = {readArchivePreview};
