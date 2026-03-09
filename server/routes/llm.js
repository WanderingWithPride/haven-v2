const express = require('express');

let fetch;
try { fetch = require('node-fetch'); } catch (e) { fetch = null; }

module.exports = function (config) {
    const router = express.Router();
    const baseUrl = `http://localhost:${config.services.ollama.port}`;

    // Check if Ollama is running
    router.get('/status', async (req, res) => {
        try {
            if (!fetch) return res.json({ running: false, error: 'node-fetch not installed' });
            const response = await fetch(`${baseUrl}/api/tags`, { timeout: 3000 });
            const data = await response.json();
            res.json({ running: true, models: data.models || [] });
        } catch (err) {
            res.json({ running: false, error: err.message });
        }
    });

    // List available models
    router.get('/models', async (req, res) => {
        try {
            if (!fetch) return res.status(500).json({ error: 'node-fetch not installed' });
            const response = await fetch(`${baseUrl}/api/tags`);
            const data = await response.json();
            res.json(data.models || []);
        } catch (err) {
            res.status(500).json({ error: `Ollama not reachable: ${err.message}` });
        }
    });

    // Chat completion (streaming)
    router.post('/chat', async (req, res) => {
        try {
            if (!fetch) return res.status(500).json({ error: 'node-fetch not installed' });

            const { model, messages, stream = true } = req.body;
            const modelName = model || config.services.ollama.defaultModel || 'tinyllama';

            if (stream) {
                // Server-Sent Events for streaming
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                const response = await fetch(`${baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: modelName, messages, stream: true })
                });

                const reader = response.body;
                reader.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n').filter(l => l.trim());
                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            res.write(`data: ${JSON.stringify(data)}\n\n`);
                            if (data.done) {
                                res.write('data: [DONE]\n\n');
                            }
                        } catch (e) { /* skip non-JSON lines */ }
                    }
                });

                reader.on('end', () => res.end());
                reader.on('error', (err) => {
                    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                    res.end();
                });

                req.on('close', () => reader.destroy());
            } else {
                // Non-streaming response
                const response = await fetch(`${baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: modelName, messages, stream: false })
                });
                const data = await response.json();
                res.json(data);
            }
        } catch (err) {
            res.status(500).json({ error: `LLM error: ${err.message}` });
        }
    });

    // Generate (single prompt, no chat history)
    router.post('/generate', async (req, res) => {
        try {
            if (!fetch) return res.status(500).json({ error: 'node-fetch not installed' });
            const { model, prompt } = req.body;
            const modelName = model || config.services.ollama.defaultModel || 'tinyllama';

            const response = await fetch(`${baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName, prompt, stream: false })
            });
            const data = await response.json();
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: `LLM error: ${err.message}` });
        }
    });

    // Pull a model
    router.post('/pull', async (req, res) => {
        try {
            if (!fetch) return res.status(500).json({ error: 'node-fetch not installed' });
            const { model } = req.body;
            if (!model) return res.status(400).json({ error: 'Model name required' });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');

            const response = await fetch(`${baseUrl}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: model, stream: true })
            });

            response.body.on('data', (chunk) => {
                res.write(`data: ${chunk.toString()}\n\n`);
            });
            response.body.on('end', () => res.end());
            response.body.on('error', (err) => {
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                res.end();
            });
        } catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
};
