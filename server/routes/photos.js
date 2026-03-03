const express = require('express');
const path = require('path');
const fs = require('fs');
const { scanDirectory, decodeFileId } = require('../utils/scanner');
const { generateThumbnail } = require('../utils/thumbnail');

module.exports = function (config) {
    const router = express.Router();
    let library = [];
    let lastScan = 0;

    const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif'];
    const cachePath = path.join(__dirname, '..', config.thumbnails.cachePath);

    async function scanPhotos() {
        const now = Date.now();
        if (library.length > 0 && now - lastScan < 60000) return library;
        library = scanDirectory(config.paths.photos, IMAGE_EXTS);
        lastScan = now;
        return library;
    }

    // List all photos
    router.get('/', async (req, res) => {
        try {
            const photos = await scanPhotos();
            // Group by date
            const groups = {};
            for (const photo of photos) {
                const date = new Date(photo.modified).toISOString().split('T')[0];
                if (!groups[date]) groups[date] = [];
                groups[date].push(photo);
            }
            res.json({
                total: photos.length,
                photos,
                groups: Object.entries(groups)
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .map(([date, items]) => ({ date, count: items.length, photos: items }))
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get thumbnail
    router.get('/thumb/:id', async (req, res) => {
        try {
            const filePath = decodeFileId(req.params.id);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

            const thumbPath = await generateThumbnail(
                filePath, cachePath, config.thumbnails.size, config.thumbnails.quality
            );

            if (thumbPath && fs.existsSync(thumbPath)) {
                res.set('Content-Type', 'image/webp');
                res.set('Cache-Control', 'public, max-age=86400');
                fs.createReadStream(thumbPath).pipe(res);
            } else {
                // Fallback: serve original
                res.sendFile(filePath);
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get full image
    router.get('/full/:id', (req, res) => {
        try {
            const filePath = decodeFileId(req.params.id);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
            res.set('Cache-Control', 'public, max-age=3600');
            res.sendFile(filePath);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Force rescan
    router.post('/scan', async (req, res) => {
        lastScan = 0;
        library = [];
        const photos = await scanPhotos();
        res.json({ success: true, total: photos.length });
    });

    return router;
};
