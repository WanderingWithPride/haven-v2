const express = require('express');
const path = require('path');
const fs = require('fs');
const { scanDirectory, decodeFileId, getMimeType } = require('../utils/scanner');

let mm;
try { mm = require('music-metadata'); } catch (e) { mm = null; }

module.exports = function (config) {
    const router = express.Router();
    let library = [];
    let lastScan = 0;

    const AUDIO_EXTS = ['flac', 'mp3', 'ogg', 'wav', 'aac', 'm4a', 'wma', 'opus'];

    async function scanLibrary() {
        const now = Date.now();
        if (library.length > 0 && now - lastScan < 60000) return library;

        const files = scanDirectory(config.paths.music, AUDIO_EXTS);

        // Enrich with metadata if music-metadata is available
        if (mm) {
            for (const file of files) {
                try {
                    const metadata = await mm.parseFile(file.path, { duration: true });
                    file.title = metadata.common.title || path.parse(file.name).name;
                    file.artist = metadata.common.artist || 'Unknown Artist';
                    file.album = metadata.common.album || 'Unknown Album';
                    file.year = metadata.common.year || null;
                    file.track = metadata.common.track?.no || null;
                    file.duration = metadata.format.duration || 0;
                    file.bitrate = metadata.format.bitrate || 0;
                    file.sampleRate = metadata.format.sampleRate || 0;
                    file.format = metadata.format.codec || file.ext.toUpperCase();
                    file.hasCover = metadata.common.picture && metadata.common.picture.length > 0;
                } catch (err) {
                    file.title = path.parse(file.name).name;
                    file.artist = 'Unknown Artist';
                    file.album = 'Unknown Album';
                    file.duration = 0;
                    file.format = file.ext.toUpperCase();
                    file.hasCover = false;
                }
            }
        } else {
            for (const file of files) {
                file.title = path.parse(file.name).name;
                file.artist = 'Unknown Artist';
                file.album = 'Unknown Album';
                file.duration = 0;
                file.format = file.ext.toUpperCase();
                file.hasCover = false;
            }
        }

        library = files;
        lastScan = now;
        return library;
    }

    // List all music
    router.get('/', async (req, res) => {
        try {
            const lib = await scanLibrary();
            // Group by album
            const albums = {};
            for (const track of lib) {
                const key = track.album || 'Unknown Album';
                if (!albums[key]) albums[key] = { name: key, artist: track.artist, tracks: [] };
                albums[key].tracks.push(track);
            }
            res.json({
                total: lib.length,
                tracks: lib,
                albums: Object.values(albums)
            });
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Stream audio file
    router.get('/stream/:id', (req, res) => {
        try {
            const filePath = decodeFileId(req.params.id, config.paths.music);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

            const stat = fs.statSync(filePath);
            const ext = path.extname(filePath).slice(1).toLowerCase();
            const mime = getMimeType(ext);

            // Support range requests for seeking
            const range = req.headers.range;
            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                const chunkSize = end - start + 1;

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': mime
                });
                fs.createReadStream(filePath, { start, end }).pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': stat.size,
                    'Content-Type': mime
                });
                fs.createReadStream(filePath).pipe(res);
            }
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get album cover
    router.get('/cover/:id', async (req, res) => {
        try {
            const filePath = decodeFileId(req.params.id, config.paths.music);
            if (!fs.existsSync(filePath) || !mm) {
                return res.status(404).json({ error: 'Cover not available' });
            }

            const metadata = await mm.parseFile(filePath);
            const picture = metadata.common.picture?.[0];
            if (!picture) return res.status(404).json({ error: 'No embedded cover' });

            res.set('Content-Type', picture.format);
            res.send(picture.data);
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Force rescan
    router.post('/scan', async (req, res) => {
        lastScan = 0;
        library = [];
        const lib = await scanLibrary();
        res.json({ success: true, total: lib.length });
    });

    return router;
};
