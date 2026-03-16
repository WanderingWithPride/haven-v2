const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const meshLogger = require('../utils/meshLogger');

module.exports = function (config) {
    const router = express.Router();
    const SPOOL_DIR = path.join(__dirname, '..', 'dtn_spool');

    // Ensure spool directory exists
    if (!fs.existsSync(SPOOL_DIR)) {
        fs.mkdirSync(SPOOL_DIR, { recursive: true });
    }

    // Helper: Read all packets from spool
    function getSpoolPackets() {
        const packets = [];
        try {
            const files = fs.readdirSync(SPOOL_DIR);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                try {
                    const data = fs.readFileSync(path.join(SPOOL_DIR, file), 'utf-8');
                    packets.push(JSON.parse(data));
                } catch (e) {
                    // Ignore corrupted files
                }
            }
        } catch (e) {
            console.error('[DTN] Error reading spool:', e);
        }
        return packets;
    }

    // Helper: Write packet to spool (with limits)
    function savePacket(packet) {
        try {
            // Check packet size
            const packetSize = Buffer.byteLength(JSON.stringify(packet), 'utf8');
            if (packetSize > 2 * 1024 * 1024) { // 2MB limit
                console.warn(`[DTN] Rejecting oversized packet: ${packetSize} bytes`);
                return false;
            }

            // Enforce max spool size (e.g., 500 packets)
            const currentPackets = getSpoolPackets();
            if (currentPackets.length >= 500) {
                console.warn('[DTN] Spool threshold reached. Rejecting incoming packet.');
                return false;
            }

            const filePath = path.join(SPOOL_DIR, `${packet.id}.json`);
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, JSON.stringify(packet, null, 2));
                return true;
            }
            return false; // Already exists
        } catch (e) {
            console.error('[DTN] Error saving packet:', e);
            return false;
        }
    }

    // Garbage Collector: Remove expired TTL packets
    function cleanSpool() {
        try {
            const now = Date.now();
            const files = fs.readdirSync(SPOOL_DIR);
            let deletedCount = 0;

            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                const filePath = path.join(SPOOL_DIR, file);
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    if (data.ttl_expiry && now > data.ttl_expiry) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    }
                } catch (e) {
                    // If JSON is totally corrupt, nuke it
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            }
            if (deletedCount > 0) console.log(`[DTN] Garbage collected ${deletedCount} expired packets.`);
        } catch (e) {
            // Ignore
        }
    }

    // Run GC every 60 seconds
    setInterval(cleanSpool, 60000);

    // ----------------------------------------------------
    // API ENDPOINTS
    // ----------------------------------------------------

    // 1. Local UI: Get all current packets in the spool
    router.get('/packets', (req, res) => {
        const packets = getSpoolPackets();
        res.json({ packets });
    });

    // 2. Local UI: Inject a new packet into the network
    router.post('/send', (req, res) => {
        const { sender, dest, type, payload, ttl_hours = 48 } = req.body;

        if (!payload) return res.status(400).json({ error: 'Missing payload' });

        if (Buffer.byteLength(payload, 'utf8') > 2 * 1024 * 1024) {
            return res.status(400).json({ error: 'Payload exceeds 2MB limit' });
        }

        const now = Date.now();
        const packet = {
            id: '',
            timestamp: now,
            ttl_expiry: now + (ttl_hours * 60 * 60 * 1000),
            sender: sender || 'anonymous',
            dest: dest || 'ALL',
            type: type || 'text_msg',
            payload: payload
        };

        // Generate ID based on SHA256 of the content
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify({ ...packet, id: null }));
        packet.id = hash.digest('hex');

        if (savePacket(packet)) {
            res.json({ success: true, packet });
        } else {
            res.status(500).json({ error: 'Failed to save or packet already exists' });
        }
    });

    // 3. Epidemic Sync: Peer-to-Peer Data Exchange
    // A remote node POSTs an array of packet IDs it already HAS.
    // We return full JSON payloads for anything they are MISSING,
    // and we return an array of IDs that WE want them to send us via their /api/dtn/give
    router.post('/sync/check', (req, res) => {
        const peerKnownIds = req.body.known_ids || [];
        const myPackets = getSpoolPackets();
        const myKnownIds = myPackets.map(p => p.id);

        // What do I have that they don't?
        const packetsForPeer = myPackets.filter(p => !peerKnownIds.includes(p.id));

        // What do they have that I want? (I don't actually know what they have, 
        // they just told me what they *know*, so we just tell them what *we* know, 
        // and they can figure out what to send us).
        // Wait, better algorithm for P2P sync (two-way):

        res.json({
            my_known_ids: myKnownIds,
            payloads_for_you: packetsForPeer
        });
    });

    // 4. Epidemic Sync: Receive missing payloads from a peer
    router.post('/sync/receive', (req, res) => {
        const incomingPackets = req.body.packets || [];
        let accepted = 0;

        for (const p of incomingPackets) {
            // Basic validation
            if (!p.id || !p.timestamp || !p.ttl_expiry || !p.payload) continue;

            // Refuse dead packets immediately
            if (Date.now() > p.ttl_expiry) continue;

            if (savePacket(p)) {
                accepted++;
            }
        }

        if (accepted > 0) {
            meshLogger.log(`P2P Sync: Received ${accepted} packets from peer`);
        }

        res.json({ accepted });
    });

    // 5. Manual Sync Proxy: Bypass browser CORS and HTTPS mixed content limits
    router.post('/manual_sync', async (req, res) => {
        const peerIp = req.body.targetIp;
        if (!peerIp) return res.status(400).json({ error: 'Missing targetIp' });

        // SSRF Protection: Only allow private network IPs
        const isPrivate = /^10\./.test(peerIp) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(peerIp) || /^192\.168\./.test(peerIp);
        if (!isPrivate || peerIp === '127.0.0.1' || peerIp === '::1') {
            return res.status(400).json({ error: 'Invalid peer IP: must be a private network address' });
        }

        try {
            const fetch = require('node-fetch').default || require('node-fetch');
            const myPackets = getSpoolPackets();
            const myKnownIds = myPackets.map(p => p.id);

            let stats = { received: 0, sent: 0 };

            const https = require('https');
            const agent = new https.Agent({ rejectUnauthorized: false }); // Ignore self-signed certs

            const targetUrl = `https://${peerIp}:${config.httpsPort || 8443}/api/dtn/sync/check`;
            console.log(`\x1b[33m[DTN Proxy] Initiating manual HTTPS fetch to: ${targetUrl}\x1b[0m`);

            // Tell peer what we KNOW.
            const checkRes = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ known_ids: myKnownIds }),
                timeout: 5000,
                agent: agent
            });
            const data = await checkRes.json();

            // Store missing payloads peer sent us
            if (data.payloads_for_you && data.payloads_for_you.length > 0) {
                for (const p of data.payloads_for_you) {
                    if (savePacket(p)) stats.received++;
                }
            }

            // Figure out what they need from us
            if (data.my_known_ids) {
                const peerNeeds = myPackets.filter(myP => !data.my_known_ids.includes(myP.id));
                if (peerNeeds.length > 0) {
                    await fetch(`https://${peerIp}:${config.httpsPort || 8443}/api/dtn/sync/receive`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ packets: peerNeeds }),
                        timeout: 5000,
                        agent: agent
                    });
                    stats.sent = peerNeeds.length;
                }
            }

            if (stats.sent > 0 || stats.received > 0) {
                meshLogger.log(`Manual Sync: Sent ${stats.sent}, Received ${stats.received} with ${peerIp}`);
            }

            res.json({ success: true, message: `Sync Complete: Sent ${stats.sent}, Received ${stats.received}` });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    return router;
};
