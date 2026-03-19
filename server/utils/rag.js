const fs = require('fs');
const path = require('path');
const { decodeFileId } = require('./scanner');

let fetch;
try { fetch = require('node-fetch'); } catch (e) { fetch = null; }

const RAG = {
    config: null,

    init(config) {
        this.config = config;
    },

    async getContext(query) {
        console.log(`[RAG] Searching for: "${query}"`);
        
        try {
            const [wikiContext, survivalContext] = await Promise.all([
                this.getWikipediaContext(query),
                this.getSurvivalContext(query)
            ]);

            let fullContext = '';
            if (wikiContext) fullContext += `--- LOCAL WIKIPEDIA CONTEXT ---\n${wikiContext}\n\n`;
            if (survivalContext) fullContext += `--- LOCAL SURVIVAL GUIDE CONTEXT ---\n${survivalContext}\n\n`;

            if (!fullContext) return null;

            return `You are CyberDeck AI, an offline survival assistant. Below is context from the user's local library. Use this information to answer the question as accurately as possible. If the context is not relevant, rely on your knowledge base but mention that the local library had no specific matches.\n\n${fullContext}`;
        } catch (err) {
            console.error('[RAG] Error fetching context:', err);
            return null;
        }
    },

    async getWikipediaContext(query) {
        if (!fetch || !this.config?.services?.kiwix?.enabled) return '';
        
        const kiwixPort = this.config.services.kiwix.port || 8889;
        const kiwixBase = `http://localhost:${kiwixPort}`;

        try {
            // 1. Search for articles
            const searchRes = await fetch(`${kiwixBase}/search?pattern=${encodeURIComponent(query)}&pageLength=3`, { timeout: 2000 });
            const html = await searchRes.text();
            
            const results = [];
            const regex = /<a[^>]*href="\/([^"]*)"[^>]*>([^<]*)<\/a>/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                if (match[1] && !match[1].startsWith('search') && !match[1].startsWith('skin')) {
                    results.push(match[1]);
                }
            }

            if (results.length === 0) return '';

            // 2. Fetch the top article content
            const articlePath = results[0];
            const articleRes = await fetch(`${kiwixBase}/${articlePath}`, { timeout: 3000 });
            let articleHtml = await articleRes.text();

            // 3. Strip HTML and truncate
            // Extract the title and first few paragraphs
            const plainText = articleHtml
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            return `Article: ${articlePath.split('/').pop()}\nContent: ${plainText.substring(0, 1500)}...`;
        } catch (err) {
            console.warn('[RAG] Wikipedia search failed:', err.message);
            return '';
        }
    },

    async getSurvivalContext(query) {
        const contentDir = path.join(__dirname, '..', 'content', 'survival');
        if (!fs.existsSync(contentDir)) return '';

        try {
            const results = [];
            const q = query.toLowerCase();
            const cats = fs.readdirSync(contentDir).filter(f => fs.statSync(path.join(contentDir, f)).isDirectory());

            for (const cat of cats) {
                const catDir = path.join(contentDir, cat);
                const files = fs.readdirSync(catDir).filter(f => f.endsWith('.md'));
                for (const f of files) {
                    const content = fs.readFileSync(path.join(catDir, f), 'utf-8');
                    if (content.toLowerCase().includes(q) || f.toLowerCase().includes(q)) {
                        results.push({
                            title: f.replace('.md', ''),
                            content: content
                        });
                    }
                    if (results.length >= 2) break;
                }
                if (results.length >= 2) break;
            }

            if (results.length === 0) return '';

            return results.map(r => `Document: ${r.title}\n${r.content.substring(0, 1000)}...`).join('\n\n');
        } catch (err) {
            console.warn('[RAG] Survival search failed:', err.message);
            return '';
        }
    }
};

module.exports = RAG;
