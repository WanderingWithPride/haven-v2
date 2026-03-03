const express = require('express');
const os = require('os');
const { exec } = require('child_process');

module.exports = function (config) {
    const router = express.Router();

    // Get battery info (Termux:API)
    router.get('/battery', (req, res) => {
        exec('termux-battery-status', { timeout: 5000 }, (err, stdout) => {
            if (err) {
                // Fallback: not on Termux or API not installed
                return res.json({
                    available: false,
                    message: 'Install Termux:API for battery monitoring',
                    percentage: null,
                    status: 'unknown',
                    temperature: null
                });
            }
            try {
                const data = JSON.parse(stdout);
                res.json({
                    available: true,
                    percentage: data.percentage,
                    status: data.status, // CHARGING, DISCHARGING, FULL, NOT_CHARGING
                    plugged: data.plugged,
                    temperature: data.temperature,
                    health: data.health,
                    current: data.current
                });
            } catch {
                res.json({ available: false, message: 'Failed to parse battery data' });
            }
        });
    });

    // Get system resources
    router.get('/resources', (req, res) => {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const cpus = os.cpus();

        // Calculate CPU usage from cpus
        let totalIdle = 0, totalTick = 0;
        cpus.forEach(cpu => {
            for (const type in cpu.times) totalTick += cpu.times[type];
            totalIdle += cpu.times.idle;
        });

        res.json({
            cpu: {
                count: cpus.length,
                model: cpus[0]?.model || 'unknown',
                usagePercent: Math.round((1 - totalIdle / totalTick) * 100)
            },
            memory: {
                total: totalMem,
                free: freeMem,
                used: totalMem - freeMem,
                percent: Math.round(((totalMem - freeMem) / totalMem) * 100)
            },
            uptime: os.uptime(),
            loadavg: os.loadavg(),
            platform: os.platform(),
            arch: os.arch()
        });
    });

    // Get storage info
    router.get('/storage', (req, res) => {
        exec('df -h /storage/emulated/0 2>/dev/null || df -h / 2>/dev/null || echo "{}"', { timeout: 5000 }, (err, stdout) => {
            if (err) return res.json({ available: false });
            const lines = stdout.trim().split('\n');
            if (lines.length < 2) return res.json({ available: false });

            const parts = lines[1].split(/\s+/);
            res.json({
                available: true,
                total: parts[1] || '?',
                used: parts[2] || '?',
                free: parts[3] || '?',
                percent: parts[4] || '?'
            });
        });
    });

    // Get running services
    router.get('/services', (req, res) => {
        const checkProcess = (name) => new Promise((resolve) => {
            exec(`pgrep -f "${name}"`, (err) => resolve(!err));
        });

        Promise.all([
            checkProcess('ollama serve'),
            checkProcess('kiwix-serve'),
            checkProcess('node server.js')
        ]).then(([ollama, kiwix, node]) => {
            res.json({
                ollama: { running: ollama, label: 'Ollama (LLM)', heavy: true },
                kiwix: { running: kiwix, label: 'Kiwix (Wiki)', heavy: false },
                node: { running: node, label: 'CyberDeck Server', heavy: false }
            });
        });
    });

    // Toggle low power mode
    router.post('/low-power', (req, res) => {
        const { enabled } = req.body;

        if (enabled) {
            // Kill heavy services
            exec('pkill -f "ollama serve" 2>/dev/null', () => { });
            res.json({ success: true, mode: 'low-power', message: 'Heavy services stopped. Essential services remain active.' });
        } else {
            // Restart services
            exec('ollama serve &', () => { });
            res.json({ success: true, mode: 'normal', message: 'All services restarting.' });
        }
    });

    // Torch control (Termux:API)
    router.post('/torch', (req, res) => {
        const { enabled } = req.body;
        exec(`termux-torch ${enabled ? 'on' : 'off'}`, { timeout: 3000 }, (err) => {
            res.json({ success: !err, torch: enabled });
        });
    });

    // Vibrate (Termux:API)
    router.post('/vibrate', (req, res) => {
        exec('termux-vibrate -d 200', { timeout: 3000 }, (err) => {
            res.json({ success: !err });
        });
    });

    return router;
};
