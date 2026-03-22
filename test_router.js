const express = require('express');
const app = express();
const path = require('path');

const adminPath = path.resolve(__dirname, 'admin');

// Mock out captive portal
app.use((req, res, next) => next());

app.use('/', express.static(path.resolve(__dirname, 'client')));

app.get('/admin', (req, res) => res.send('ADMIN NO SLASH'));
app.get('/admin/', (req, res) => res.send('ADMIN SLASH'));
app.use('/admin', express.static(adminPath, { index: false, redirect: false }));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin/')) {
        return res.status(404).json({ error: 'Not found catchall', path: req.path });
    }
    res.send('INDEX HTML');
});

app.listen(8889, () => {
    console.log('Test server running on 8889');
});
