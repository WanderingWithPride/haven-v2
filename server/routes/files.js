const express = require('express');
const path = require('path');
const fs = require('fs');
const { getMimeType, formatBytes } = require('../utils/scanner');

let multer;
try { multer = require('multer'); } catch (e) { multer = null; }

module.exports = function (config) {
    const router = express.Router();
    const rootPath = config.paths.root || '/sdcard';

    // Ensure path stays within root
    function safePath(requestedPath) {
        const resolved = path.resolve(rootPath, requestedPath || '');
        if (!resolved.startsWith(rootPath)) return rootPath;
        return resolved;
    }

    // List directory contents
    router.get('/', (req, res) => {
        try {
            const dirPath = safePath(req.query.path || '');
            if (!fs.existsSync(dirPath)) return res.status(404).json({ error: 'Directory not found' });

            const stat = fs.statSync(dirPath);
            if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' });

            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const items = entries
                .filter(e => !e.name.startsWith('.'))
                .map(entry => {
                    const fullPath = path.join(dirPath, entry.name);
                    try {
                        const s = fs.statSync(fullPath);
                        return {
                            name: entry.name,
                            path: path.relative(rootPath, fullPath),
                            isDirectory: entry.isDirectory(),
                            size: entry.isFile() ? s.size : null,
                            sizeFormatted: entry.isFile() ? formatBytes(s.size) : null,
                            modified: s.mtime,
                            ext: entry.isFile() ? path.extname(entry.name).slice(1).toLowerCase() : null
                        };
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean)
                .sort((a, b) => {
                    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });

            const relativeCurrent = path.relative(rootPath, dirPath);
            const parentPath = relativeCurrent ? path.dirname(relativeCurrent) : null;

            res.json({
                currentPath: relativeCurrent || '',
                parentPath: parentPath === '.' ? '' : parentPath,
                isRoot: dirPath === rootPath,
                items
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Download file
    router.get('/download', (req, res) => {
        try {
            const filePath = safePath(req.query.path);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) return res.status(400).json({ error: 'Cannot download a directory' });

            const ext = path.extname(filePath).slice(1).toLowerCase();
            res.set('Content-Type', getMimeType(ext));
            res.set('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
            res.set('Content-Length', stat.size);
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Preview file (inline)
    router.get('/preview', (req, res) => {
        try {
            const filePath = safePath(req.query.path);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

            const ext = path.extname(filePath).slice(1).toLowerCase();
            res.set('Content-Type', getMimeType(ext));
            res.set('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Upload file
    if (multer) {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                const dest = safePath(req.body.path || '');
                fs.mkdirSync(dest, { recursive: true });
                cb(null, dest);
            },
            filename: (req, file, cb) => cb(null, file.originalname)
        });
        const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 * 1024 } }); // 5GB limit

        router.post('/upload', upload.array('files'), (req, res) => {
            res.json({
                success: true,
                files: req.files.map(f => ({ name: f.originalname, size: f.size }))
            });
        });
    }

    // Create directory
    router.post('/mkdir', (req, res) => {
        try {
            const dirPath = safePath(req.body.path);
            if (fs.existsSync(dirPath)) return res.status(400).json({ error: 'Already exists' });
            fs.mkdirSync(dirPath, { recursive: true });
            res.json({ success: true, path: path.relative(rootPath, dirPath) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Delete file/directory
    router.delete('/', (req, res) => {
        try {
            const targetPath = safePath(req.query.path);
            if (targetPath === rootPath) return res.status(400).json({ error: 'Cannot delete root' });
            if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'Not found' });

            const stat = fs.statSync(targetPath);
            if (stat.isDirectory()) {
                fs.rmSync(targetPath, { recursive: true });
            } else {
                fs.unlinkSync(targetPath);
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Rename/move
    router.post('/rename', (req, res) => {
        try {
            const { from, to } = req.body;
            const fromPath = safePath(from);
            const toPath = safePath(to);
            if (!fs.existsSync(fromPath)) return res.status(404).json({ error: 'Source not found' });
            fs.renameSync(fromPath, toPath);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
