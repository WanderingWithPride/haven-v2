const express = require('express');
const path = require('path');
const fs = require('fs');
const { scanDirectory, decodeFileId } = require('../utils/scanner');
const { generateThumbnail } = require('../utils/thumbnail');

module.exports = function (config) {
    const router = express.Router();
    let library = [];
    let lastScan = 0;

    const EBOOK_EXTS = ['epub', 'pdf', 'mobi', 'azw3', 'txt', 'fb2', 'djvu'];
    const cachePath = path.join(__dirname, '..', config.thumbnails.cachePath);

    async function scanEbooks() {
        const now = Date.now();
        if (library.length > 0 && now - lastScan < 60000) return library;

        const files = scanDirectory(config.paths.ebooks, EBOOK_EXTS);
        for (const file of files) {
            file.title = path.parse(file.name).name
                .replace(/[-_]/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
            file.format = file.ext.toUpperCase();
        }

        library = files;
        lastScan = now;
        return library;
    }

    // List all ebooks
    router.get('/', async (req, res) => {
        try {
            const books = await scanEbooks();
            res.json({
                total: books.length,
                books
            });
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Serve ebook file (for reader)
    router.get('/read/:id', (req, res) => {
        try {
            const filePath = decodeFileId(req.params.id, config.paths.ebooks);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.epub': 'application/epub+zip',
                '.pdf': 'application/pdf',
                '.mobi': 'application/x-mobipocket-ebook',
                '.txt': 'text/plain'
            };

            res.set('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            res.set('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get ebook cover (extract from EPUB if possible, or generate thumbnail)
    router.get('/cover/:id', async (req, res) => {
        try {
            const filePath = decodeFileId(req.params.id, config.paths.ebooks);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

            // For now, return a placeholder. EPUB cover extraction could be added later.
            res.status(404).json({ error: 'Cover not available' });
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Force rescan
    router.post('/scan', async (req, res) => {
        lastScan = 0;
        library = [];
        const books = await scanEbooks();
        res.json({ success: true, total: books.length });
    });

    return router;
};
