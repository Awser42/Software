function jpegDimensions(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) return null;
      return {height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5)};
    }
    offset += length;
  }
  return null;
}
function imageQuality(bytes) {
  const size = bytes?.width && bytes?.height ? {width: bytes.width, height: bytes.height} : jpegDimensions(bytes);
  if (!size) throw new Error('Image dimensions could not be verified');
  if (Math.min(size.width, size.height) < 96 || Math.max(size.width, size.height) < 256) {
    return {...size, accepted: false, reason: `Small graphic filtered (${size.width}×${size.height}); likely an icon or thumbnail`};
  }
  return {...size, accepted: true};
}
module.exports = {jpegDimensions, imageQuality};
