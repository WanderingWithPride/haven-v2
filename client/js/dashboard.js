// ═══════════════════════════════════════════
// CyberDeck - Dashboard Module
// ═══════════════════════════════════════════

const DashboardModule = {
    stats: {
        cpu: 0,
        ram: 0,
        battery: 0,
        storage: 0
    },
    isPerformanceMode: localStorage.getItem('cd_perf_mode') === 'true',

    async init() {
        const el = document.getElementById('mod-dashboard');
        el.innerHTML = `
            <div class="module-header">
                <div>
                    <div class="module-title">Operational Dashboard</div>
                    <div class="module-subtitle">System status & secure mesh activity</div>
                </div>
                <div class="dash-controls">
                    <button id="perf-toggle" class="btn btn-perf ${this.isPerformanceMode ? 'on' : ''}" onclick="DashboardModule.togglePerformanceMode()">
                        ${this.isPerformanceMode ? 'Performance Mode ON' : 'Performance Mode OFF'}
                    </button>
                </div>
            </div>

            <div class="dash-grid">
                <!-- Mesh Activity -->
                <div class="card dash-mesh-card" style="grid-column: span 12;">
                    <h3>Secure Mesh Activity</h3>
                    <div id="dash-mesh-activity" class="activity-feed">
                        <div class="empty-state">Scan initiated...</div>
                    </div>
                </div>
                
                <!-- Quick Access -->
                <div class="card dash-quick-card">
                    <h3>Mission Directives</h3>
                    <div class="quick-links">
                        <button class="nav-item" onclick="switchModule('chat')">Open Mesh Chat</button>
                        <button class="nav-item" onclick="switchModule('store')">Store</button>
                    </div>
                </div>
            </div>`;

        if (this._interval) clearInterval(this._interval);
        
        this.renderMeshActivity();
    },

    togglePerformanceMode() {
        this.isPerformanceMode = !this.isPerformanceMode;
        localStorage.setItem('cd_perf_mode', this.isPerformanceMode);
        
        const btn = document.getElementById('perf-toggle');
        if (this.isPerformanceMode) {
            btn.classList.add('on');
            btn.textContent = 'Performance Mode ON';
            document.body.classList.add('perf-mode');
        } else {
            btn.classList.remove('on');
            btn.textContent = 'Performance Mode OFF';
            document.body.classList.remove('perf-mode');
        }
    },

    async updateStats() {
        try {
            const res = await authFetch(`${API}/api/power/stats`);
            const data = await res.json();
            
            this.animateStat('cpu', data.cpu_load);
            this.animateStat('ram', data.ram_pct);
            this.animateStat('batt', data.battery_level);
            this.animateStat('storage', data.storage_pct);
        } catch (e) {
            console.error('Dash stats failed', e);
        }
    },

    animateStat(id, val) {
        const fill = document.getElementById(`dash-${id}-fill`);
        const text = document.getElementById(`dash-${id}-text`);
        if (fill) fill.style.width = (val || 0) + '%';
        if (text) text.textContent = id === 'storage' ? `${val || 0}% used` : `${val || 0}%`;
    },

    async renderMeshActivity(silent = false) {
        const feed = document.getElementById('dash-mesh-activity');
        if (!feed) return;

        try {
            const res = await authFetch(`${API}/api/system/mesh-activity`);
            const data = await res.json();
            const events = data.events || [];

            if (events.length === 0) {
                if (!silent) feed.innerHTML = '<div class="empty-state">Scan initiated... Listening for network events...</div>';
                return;
            }

            feed.innerHTML = events.map(e => `
                <div class="activity-item" style="animation: fadeIn 0.4s ease forwards">
                    <span class="activity-time">${new Date(e.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    <span class="activity-msg">${escapeHtml(e.msg)}</span>
                </div>
            `).join('');
        } catch (e) {
            console.error('Mesh activity fetch failed', e);
        }

        // Real-time polling
        if (this._meshPoll) clearInterval(this._meshPoll);
        this._meshPoll = setInterval(() => {
            const page = document.getElementById('mod-dashboard');
            if (page && page.classList.contains('active')) {
                this.renderMeshActivity(true);
            }
        }, 5000);
    }
};
