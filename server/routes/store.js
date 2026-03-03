const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// Helper: HTTP(S) GET that follows redirects (up to 5)
function httpsGet(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        proto.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
                const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
                return httpsGet(next, maxRedirects - 1).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// Download a file with progress tracking using Node.js built-in https
function downloadFile(url, dest, dlId, activeDownloads, maxRedirects = 5) {
    const fileName = path.basename(dest);
    const proto = url.startsWith('https') ? https : http;

    proto.get(url, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (maxRedirects <= 0) {
                activeDownloads.set(dlId, { status: 'failed', progress: 0, output: 'Too many redirects' });
                return;
            }
            const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
            return downloadFile(next, dest, dlId, activeDownloads, maxRedirects - 1);
        }

        if (res.statusCode !== 200) {
            res.resume();
            activeDownloads.set(dlId, { status: 'failed', progress: 0, output: `HTTP error ${res.statusCode} for ${url}` });
            return;
        }

        const totalSize = parseInt(res.headers['content-length'], 10) || 0;
        let downloaded = 0;
        const fileStream = fs.createWriteStream(dest);

        res.on('data', (chunk) => {
            downloaded += chunk.length;
            const pct = totalSize > 0 ? Math.round((downloaded / totalSize) * 100) : 0;
            const dlMB = (downloaded / (1024 * 1024)).toFixed(1);
            const totalMB = totalSize > 0 ? (totalSize / (1024 * 1024)).toFixed(1) : '?';
            activeDownloads.set(dlId, {
                status: 'downloading',
                progress: pct,
                output: `${fileName}\n${dlMB} MB / ${totalMB} MB (${pct}%)`
            });
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
            fileStream.close();
            activeDownloads.set(dlId, {
                status: 'complete', progress: 100,
                output: `Downloaded: ${fileName}\nSaved to: ${dest}`
            });
        });

        fileStream.on('error', (err) => {
            fs.unlink(dest, () => { });
            activeDownloads.set(dlId, { status: 'failed', progress: 0, output: `Write error: ${err.message}` });
        });

        res.on('error', (err) => {
            fs.unlink(dest, () => { });
            activeDownloads.set(dlId, { status: 'failed', progress: 0, output: `Download error: ${err.message}` });
        });
    }).on('error', (err) => {
        activeDownloads.set(dlId, { status: 'failed', progress: 0, output: `Connection error: ${err.message}` });
    });
}

