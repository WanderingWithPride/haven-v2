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

// Download a file with progress tracking and pause/resume support
function downloadFile(url, dest, dlId, activeDownloads, activeProcesses, maxRedirects = 5) {
    const fileName = path.basename(dest);
    const proto = url.startsWith('https') ? https : http;

    // Check existing file size for resuming
    let startByte = 0;
    if (fs.existsSync(dest)) {
        startByte = fs.statSync(dest).size;
    }

    const options = {
        headers: {}
    };
    if (startByte > 0) {
        options.headers['Range'] = `bytes=${startByte}-`;
    }

    const req = proto.get(url, options, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (maxRedirects <= 0) {
                activeDownloads.set(dlId, { ...activeDownloads.get(dlId), status: 'failed', progress: 0, output: 'Too many redirects' });
                return;
            }
            const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
            return downloadFile(next, dest, dlId, activeDownloads, activeProcesses, maxRedirects - 1);
        }

        // 416 means Range Not Satisfiable (file is already fully downloaded based on our startByte)
        if (res.statusCode === 416) {
            res.resume();
            activeProcesses.delete(dlId);
            activeDownloads.set(dlId, {
                ...activeDownloads.get(dlId),
                status: 'complete', progress: 100,
                output: `Downloaded: ${fileName}\nSaved to: ${dest}`
            });
            return;
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
            res.resume();
            activeDownloads.set(dlId, { ...activeDownloads.get(dlId), status: 'failed', progress: 0, output: `HTTP error ${res.statusCode} for ${url}` });
            return;
        }

        // If it's 200 (server doesn't support Range), we must start over
        if (res.statusCode === 200 && startByte > 0) {
            startByte = 0;
        }

        const contentLength = parseInt(res.headers['content-length'], 10) || 0;
        const totalSize = startByte + contentLength;
        let downloaded = startByte;

        // Use 'a' flag to append if we are resuming
        const flags = res.statusCode === 206 ? 'a' : 'w';
        const fileStream = fs.createWriteStream(dest, { flags });

        res.on('data', (chunk) => {
            downloaded += chunk.length;
            const pct = totalSize > 0 ? Math.round((downloaded / totalSize) * 100) : 0;
            const dlMB = (downloaded / (1024 * 1024)).toFixed(1);
            const totalMB = totalSize > 0 ? (totalSize / (1024 * 1024)).toFixed(1) : '?';
            const dl = activeDownloads.get(dlId) || {};

            // Allow caller to transition to 'paused' without being overwritten
            if (dl.status === 'paused' || dl.status === 'cancelled') {
                req.destroy();
                return;
            }

            activeDownloads.set(dlId, {
                ...dl,
                status: 'downloading',
                progress: pct,
                progressBytes: downloaded,
                totalBytes: totalSize,
                output: `${fileName}\n${dlMB} MB / ${totalMB} MB (${pct}%)`
            });
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
            fileStream.close();
            activeProcesses.delete(dlId);
            const dl = activeDownloads.get(dlId) || {};
            if (dl.status !== 'cancelled' && dl.status !== 'paused') {
                activeDownloads.set(dlId, {
                    ...dl,
                    status: 'complete', progress: 100,
                    output: `Downloaded: ${fileName}\nSaved to: ${dest}`
                });
            }
        });

        fileStream.on('error', (err) => {
            activeProcesses.delete(dlId);
            activeDownloads.set(dlId, { ...activeDownloads.get(dlId), status: 'failed', progress: 0, output: `Write error: ${err.message}` });
        });

        res.on('error', (err) => {
            activeProcesses.delete(dlId);
            if (err.message !== 'aborted') {
                activeDownloads.set(dlId, { ...activeDownloads.get(dlId), status: 'failed', progress: 0, output: `Download error: ${err.message}` });
            }
        });
    });

    req.on('error', (err) => {
        activeProcesses.delete(dlId);
        const dl = activeDownloads.get(dlId) || {};
        if (dl.status !== 'cancelled' && dl.status !== 'paused') {
            activeDownloads.set(dlId, { ...dl, status: 'failed', progress: 0, output: `Connection error: ${err.message}` });
        }
    });

    // Store request reference for cancellation/pausing
    activeProcesses.set(dlId, { type: 'request', req, dest, url, maxRedirects });
}

