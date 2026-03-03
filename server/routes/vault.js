const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports = function (config) {
    const router = express.Router();
    const VAULT_DIR = path.join(__dirname, '..', 'vault_data');
    const VAULT_META = path.join(VAULT_DIR, '.vault_meta.json');
    const ALGORITHM = 'aes-256-gcm';

    // Ensure vault dir exists
    if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });

    function loadMeta() {
        if (!fs.existsSync(VAULT_META)) return { files: [], vaultKeyHash: null };
        return JSON.parse(fs.readFileSync(VAULT_META, 'utf-8'));
    }
    function saveMeta(meta) { fs.writeFileSync(VAULT_META, JSON.stringify(meta, null, 2)); }

    function deriveKey(password) {
        return crypto.pbkdf2Sync(password, 'cyberdeck-vault-salt', 100000, 32, 'sha512');
    }

    // Initialize vault with a password (first time)
    router.post('/init', (req, res) => {
        const { password } = req.body;
        if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be 4+ characters' });

        const meta = loadMeta();
        if (meta.vaultKeyHash) return res.status(400).json({ error: 'Vault already initialized' });

        meta.vaultKeyHash = crypto.createHash('sha256').update(password).digest('hex');
        meta.files = [];
        saveMeta(meta);
        res.json({ success: true });
    });

    // Check vault status
    router.get('/status', (req, res) => {
        const meta = loadMeta();
        res.json({
            initialized: !!meta.vaultKeyHash,
            fileCount: meta.files ? meta.files.length : 0,
            totalSize: meta.files ? meta.files.reduce((s, f) => s + (f.encSize || 0), 0) : 0
        });
    });

    // Unlock vault (verify password)
    router.post('/unlock', (req, res) => {
        const { password } = req.body;
        const meta = loadMeta();
        if (!meta.vaultKeyHash) return res.status(400).json({ error: 'Vault not initialized' });

        const hash = crypto.createHash('sha256').update(password).digest('hex');
        if (hash !== meta.vaultKeyHash) return res.status(401).json({ error: 'Wrong vault password' });

        res.json({ success: true, files: meta.files.map(f => ({ id: f.id, name: f.name, size: f.originalSize, date: f.date })) });
    });

    // Store a file into vault
    router.post('/store', express.raw({ type: '*/*', limit: '100mb' }), (req, res) => {
        const vaultPass = req.headers['x-vault-password'];
        const fileName = req.headers['x-file-name'] || 'unnamed';
        if (!vaultPass) return res.status(400).json({ error: 'Vault password required' });

        const meta = loadMeta();
        const hash = crypto.createHash('sha256').update(vaultPass).digest('hex');
        if (hash !== meta.vaultKeyHash) return res.status(401).json({ error: 'Wrong vault password' });

        const key = deriveKey(vaultPass);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const encrypted = Buffer.concat([cipher.update(req.body), cipher.final()]);
        const authTag = cipher.getAuthTag();

        const fileId = crypto.randomBytes(8).toString('hex');
        const encPath = path.join(VAULT_DIR, fileId + '.enc');

        // Store: iv(16) + authTag(16) + encrypted data
        const output = Buffer.concat([iv, authTag, encrypted]);
        fs.writeFileSync(encPath, output);

        meta.files.push({
            id: fileId,
            name: fileName,
            originalSize: req.body.length,
            encSize: output.length,
            date: new Date().toISOString()
        });
        saveMeta(meta);

        res.json({ success: true, id: fileId });
    });

    // Retrieve a file from vault
    router.post('/retrieve/:id', (req, res) => {
        const { password } = req.body;
        const meta = loadMeta();
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        if (hash !== meta.vaultKeyHash) return res.status(401).json({ error: 'Wrong vault password' });

        const fileMeta = meta.files.find(f => f.id === req.params.id);
        if (!fileMeta) return res.status(404).json({ error: 'File not found' });

        const encPath = path.join(VAULT_DIR, req.params.id + '.enc');
        if (!fs.existsSync(encPath)) return res.status(404).json({ error: 'Encrypted file missing' });

        const data = fs.readFileSync(encPath);
        const iv = data.subarray(0, 16);
        const authTag = data.subarray(16, 32);
        const encrypted = data.subarray(32);

        const key = deriveKey(password);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        try {
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            res.set('Content-Disposition', `attachment; filename="${fileMeta.name}"`);
            res.send(decrypted);
        } catch {
            res.status(500).json({ error: 'Decryption failed' });
        }
    });

    // Delete a file from vault
    router.delete('/:id', (req, res) => {
        const vaultPass = req.headers['x-vault-password'];
        const meta = loadMeta();
        const hash = crypto.createHash('sha256').update(vaultPass).digest('hex');
        if (hash !== meta.vaultKeyHash) return res.status(401).json({ error: 'Wrong vault password' });

        const idx = meta.files.findIndex(f => f.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'File not found' });

        const encPath = path.join(VAULT_DIR, req.params.id + '.enc');
        if (fs.existsSync(encPath)) fs.unlinkSync(encPath);

        meta.files.splice(idx, 1);
        saveMeta(meta);
        res.json({ success: true });
    });

    // Change vault password
    router.post('/change-password', (req, res) => {
        const { oldPassword, newPassword } = req.body;
        if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'New password must be 4+ characters' });

        const meta = loadMeta();
        const hash = crypto.createHash('sha256').update(oldPassword).digest('hex');
        if (hash !== meta.vaultKeyHash) return res.status(401).json({ error: 'Wrong current password' });

        // Re-encrypt all files
        const oldKey = deriveKey(oldPassword);
        const newKey = deriveKey(newPassword);

        for (const fileMeta of meta.files) {
            const encPath = path.join(VAULT_DIR, fileMeta.id + '.enc');
            if (!fs.existsSync(encPath)) continue;

            const data = fs.readFileSync(encPath);
            const iv = data.subarray(0, 16);
            const authTag = data.subarray(16, 32);
            const encrypted = data.subarray(32);

            // Decrypt with old key
            const decipher = crypto.createDecipheriv(ALGORITHM, oldKey, iv);
            decipher.setAuthTag(authTag);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

            // Re-encrypt with new key
            const newIv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(ALGORITHM, newKey, newIv);
            const reEncrypted = Buffer.concat([cipher.update(decrypted), cipher.final()]);
            const newAuthTag = cipher.getAuthTag();

            fs.writeFileSync(encPath, Buffer.concat([newIv, newAuthTag, reEncrypted]));
        }

        meta.vaultKeyHash = crypto.createHash('sha256').update(newPassword).digest('hex');
        saveMeta(meta);
        res.json({ success: true });
    });

    return router;
};