module.exports = function (config) {
    const router = express.Router();
    const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
    if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

    // Active downloads tracker
    const activeDownloads = new Map();

    // Catalog uses directory URLs + filename patterns for auto-discovery
    // 'dirUrl' = Kiwix directory, 'pattern' = regex to match the right file
    router.get('/catalog', (req, res) => {
        res.json({
            categories: [
                {
                    name: 'Wikipedia & Knowledge',
                    icon: '📚',
                    items: [
                        {
                            id: 'wiki-en-simple', name: 'Wikipedia Simple English', desc: 'Simple English Wikipedia — great starting point', size: '~600 MB',
                            dirUrl: 'https://download.kiwix.org/zim/wikipedia/', pattern: 'wikipedia_en_simple_all_maxi_\\d{4}-\\d{2}\\.zim', type: 'zim'
                        },
                        {
                            id: 'wiki-en-nopic', name: 'Wikipedia English (No Pics)', desc: 'Full English Wikipedia, text only — best value', size: '~10 GB',
                            dirUrl: 'https://download.kiwix.org/zim/wikipedia/', pattern: 'wikipedia_en_all_nopic_\\d{4}-\\d{2}\\.zim', type: 'zim'
                        },
                        {
                            id: 'wikibooks', name: 'Wikibooks English', desc: 'Open textbooks and manuals', size: '~400 MB',
                            dirUrl: 'https://download.kiwix.org/zim/wikibooks/', pattern: 'wikibooks_en_all_maxi_\\d{4}-\\d{2}\\.zim', type: 'zim'
                        },
                        {
                            id: 'wikihow', name: 'WikiHow English', desc: 'How-to guides for everything', size: '~5 GB',
                            dirUrl: 'https://download.kiwix.org/zim/other/', pattern: 'wikihow_en_maxi_\\d{4}-\\d{2}\\.zim', type: 'zim'
                        },
                        {
                            id: 'stackexchange', name: 'StackOverflow', desc: 'Programming Q&A archive', size: '~8 GB',
                            dirUrl: 'https://download.kiwix.org/zim/stack_exchange/', pattern: 'stackoverflow\\.com_en_all_\\d{4}-\\d{2}\\.zim', type: 'zim'
                        }
                    ]
                },
                {
                    name: 'LLM Models',
                    icon: '🧠',
                    items: [
                        { id: 'llm-tinyllama', name: 'TinyLlama 1.1B', desc: 'Ultra-light, basic conversations', size: '637 MB', cmd: 'ollama pull tinyllama', type: 'ollama' },
                        { id: 'llm-phi3-mini', name: 'Phi-3 Mini 3.8B', desc: 'Good reasoning, small size', size: '2.2 GB', cmd: 'ollama pull phi3:mini', type: 'ollama' },
                        { id: 'llm-gemma2', name: 'Gemma 2 2B', desc: 'Google, efficient and smart', size: '1.6 GB', cmd: 'ollama pull gemma2:2b', type: 'ollama' },
                        { id: 'llm-llama3', name: 'Llama 3.2 3B', desc: 'Meta, strong general purpose', size: '2.0 GB', cmd: 'ollama pull llama3.2:3b', type: 'ollama' },
                        { id: 'llm-mistral', name: 'Mistral 7B', desc: 'Best quality, needs 8GB+ RAM', size: '4.1 GB', cmd: 'ollama pull mistral', type: 'ollama' },
                        { id: 'llm-meditron', name: 'Meditron 7B', desc: 'Medical-specialized LLM', size: '4.1 GB', cmd: 'ollama pull meditron', type: 'ollama' }
                    ]
                },
                {
                    name: 'Survival Knowledge Packs',
                    icon: '🛡️',
                    items: [
                        { id: 'gutenberg', name: 'Project Gutenberg Top 100', desc: '100 classic books (EPUB)', size: '200 MB', url: 'https://www.gutenberg.org/', type: 'manual' },
                        {
                            id: 'medref', name: 'WHO Medical Reference', desc: 'Essential medicines + first aid', size: '~50 MB',
                            dirUrl: 'https://download.kiwix.org/zim/other/', pattern: 'who_en_all_\\d{4}-\\d{2}\\.zim', type: 'zim'
                        },
                        { id: 'survival-fm', name: 'US Army Survival Manual', desc: 'FM 21-76 field survival guide', size: '15 MB', url: 'https://archive.org/', type: 'manual' }
                    ]
                },
                {
                    name: 'Maps & Navigation',
                    icon: '🗺️',
                    items: [
                        { id: 'osm-tiles', name: 'Offline Map Tiles', desc: 'Download tiles via OpenMapTiles', size: 'Varies', url: 'https://openmaptiles.org/', type: 'manual' }
                    ]
                }
            ]
        });
    });

    // Discover the latest ZIM file URL from a Kiwix directory listing
    async function discoverZimUrl(dirUrl, pattern) {
        const html = await httpsGet(dirUrl);

        // Find all .zim file links matching the pattern
        const regex = new RegExp(`href="(${pattern})"`, 'g');
        const matches = [];
        let m;
        while ((m = regex.exec(html)) !== null) {
            matches.push(m[1]);
        }

        if (matches.length === 0) {
            // Broader search — find all .zim links
            const simpleRegex = /href="([^"]*\.zim)"/g;
            const allZims = [];
            while ((m = simpleRegex.exec(html)) !== null) {
                allZims.push(m[1]);
            }
            if (allZims.length === 0) {
                throw new Error(`No .zim files found at ${dirUrl}`);
            }
            // Filter by the base name (part before the date)
            const baseName = pattern.split('\\d')[0].replace(/\\/g, '');
            const filtered = allZims.filter(z => z.startsWith(baseName));
            if (filtered.length > 0) {
                filtered.sort();
                return dirUrl + filtered[filtered.length - 1];
            }
            throw new Error(`No ZIM matching "${baseName}*" at ${dirUrl}. Available: ${allZims.slice(0, 5).join(', ')}`);
        }

        // Sort and pick the latest (last alphabetically = newest date)
        matches.sort();
        return dirUrl + matches[matches.length - 1];
    }

    // Download endpoint
    router.post('/download', async (req, res) => {
        const { id, url, dirUrl, pattern, cmd, type } = req.body;

        if (type === 'ollama') {
            const dlId = id;
            activeDownloads.set(dlId, { status: 'downloading', progress: 0, output: '' });

            const proc = exec(cmd, { timeout: 3600000 });
            let output = '';
            proc.stdout?.on('data', (d) => {
                output += d;
                activeDownloads.set(dlId, { status: 'downloading', progress: parseProgress(output), output });
            });
            proc.stderr?.on('data', (d) => {
                output += d;
                activeDownloads.set(dlId, { status: 'downloading', progress: parseProgress(output), output });
            });
            proc.on('close', (code) => {
                activeDownloads.set(dlId, { status: code === 0 ? 'complete' : 'failed', progress: 100, output });
            });

            res.json({ success: true, downloadId: dlId, message: 'Model download started' });

        } else if (type === 'zim') {
            const dlId = id;
            activeDownloads.set(dlId, { status: 'discovering', progress: 0, output: 'Finding latest version...' });

            try {
                // Step 1: Discover actual download URL
                let downloadUrl;
                if (dirUrl && pattern) {
                    // Auto-discover from directory listing
                    activeDownloads.set(dlId, { status: 'downloading', progress: 0, output: 'Discovering latest file from Kiwix...' });
                    downloadUrl = await discoverZimUrl(dirUrl, pattern);
                } else if (url) {
                    downloadUrl = url;
                } else {
                    activeDownloads.set(dlId, { status: 'failed', progress: 0, output: 'No URL or directory configured' });
                    return res.status(400).json({ error: 'No download URL' });
                }

                const fileName = downloadUrl.split('/').pop();
                const dest = path.join(DOWNLOADS_DIR, fileName);
                activeDownloads.set(dlId, { status: 'downloading', progress: 0, output: `Downloading: ${fileName}` });

                // Step 2: Download using Node.js built-in https (no curl/wget needed)
                downloadFile(downloadUrl, dest, dlId, activeDownloads);

                res.json({ success: true, downloadId: dlId, message: `Downloading: ${fileName}` });

            } catch (err) {
                activeDownloads.set(dlId, { status: 'failed', progress: 0, output: err.message });
                res.json({ success: true, downloadId: dlId, message: err.message });
            }

        } else if (type === 'manual') {
            if (url) res.json({ success: true, downloadId: id, message: 'Open in browser', url });
            else res.status(400).json({ error: 'No URL' });
        } else {
            res.status(400).json({ error: 'Invalid download type' });
        }
    });

    // Check download progress
    router.get('/progress/:id', (req, res) => {
        const dl = activeDownloads.get(req.params.id);
        if (!dl) return res.json({ status: 'not_found' });
        res.json(dl);
    });

    // List downloaded content
    router.get('/downloaded', (req, res) => {
        try {
            const files = fs.readdirSync(DOWNLOADS_DIR)
                .filter(f => !f.startsWith('.'))
                .map(f => {
                    const stat = fs.statSync(path.join(DOWNLOADS_DIR, f));
                    return { name: f, size: stat.size, date: stat.mtime };
                });
            res.json({ files });
        } catch (err) {
            res.json({ files: [] });
        }
    });

    return router;
};

function parseProgress(output) {
    const pctMatch = output.match(/(\d+)%/g);
    if (pctMatch) {
        const last = pctMatch[pctMatch.length - 1];
        return parseInt(last);
    }
    return 0;
}
