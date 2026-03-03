const express = require('express');
const path = require('path');
const fs = require('fs');

module.exports = function (config) {
    const router = express.Router();
    const contentDir = path.join(__dirname, '..', 'content', 'survival');

    // Get all categories and articles
    router.get('/', (req, res) => {
        try {
            const categories = [];
            if (!fs.existsSync(contentDir)) {
                return res.json({ categories: [], total: 0 });
            }
            const cats = fs.readdirSync(contentDir).filter(f =>
                fs.statSync(path.join(contentDir, f)).isDirectory()
            );

            for (const cat of cats) {
                const catDir = path.join(contentDir, cat);
                const files = fs.readdirSync(catDir)
                    .filter(f => f.endsWith('.md'))
                    .map(f => {
                        const content = fs.readFileSync(path.join(catDir, f), 'utf-8');
                        const titleMatch = content.match(/^#\s+(.+)/m);
                        return {
                            id: Buffer.from(`${cat}/${f}`).toString('base64url'),
                            slug: f.replace('.md', ''),
                            title: titleMatch ? titleMatch[1] : f.replace('.md', '').replace(/-/g, ' '),
                            category: cat,
                            size: Buffer.byteLength(content)
                        };
                    });
                if (files.length > 0) {
                    categories.push({
                        name: cat,
                        label: cat.charAt(0).toUpperCase() + cat.slice(1),
                        icon: getCategoryIcon(cat),
                        articles: files
                    });
                }
            }
            const total = categories.reduce((sum, c) => sum + c.articles.length, 0);
            res.json({ categories, total });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get single article
    router.get('/article/:id', (req, res) => {
        try {
            const filePath = Buffer.from(req.params.id, 'base64url').toString();
            const fullPath = path.join(contentDir, filePath);

            // Security check
            if (!fullPath.startsWith(contentDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }
            if (!fs.existsSync(fullPath)) {
                return res.status(404).json({ error: 'Article not found' });
            }

            const content = fs.readFileSync(fullPath, 'utf-8');
            res.json({ content, path: filePath });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Search articles
    router.get('/search', (req, res) => {
        const query = (req.query.q || '').toLowerCase();
        if (!query) return res.json({ results: [] });

        try {
            const results = [];
            if (!fs.existsSync(contentDir)) return res.json({ results: [] });

            const cats = fs.readdirSync(contentDir).filter(f =>
                fs.statSync(path.join(contentDir, f)).isDirectory()
            );
            for (const cat of cats) {
                const catDir = path.join(contentDir, cat);
                const files = fs.readdirSync(catDir).filter(f => f.endsWith('.md'));
                for (const f of files) {
                    const content = fs.readFileSync(path.join(catDir, f), 'utf-8');
                    if (content.toLowerCase().includes(query) || f.toLowerCase().includes(query)) {
                        const titleMatch = content.match(/^#\s+(.+)/m);
                        const snippetIdx = content.toLowerCase().indexOf(query);
                        const snippet = content.substring(Math.max(0, snippetIdx - 40), snippetIdx + 80).replace(/[#*_\n]/g, ' ').trim();
                        results.push({
                            id: Buffer.from(`${cat}/${f}`).toString('base64url'),
                            title: titleMatch ? titleMatch[1] : f.replace('.md', ''),
                            category: cat,
                            snippet: '...' + snippet + '...'
                        });
                    }
                }
            }
            res.json({ results });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};

function getCategoryIcon(cat) {
    const icons = {
        medical: '🏥', water: '💧', fire: '🔥', shelter: '🏠',
        food: '🌾', navigation: '🧭', communication: '📡',
        security: '🔐', engineering: '🔧', tools: '🛠️',
        emergency: '🚨', defense: '🛡️'
    };
    return icons[cat] || '📖';
}