module.exports = function (config) {
    const router = express.Router();
    const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
    if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

    // Active downloads tracker
    const activeDownloads = new Map();
    // Track processes/requests for cancellation
    const activeProcesses = new Map();

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
                        { id: 'gutenberg', name: 'Project Gutenberg', desc: 'classic books (EPUB)', size: 'Varies', url: 'https://www.gutenberg.org/', type: 'manual' },
                        {
                            id: 'medref', name: 'Medical Wikipedia (mdwiki)', desc: 'Medical articles, drugs, first aid', size: '~2 GB',
                            dirUrl: 'https://download.kiwix.org/zim/other/', pattern: 'mdwiki_en_all_maxi_\\d{4}-\\d{2}\\.zim', type: 'zim'
                        },
                        {
                            id: 'survival-fm', name: 'US Army Survival Manual', desc: 'FM 21-76 field survival guide', size: '~150 MB',
                            url: 'https://archive.org/details/FM2176USARMYSURVIVALMANUAL/', type: 'manual'
                        }
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
            activeDownloads.set(dlId, { status: 'downloading', progress: 0, output: '', type: 'ollama', modelName: cmd.replace('ollama pull ', '') });

            const proc = exec(cmd, { timeout: 3600000 });
            activeProcesses.set(dlId, { type: 'process', proc });
            let output = '';
            proc.stdout?.on('data', (d) => {
                output += d;
                const dl = activeDownloads.get(dlId) || {};
                activeDownloads.set(dlId, { ...dl, status: 'downloading', progress: parseProgress(output), output });
            });
            proc.stderr?.on('data', (d) => {
                output += d;
                const dl = activeDownloads.get(dlId) || {};
                activeDownloads.set(dlId, { ...dl, status: 'downloading', progress: parseProgress(output), output });
            });
            proc.on('close', (code) => {
                activeProcesses.delete(dlId);
                const dl = activeDownloads.get(dlId) || {};
                if (dl.status !== 'cancelled') {
                    activeDownloads.set(dlId, { ...dl, status: code === 0 ? 'complete' : 'failed', progress: code === 0 ? 100 : dl.progress, output });
                }
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
                activeDownloads.set(dlId, { status: 'downloading', progress: 0, output: `Downloading: ${fileName}`, type: 'zim', dest });

                // Step 2: Download using Node.js built-in https (no curl/wget needed)
                downloadFile(downloadUrl, dest, dlId, activeDownloads, activeProcesses);

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

    // Pause an active download
    router.post('/pause/:id', (req, res) => {
        const dlId = req.params.id;
        const proc = activeProcesses.get(dlId);
        const dl = activeDownloads.get(dlId);

        if (!dl || dl.type !== 'zim') {
            return res.status(400).json({ error: 'Only file downloads can be paused' });
        }

        if (proc && proc.type === 'request' && proc.req) {
            // Set state to paused, req connection will be destroyed by data event listener
            activeDownloads.set(dlId, { ...dl, status: 'paused', output: `Paused: ${path.basename(proc.dest)}\nPartially downloaded (${dl.progress}%)` });
            proc.req.destroy();

            // Keep the process metadata so we can resume it easily later without client resending full details
            activeProcesses.set(dlId, { ...proc, req: null });
        }
        res.json({ success: true, message: 'Download paused' });
    });

    // Resume a paused download
    router.post('/resume/:id', (req, res) => {
        const dlId = req.params.id;
        const proc = activeProcesses.get(dlId);
        const dl = activeDownloads.get(dlId);

        if (!dl || dl.type !== 'zim' || dl.status !== 'paused') {
            return res.status(400).json({ error: 'Download is not paused or cannot be resumed' });
        }

        if (proc && proc.url && proc.dest) {
            activeDownloads.set(dlId, { ...dl, status: 'downloading', output: `Resuming: ${path.basename(proc.dest)}` });
            downloadFile(proc.url, proc.dest, dlId, activeDownloads, activeProcesses, proc.maxRedirects || 5);
            res.json({ success: true, message: 'Download resumed' });
        } else {
            res.status(400).json({ error: 'Resume context lost' });
        }
    });

    // Cancel an active download
    router.post('/cancel/:id', (req, res) => {
        const dlId = req.params.id;
        const proc = activeProcesses.get(dlId);
        const dl = activeDownloads.get(dlId);

        if (proc) {
            if (proc.type === 'process' && proc.proc) {
                proc.proc.kill('SIGTERM');
            } else if (proc.type === 'request' && proc.req) {
                proc.req.destroy();
            }
            activeProcesses.delete(dlId);
        }

        // Delete partial file
        if (dl && dl.dest) {
            try { fs.unlinkSync(dl.dest); } catch (e) { }
        } else if (proc && proc.dest) {
            try { fs.unlinkSync(proc.dest); } catch (e) { }
        }

        activeDownloads.set(dlId, { status: 'cancelled', progress: 0, output: 'Download cancelled', type: dl?.type });
        res.json({ success: true });
    });

    // Delete a downloaded item
    router.delete('/delete/:id', (req, res) => {
        const dlId = req.params.id;
        const dl = activeDownloads.get(dlId);

        if (dl && dl.type === 'zim' && dl.dest) {
            try {
                if (fs.existsSync(dl.dest)) fs.unlinkSync(dl.dest);
                activeDownloads.delete(dlId);
                return res.json({ success: true, message: 'ZIM file deleted' });
            } catch (e) {
                return res.status(500).json({ error: e.message });
            }
        } else if (dl && dl.type === 'ollama' && dl.modelName) {
            exec(`ollama rm ${dl.modelName}`, { timeout: 30000 }, (err) => {
                activeDownloads.delete(dlId);
                if (err) return res.json({ success: true, message: 'Removed from store (ollama rm may have failed)' });
                res.json({ success: true, message: `Model ${dl.modelName} deleted` });
            });
        } else {
            // Try to find and delete any matching ZIM file
            const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.includes(dlId));
            files.forEach(f => { try { fs.unlinkSync(path.join(DOWNLOADS_DIR, f)); } catch (e) { } });
            activeDownloads.delete(dlId);
            res.json({ success: true, message: 'Deleted' });
        }
    });

    // Check what's already downloaded (survives server restart)
    router.get('/status', (req, res) => {
        const results = {};

        // Check ZIM files in downloads dir
        const zimPatterns = {
            'wiki-en-simple': 'wikipedia_en_simple',
            'wiki-en-nopic': 'wikipedia_en_all_nopic',
            'wikibooks': 'wikibooks_en',
            'wikihow': 'wikihow_en',
            'stackexchange': 'stackoverflow',
            'medref': 'mdwiki_en'
        };

        try {
            const files = fs.readdirSync(DOWNLOADS_DIR);
            for (const [itemId, prefix] of Object.entries(zimPatterns)) {
                const match = files.find(f => f.startsWith(prefix) && f.endsWith('.zim'));
                if (match) {
                    const filePath = path.join(DOWNLOADS_DIR, match);
                    try {
                        const stat = fs.statSync(filePath);
                        results[itemId] = {
                            status: 'complete',
                            fileName: match,
                            size: stat.size,
                            dest: filePath,
                            type: 'zim'
                        };
                        // Restore to activeDownloads so delete works
                        if (!activeDownloads.has(itemId)) {
                            activeDownloads.set(itemId, {
                                status: 'complete', progress: 100, type: 'zim', dest: filePath,
                                output: `Downloaded: ${match}`
                            });
                        }
                    } catch (e) { }
                }
            }
        } catch (e) { }

        // Check installed ollama models (non-blocking, with fallback)
        const ollamaModels = {
            'llm-tinyllama': 'tinyllama',
            'llm-phi3-mini': 'phi3:mini',
            'llm-gemma2': 'gemma2:2b',
            'llm-llama3': 'llama3.2:3b',
            'llm-mistral': 'mistral',
            'llm-meditron': 'meditron'
        };

        try {
            exec('ollama list', { timeout: 3000 }, (err, stdout) => {
                if (!err && stdout) {
                    for (const [itemId, modelName] of Object.entries(ollamaModels)) {
                        if (stdout.includes(modelName.split(':')[0])) {
                            results[itemId] = {
                                status: 'complete',
                                modelName,
                                type: 'ollama'
                            };
                            if (!activeDownloads.has(itemId)) {
                                activeDownloads.set(itemId, {
                                    status: 'complete', progress: 100, type: 'ollama', modelName,
                                    output: `Model ${modelName} installed`
                                });
                            }
                        }
                    }
                }
                res.json(results);
            });
        } catch (e) {
            // If exec itself fails, still return ZIM results
            res.json(results);
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

    // Fetch exact download sizes dynamically
    router.get('/sizes', async (req, res) => {
        const sizes = {};

        // 1. Fetch ZIM sizes from Kiwix
        const zimDirs = [
            { id: 'wiki-en-simple', url: 'https://download.kiwix.org/zim/wikipedia/', pattern: 'wikipedia_en_simple_all_maxi_\\d{4}-\\d{2}\\.zim' },
            { id: 'wiki-en-nopic', url: 'https://download.kiwix.org/zim/wikipedia/', pattern: 'wikipedia_en_all_nopic_\\d{4}-\\d{2}\\.zim' },
            { id: 'wikibooks', url: 'https://download.kiwix.org/zim/wikibooks/', pattern: 'wikibooks_en_all_maxi_\\d{4}-\\d{2}\\.zim' },
            { id: 'wikihow', url: 'https://download.kiwix.org/zim/other/', pattern: 'wikihow_en_maxi_\\d{4}-\\d{2}\\.zim' },
            { id: 'stackexchange', url: 'https://download.kiwix.org/zim/stackexchange/', pattern: 'stackoverflow\\.com_en_all_\\d{4}-\\d{2}\\.zim' },
            { id: 'medref', url: 'https://download.kiwix.org/zim/other/', pattern: 'mdwiki_en_all_maxi_\\d{4}-\\d{2}\\.zim' }
        ];

        // Group by directory to minimize HTTP requests
        const dirs = [...new Set(zimDirs.map(z => z.url))];
        for (const dirUrl of dirs) {
            try {
                const html = await httpsGet(dirUrl);
                const itemsInDir = zimDirs.filter(z => z.url === dirUrl);
                for (const item of itemsInDir) {
                    try {
                        // Look for the exact filename and capture the size on the same line
                        // Example: <a href="wikibooks_en_all_maxi_2026-01.zim">...</a> 2026-01-28 02:06 5.1G
                        const regex = new RegExp(`href="(${item.pattern})"[^>]*>.*?</a>\\s+\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}\\s+([0-9.]+[KMG])`, 'g');
                        let latestMatch = null;
                        let latestSize = null;
                        let m;
                        while ((m = regex.exec(html)) !== null) {
                            latestMatch = m[1];
                            latestSize = m[2]; // e.g., "5.1G" or "800M"
                        }

                        if (!latestSize) {
                            // Fallback regex if date format differs
                            const fallbackRegex = new RegExp(`href="(${item.pattern})"[^>]*>.*?</a>.*?([0-9.]+[KMG])(?:\\s*<|\\n|$)`, 'gi');
                            while ((m = fallbackRegex.exec(html)) !== null) {
                                latestSize = m[2];
                            }
                        }

                        if (latestSize) {
                            // Convert K/M/G to standard MB/GB display
                            let formatted = latestSize.replace('G', ' GB').replace('M', ' MB').replace('K', ' KB');
                            sizes[item.id] = formatted;
                        }
                    } catch (e) { console.error(`Failed to parse size for ${item.id}`); }
                }
            } catch (e) {
                console.error(`Failed to fetch Kiwix directory: ${dirUrl}`);
            }
        }

        // 2. Fetch Ollama model sizes from registry API
        const ollamaModels = {
            'llm-tinyllama': 'tinyllama:latest',
            'llm-phi3-mini': 'phi3:mini',
            'llm-gemma2': 'gemma2:2b',
            'llm-llama3': 'llama3.2:3b',
            'llm-mistral': 'mistral:latest',
            'llm-meditron': 'meditron:latest'
        };

        for (const [id, modelTag] of Object.entries(ollamaModels)) {
            try {
                const [model, tag] = modelTag.split(':');
                const url = `https://registry.ollama.ai/v2/library/${model}/manifests/${tag}`;
                const manifestText = await httpsGet(url, { 'Accept': 'application/vnd.docker.distribution.manifest.v2+json' });
                const manifest = JSON.parse(manifestText);
                if (manifest.config && manifest.config.size) {
                    let totalBytes = manifest.config.size;
                    if (manifest.layers) {
                        totalBytes += manifest.layers.reduce((acc, layer) => acc + layer.size, 0);
                    }
                    sizes[id] = (totalBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
                }
            } catch (e) {
                // Ignore API parsing errors
            }
        }

        res.json(sizes);
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
