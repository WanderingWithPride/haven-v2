const fs = require('fs');
const path = require('path');

let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.warn('[Thumbnails] sharp not available, thumbnails will be disabled');
    sharp = null;
}

/**
 * Generate a thumbnail for an image file
 */
async function generateThumbnail(inputPath, cachePath, size = 300, quality = 80) {
    if (!sharp) return null;

    const hash = Buffer.from(inputPath).toString('base64url');
    const thumbPath = path.join(cachePath, `${hash}.webp`);

    // Return cached thumbnail if it exists
    if (fs.existsSync(thumbPath)) {
        return thumbPath;
    }

    // Ensure cache directory exists
    fs.mkdirSync(cachePath, { recursive: true });

    try {
        await sharp(inputPath)
            .resize(size, size, { fit: 'cover', position: 'center' })
            .webp({ quality })
            .toFile(thumbPath);
        return thumbPath;
    } catch (err) {
        console.error(`Thumbnail error for ${inputPath}:`, err.message);
        return null;
    }
}

module.exports = { generateThumbnail };
