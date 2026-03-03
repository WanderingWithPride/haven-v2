const express = require('express');

let fetch;
try { fetch = require('node-fetch'); } catch (e) { fetch = null; }

module.exports = function (config) {
    const router = express.Router();
    const kiwixPort = config.services.kiwix.port || 8889;
    const kiwixBase = `http://localhost:${kiwixPort}`;

    // Search Wikipedia
    router.get('/search', async (req, res) => {
        try {
            if (!fetch) return res.status(500).json({ error: 'node-fetch not installed' });
            const query = req.query.q;
            if (!query) return res.status(400).json({ error: 'Query parameter "q" required' });

            const response = await fetch(`${kiwixBase}/search?pattern=${encodeURIComponent(query)}&pageLength=20`);
            const html = await response.text();

            // Parse search results from Kiwix HTML
            const results = [];
            const regex = /<a[^>]*href="\/([^"]*)"[^>]*>([^<]*)<\/a>/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                if (match[1] && !match[1].startsWith('search') && !match[1].startsWith('skin')) {
                    results.push({
                        path: match[1],
                        title: match[2].trim(),
                        url: `/api/wiki/article/${encodeURIComponent(match[1])}`
                    });
                }
            }

            res.json({ query, results });
        } catch (err) {
            res.status(500).json({ error: `Kiwix not reachable: ${err.message}` });
        }
    });

    // Get article content
    router.get('/article/*', async (req, res) => {
        try {
            if (!fetch) return res.status(500).json({ error: 'node-fetch not installed' });
            const articlePath = req.params[0];

            const response = await fetch(`${kiwixBase}/${articlePath}`);
            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('text/html')) {
                let html = await response.text();

                // Rewrite internal links to go through our proxy
                html = html.replace(/href="\//g, 'href="/api/wiki/article/');
                html = html.replace(/src="\//g, 'src="/api/wiki/asset/');

                res.json({
                    title: articlePath,
                    html: html,
                    path: articlePath
                });
            } else {
                // Binary content (images, etc) - pipe through
                res.set('Content-Type', contentType);
                response.body.pipe(res);
            }
        } catch (err) {
            res.status(500).json({ error: `Article fetch failed: ${err.message}` });
        }
    });

    // Serve assets (images, css, etc from Kiwix)
    router.get('/asset/*', async (req, res) => {
        try {
            if (!fetch) return res.status(500).json({ error: 'node-fetch not installed' });
            const assetPath = req.params[0];

            const response = await fetch(`${kiwixBase}/${assetPath}`);
            const contentType = response.headers.get('content-type');
            res.set('Content-Type', contentType);
            res.set('Cache-Control', 'public, max-age=86400');
            response.body.pipe(res);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Check Kiwix status
    router.get('/status', async (req, res) => {
        try {
            if (!fetch) return res.json({ running: false });
            const response = await fetch(kiwixBase, { timeout: 3000 });
            res.json({ running: response.ok });
        } catch (err) {
            res.json({ running: false, error: err.message });
        }
    });

    return router;
};
