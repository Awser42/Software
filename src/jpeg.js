// Use Chromium's existing image codecs so the portable package needs no extra
// native imaging dependency. Decode first; a .jpg suffix or MIME is not proof.
async function convertToJpeg(page, bytes, mime = '') {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('Empty image');
  if (bytes.length > 30 * 1024 * 1024) throw new Error('Image exceeds 30 MB');
  const encoded = await page.evaluate(async ({base64, mime}) => {
    const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    let type = mime;
    if (raw[0] === 0xff && raw[1] === 0xd8 && raw[2] === 0xff) type = 'image/jpeg';
    else if (raw[0] === 0x89 && raw[1] === 0x50 && raw[2] === 0x4e && raw[3] === 0x47) type = 'image/png';
    else if (String.fromCharCode(...raw.slice(0, 4)) === 'RIFF' && String.fromCharCode(...raw.slice(8, 12)) === 'WEBP') type = 'image/webp';
    const bitmap = await createImageBitmap(new Blob([raw], {type}));
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 64000000) throw new Error('Image dimensions exceed the 64 megapixel limit');
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, 0, 0);
      let pixelHash = null;
      if (globalThis.crypto?.subtle) {
        const digest = await crypto.subtle.digest('SHA-256', ctx.getImageData(0, 0, bitmap.width, bitmap.height).data);
        pixelHash = `${bitmap.width}x${bitmap.height}:` + Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      }
      const blobBase64 = blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('JPEG conversion failed'));
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
      // Keep original JPEG bytes. Other formats are encoded only once at the
      // original dimensions; the smaller card preview is a separate image.
      const jpeg = type === 'image/jpeg' ? base64 : await blobBase64(await canvas.convertToBlob({type: 'image/jpeg', quality: 0.95}));
      const scale = Math.min(1, 480 / bitmap.width, 360 / bitmap.height);
      const thumbnail = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
      const previewContext = thumbnail.getContext('2d');
      previewContext.fillStyle = '#fff'; previewContext.fillRect(0, 0, thumbnail.width, thumbnail.height);
      previewContext.drawImage(bitmap, 0, 0, thumbnail.width, thumbnail.height);
      const preview = 'data:image/jpeg;base64,' + await blobBase64(await thumbnail.convertToBlob({type: 'image/jpeg', quality: 0.9}));
      return {jpeg, width: bitmap.width, height: bitmap.height, pixelHash, preview};
    } finally { bitmap.close(); }
  }, {base64: bytes.toString('base64'), mime});
  const result = Buffer.from(encoded.jpeg, 'base64');
  if (result[0] !== 0xff || result[1] !== 0xd8 || result[2] !== 0xff) throw new Error('Image codec did not produce a JPEG');
  result.width = encoded.width; result.height = encoded.height;
  result.pixelHash = encoded.pixelHash; result.preview = encoded.preview;
  return result;
}
module.exports = {convertToJpeg};
