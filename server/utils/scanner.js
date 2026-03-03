const fs = require('fs');
const path = require('path');

/**
 * Recursively scan a directory for files matching given extensions
 */
function scanDirectory(dirPath, extensions = [], recursive = true) {
    const results = [];
    if (!fs.existsSync(dirPath)) return results;

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory() && recursive) {
                results.push(...scanDirectory(fullPath, extensions, recursive));
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase().slice(1);
                if (extensions.length === 0 || extensions.includes(ext)) {
                    const stat = fs.statSync(fullPath);
                    results.push({
                        id: Buffer.from(fullPath).toString('base64url'),
                        name: entry.name,
                        path: fullPath,
                        relativePath: fullPath,
                        ext: ext,
                        size: stat.size,
                        modified: stat.mtime,
                        created: stat.birthtime
                    });
                }
            }
        }
    } catch (err) {
        console.error(`Scan error for ${dirPath}:`, err.message);
    }
    return results;
}

/**
 * Decode a base64url file ID back to a file path
 */
function decodeFileId(id) {
    return Buffer.from(id, 'base64url').toString('utf-8');
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get MIME type from extension
 */
function getMimeType(ext) {
    const mimeTypes = {
        // Audio
        'flac': 'audio/flac', 'mp3': 'audio/mpeg', 'ogg': 'audio/ogg',
        'wav': 'audio/wav', 'aac': 'audio/aac', 'm4a': 'audio/mp4',
        // Video
        'mp4': 'video/mp4', 'mkv': 'video/x-matroska', 'webm': 'video/webm',
        'avi': 'video/x-msvideo', 'mov': 'video/quicktime',
        // Images
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp',
        // Documents
        'pdf': 'application/pdf', 'epub': 'application/epub+zip',
        'txt': 'text/plain', 'html': 'text/html', 'css': 'text/css',
        'js': 'application/javascript', 'json': 'application/json',
        // Archives
        'zip': 'application/zip', 'tar': 'application/x-tar',
        'gz': 'application/gzip'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = { scanDirectory, decodeFileId, formatBytes, getMimeType };
