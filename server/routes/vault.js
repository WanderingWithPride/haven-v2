const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
let multer;
try { multer = require('multer'); } catch (e) { multer = null; }

module.exports = function (config) {
    const router = express.Router();
    const VAULT_DIR = path.join(__dirname, '..', 'vault_data');
    const VAULT_META = path.join(VAULT_DIR, '.vault_meta.json');
    const ALGORITHM = 'aes-256-gcm';

    // Ensure vault dir exists
    if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });

    const activeSessions = new Map(); // token -> { password, expiresAt }

    function cleanSessions() {
        const now = Date.now();
        for (const [token, data] of activeSessions.entries()) {
            if (data.expiresAt < now) activeSessions.delete(token);
        }
    }

    function loadMeta() {
        if (!fs.existsSync(VAULT_META)) return { files: [], vaultKeyHash: null };
        return JSON.parse(fs.readFileSync(VAULT_META, 'utf-8'));
    }
    function saveMeta(meta) { fs.writeFileSync(VAULT_META, JSON.stringify(meta, null, 2)); }

    function deriveKey(password, salt) {
        return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
    }

    function hashVaultPassword(password, salt) {
        return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    }

    // Initialize vault with a password (first time)
    router.post('/init', (req, res) => {
        const { password } = req.body;
        if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be 4+ characters' });

        const meta = loadMeta();
        if (meta.vaultKeyHash) return res.status(400).json({ error: 'Vault already initialized' });

        const vaultSalt = crypto.randomBytes(32).toString('hex');
        meta.vaultSalt = vaultSalt;
        meta.vaultKeyHash = hashVaultPassword(password, vaultSalt);
        meta.files = [];
        saveMeta(meta);

        cleanSessions();
        const token = crypto.randomBytes(32).toString('hex');
        activeSessions.set(token, { password, expiresAt: Date.now() + 60 * 60 * 1000 });

        res.json({ success: true, token });
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

        const hash = hashVaultPassword(password, meta.vaultSalt);
        if (hash !== meta.vaultKeyHash) return res.status(401).json({ error: 'Wrong vault password' });

        cleanSessions();
        const token = crypto.randomBytes(32).toString('hex');
        activeSessions.set(token, { password, expiresAt: Date.now() + 60 * 60 * 1000 });

        res.json({ success: true, token, files: meta.files.map(f => ({ id: f.id, name: f.name, size: f.originalSize, date: f.date })) });
    });

    // Store a file into vault (using multer for reliable upload)
    const upload = multer ? multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }) : null;

    const storeHandler = (req, res) => {
        const token = req.headers['x-vault-token'];
        const fileName = req.file ? req.file.originalname : (req.headers['x-file-name'] || 'unnamed');
        if (!token) return res.status(400).json({ error: 'Vault session token required' });

        cleanSessions();
        const session = activeSessions.get(token);
        if (!session) return res.status(401).json({ error: 'Vault session expired' });

        session.expiresAt = Date.now() + 60 * 60 * 1000;
        const vaultPass = session.password;

        const meta = loadMeta();
        const hash = hashVaultPassword(vaultPass, meta.vaultSalt);
        if (hash !== meta.vaultKeyHash) return res.status(401).json({ error: 'Vault config changed' });

        const fileData = req.file ? req.file.buffer : req.body;
        if (!fileData || fileData.length === 0) return res.status(400).json({ error: 'No file data received' });

        const key = deriveKey(vaultPass, meta.vaultSalt);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const encrypted = Buffer.concat([cipher.update(fileData), cipher.final()]);
        const authTag = cipher.getAuthTag();

        const fileId = crypto.randomBytes(8).toString('hex');
        const encPath = path.join(VAULT_DIR, fileId + '.enc');

        // Store: iv(16) + authTag(16) + encrypted data
        const output = Buffer.concat([iv, authTag, encrypted]);
        fs.writeFileSync(encPath, output);

        meta.files.push({
            id: fileId,
            name: fileName,
            originalSize: fileData.length,
            encSize: output.length,
            date: new Date().toISOString()
        });
        saveMeta(meta);

        res.json({ success: true, id: fileId });
    };

    if (upload) {
        router.post('/store', upload.single('file'), storeHandler);
    } else {
        router.post('/store', express.raw({ type: '*/*', limit: '100mb' }), storeHandler);
    }

    // Retrieve a file from vault
    router.post('/retrieve/:id', (req, res) => {
        const { token } = req.body;
        cleanSessions();
        const session = activeSessions.get(token);
        if (!session) return res.status(401).json({ error: 'Vault session expired' });

        session.expiresAt = Date.now() + 60 * 60 * 1000;
        const password = session.password;

        const meta = loadMeta();
        const hash = hashVaultPassword(password, meta.vaultSalt);
        if (hash !== meta.vaultKeyHash) return res.status(401).json({ error: 'Vault config changed' });

        const fileMeta = meta.files.find(f => f.id === req.params.id);
        if (!fileMeta) return res.status(404).json({ error: 'File not found' });

        const encPath = path.join(VAULT_DIR, req.params.id + '.enc');
        if (!fs.existsSync(encPath)) return res.status(404).json({ error: 'Encrypted file missing' });

        const data = fs.readFileSync(encPath);
        const iv = data.subarray(0, 16);
        const authTag = data.subarray(16, 32);
        const encrypted = data.subarray(32);

        const key = deriveKey(password, meta.vaultSalt);
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
        const token = req.headers['x-vault-token'];
        cleanSessions();
        const session = activeSessions.get(token);
        if (!session) return res.status(401).json({ error: 'Vault session expired' });

        session.expiresAt = Date.now() + 60 * 60 * 1000;
        const vaultPass = session.password;

        const meta = loadMeta();
        const hash = hashVaultPassword(vaultPass, meta.vaultSalt);
        if (hash !== meta.vaultKeyHash) return res.status(401).json({ error: 'Vault config changed' });

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
        const hash = hashVaultPassword(oldPassword, meta.vaultSalt);
        if (hash !== meta.vaultKeyHash) return res.status(401).json({ error: 'Wrong current password' });

        // Re-encrypt all files
        const oldKey = deriveKey(oldPassword, meta.vaultSalt);
        const newSalt = crypto.randomBytes(32).toString('hex');
        const newKey = deriveKey(newPassword, newSalt);

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

        meta.vaultSalt = newSalt;
        meta.vaultKeyHash = hashVaultPassword(newPassword, newSalt);
        saveMeta(meta);
        res.json({ success: true });
    });

    return router;
};
