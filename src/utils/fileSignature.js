const fs = require('fs/promises');

const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  'application/pdf': (b) => b.toString('ascii', 0, 5) === '%PDF-',
};

// The client controls the declared mime type, so check the actual file header too.
async function matchesSignature(filePath, mimeType) {
  const check = SIGNATURES[mimeType];
  if (!check) return false;

  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    await handle.read(buffer, 0, 12, 0);
    return check(buffer);
  } finally {
    await handle.close();
  }
}

async function removeFiles(paths) {
  await Promise.all(paths.map((p) => fs.unlink(p).catch(() => {})));
}

module.exports = { matchesSignature, removeFiles, ALLOWED_MIME_TYPES: Object.keys(SIGNATURES) };
