const express = require('express');
const path = require('path');
const fs = require('fs');

module.exports = function (config) {
    const router = express.Router();

    // Get map configuration
    router.get('/config', (req, res) => {
        res.json({
            enabled: config.services.maps.enabled,
            defaultCenter: config.services.maps.defaultCenter || [20.5937, 78.9629],
            defaultZoom: config.services.maps.defaultZoom || 5,
            tilesPath: config.services.maps.tilesPath || '',
            tileUrl: config.services.maps.tilesPath
                ? '/api/maps/tiles/{z}/{x}/{y}.png'
                : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors'
        });
    });

    // Serve local tiles if available
    router.get('/tiles/:z/:x/:y', (req, res) => {
        const { z, x, y } = req.params;
        const tilesDir = config.services.maps.tilesPath;

        if (!tilesDir) {
            return res.status(404).json({ error: 'No local tiles configured' });
        }

        // Try common tile directory structures
        const possiblePaths = [
            path.join(tilesDir, z, x, `${y}.png`),
            path.join(tilesDir, z, x, `${y}.jpg`),
            path.join(tilesDir, z, x, `${y}.webp`),
            path.join(tilesDir, `${z}_${x}_${y}.png`)
        ];

        for (const tilePath of possiblePaths) {
            if (fs.existsSync(tilePath)) {
                res.set('Cache-Control', 'public, max-age=604800');
                return res.sendFile(tilePath);
            }
        }

        res.status(404).json({ error: 'Tile not found' });
    });

    return router;
};
