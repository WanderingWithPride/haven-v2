const express = require('express');
const path = require('path');
const fs = require('fs');
const { encodeFileId, decodeFileId } = require('../utils/scanner');

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
                            id: encodeFileId(path.join(catDir, f)),
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
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get single article
    router.get('/article/:id', (req, res) => {
        try {
            const fullPath = decodeFileId(req.params.id, contentDir);

            if (!fs.existsSync(fullPath)) {
                return res.status(404).json({ error: 'Article not found' });
            }

            const content = fs.readFileSync(fullPath, 'utf-8');
            res.json({ content, path: path.relative(contentDir, fullPath) });
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
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
                            id: encodeFileId(path.join(catDir, f)),
                            title: titleMatch ? titleMatch[1] : f.replace('.md', ''),
                            category: cat,
                            snippet: '...' + snippet + '...'
                        });
                    }
                }
            }
            res.json({ results });
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
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
