// ═══════════════════════════════════════════
// CyberDeck - Content Store
// ═══════════════════════════════════════════

const StoreModule = {
    catalog: [],
    itemConfigs: {},  // Store configs by ID — avoids inline JSON in onclick

    async init() {
        const el = document.getElementById('mod-store');
        el.innerHTML = `
            <div class="module-header">
                <div>
                    <div class="module-title">Content Store</div>
                    <div class="module-subtitle">Download knowledge packs, LLM models & more</div>
                </div>
            </div>
            <div id="storeContent"><div class="loading-spinner"></div></div>`;
        await this.loadCatalog();
    },

    async loadCatalog() {
        try {
            const res = await authFetch(`${API}/api/store/catalog`);
            const data = await res.json();
            this.catalog = data.categories || [];
            this.render();
            // Check what's already downloaded
            this.checkExistingDownloads();
        } catch (err) {
            document.getElementById('storeContent').innerHTML = `<div class="empty-state"><h3>Store unavailable</h3><p>${err.message}</p></div>`;
        }
    },

    render() {
        const el = document.getElementById('storeContent');
        let html = '';

        this.catalog.forEach(cat => {
            html += `<div class="store-category">
                <h3 style="margin-bottom:12px">${cat.icon} ${cat.name}</h3>
                <div class="store-items">`;

            cat.items.forEach(item => {
                // Store config in JS map — safe from HTML escaping issues
                this.itemConfigs[item.id] = {
                    url: item.url || '',
                    dirUrl: item.dirUrl || '',
                    pattern: item.pattern || '',
                    cmd: item.cmd || '',
                    type: item.type
                };

                html += `
                    <div class="store-item card">
                        <div class="store-item-header">
                            <strong>${item.name}</strong>
                            <span class="tag tag-cyan" id="size-${item.id}">${item.size}</span>
                        </div>
                        <p style="font-size:12px;color:var(--text-dim);margin:6px 0">${item.desc}</p>
                        <div class="store-item-actions">
                            <div class="store-progress" id="prog-${item.id}" style="display:none">
                                <div class="power-bar"><div class="power-bar-fill" id="fill-${item.id}"></div></div>
                                <span class="store-prog-text" id="text-${item.id}"></span>
                            </div>
                            <div style="display:flex;gap:6px;align-items:center">
                                <button class="btn btn-primary" id="btn-${item.id}"
                                    onclick="StoreModule.downloadItem('${item.id}')">
                                    ${item.type === 'manual' ? '🔗 Info' : '⬇ Download'}
                                </button>
                                <button class="btn" id="cancel-${item.id}" style="display:none;background:var(--red);color:#fff;padding:6px 10px;font-size:12px"
                                    onclick="StoreModule.cancelDownload('${item.id}')">✕ Cancel</button>
                                <button class="btn" id="delete-${item.id}" style="display:none;background:var(--surface2);color:var(--red);border:1px solid var(--red);padding:6px 10px;font-size:12px"
                                    onclick="StoreModule.deleteItem('${item.id}')">🗑 Delete</button>
                            </div>
                        </div>
                    </div>`;
            });
            html += '</div></div>';
        });

        el.innerHTML = html;
        this.fetchExactSizes();
    },

    async fetchExactSizes() {
        try {
            const res = await authFetch(`${API}/api/store/sizes`);
            const sizes = await res.json();
            for (const [id, exactSize] of Object.entries(sizes)) {
                const badge = document.getElementById(`size-${id}`);
                if (badge) {
                    badge.textContent = exactSize;
                }
            }
        } catch (err) {
            console.error('Failed to fetch exact sizes', err);
        }
    },

    async checkExistingDownloads() {
        try {
            const res = await authFetch(`${API}/api/store/status`);
            const status = await res.json();
            for (const [id, info] of Object.entries(status)) {
                if (info.status === 'complete') {
                    const btn = document.getElementById(`btn-${id}`);
                    const prog = document.getElementById(`prog-${id}`);
                    const fill = document.getElementById(`fill-${id}`);
                    const text = document.getElementById(`text-${id}`);
                    const deleteBtn = document.getElementById(`delete-${id}`);
                    if (btn) { btn.textContent = '✅ Done'; btn.disabled = true; }
                    if (prog) prog.style.display = 'flex';
                    if (fill) { fill.style.width = '100%'; fill.style.background = 'var(--green)'; }
                    if (text) text.textContent = 'Downloaded';
                    if (deleteBtn) deleteBtn.style.display = 'inline-block';
                }
            }
        } catch (e) { /* silently fail */ }
    },

    downloadItem(id) {
        const config = this.itemConfigs[id];
        if (!config) { alert('Unknown item'); return; }
        this.download(id, config);
    },

    async download(id, itemConfig) {
        const { url, dirUrl, pattern, cmd, type } = itemConfig;
        const btn = document.getElementById(`btn-${id}`);
        const prog = document.getElementById(`prog-${id}`);

        if (type === 'manual') {
            if (url) window.open(url, '_blank');
            return;
        }

        btn.disabled = true;
        btn.textContent = '⏳ Starting...';
        prog.style.display = 'flex';

        try {
            const res = await authFetch(`${API}/api/store/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, url, dirUrl, pattern, cmd, type })
            });
            const data = await res.json();

            if (data.error) {
                btn.disabled = false;
                btn.textContent = '⬇ Retry';
                prog.style.display = 'none';
                alert('Download error: ' + data.error);
                return;
            }

            // Poll progress
            this.pollProgress(id);
        } catch (err) {
            btn.disabled = false;
            btn.textContent = '⬇ Retry';
            prog.style.display = 'none';
            alert('Download failed: ' + err.message);
        }
    },

    async cancelDownload(id) {
        if (!confirm('Cancel this download?')) return;
        try {
            await authFetch(`${API}/api/store/cancel/${id}`, { method: 'POST' });
            const btn = document.getElementById(`btn-${id}`);
            const cancelBtn = document.getElementById(`cancel-${id}`);
            const prog = document.getElementById(`prog-${id}`);
            const fill = document.getElementById(`fill-${id}`);
            const text = document.getElementById(`text-${id}`);
            if (btn) { btn.textContent = '⬇ Download'; btn.disabled = false; }
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (fill) { fill.style.width = '0%'; fill.style.background = ''; }
            if (text) text.textContent = '';
            if (prog) prog.style.display = 'none';
        } catch (e) {
            alert('Cancel failed: ' + e.message);
        }
    },

    async deleteItem(id) {
        if (!confirm('Delete this downloaded content? This cannot be undone.')) return;
        try {
            const res = await authFetch(`${API}/api/store/delete/${id}`, { method: 'DELETE' });
            const data = await res.json();
            const btn = document.getElementById(`btn-${id}`);
            const deleteBtn = document.getElementById(`delete-${id}`);
            const prog = document.getElementById(`prog-${id}`);
            const fill = document.getElementById(`fill-${id}`);
            const text = document.getElementById(`text-${id}`);
            if (btn) { btn.textContent = '⬇ Download'; btn.disabled = false; }
            if (deleteBtn) deleteBtn.style.display = 'none';
            if (fill) { fill.style.width = '0%'; fill.style.background = ''; }
            if (text) text.textContent = '';
            if (prog) prog.style.display = 'none';
            alert(data.message || 'Deleted successfully');
        } catch (e) {
            alert('Delete failed: ' + e.message);
        }
    },

    async pollProgress(id) {
        const fill = document.getElementById(`fill-${id}`);
        const text = document.getElementById(`text-${id}`);
        const btn = document.getElementById(`btn-${id}`);
        const cancelBtn = document.getElementById(`cancel-${id}`);
        const deleteBtn = document.getElementById(`delete-${id}`);

        const check = async () => {
            try {
                const res = await authFetch(`${API}/api/store/progress/${id}`);
                const data = await res.json();

                if (data.status === 'discovering') {
                    text.textContent = 'Finding...';
                    btn.textContent = '🔍 Finding...';
                    if (cancelBtn) cancelBtn.style.display = 'inline-block';
                    setTimeout(check, 2000);
                } else if (data.status === 'downloading') {
                    fill.style.width = data.progress + '%';
                    text.textContent = data.progress + '%';
                    btn.textContent = '⏳ ' + data.progress + '%';
                    if (cancelBtn) cancelBtn.style.display = 'inline-block';
                    setTimeout(check, 2000);
                } else if (data.status === 'complete') {
                    fill.style.width = '100%';
                    fill.style.background = 'var(--green)';
                    text.textContent = 'Complete!';
                    btn.textContent = '✅ Done';
                    btn.disabled = true;
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    if (deleteBtn) deleteBtn.style.display = 'inline-block';
                } else if (data.status === 'failed') {
                    fill.style.width = '100%';
                    fill.style.background = 'var(--red)';
                    text.textContent = 'Failed';
                    btn.textContent = '⬇ Retry';
                    btn.disabled = false;
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    if (data.output) alert('Download failed:\n' + data.output);
                } else if (data.status === 'cancelled') {
                    // Already handled in cancelDownload
                    if (cancelBtn) cancelBtn.style.display = 'none';
                } else {
                    setTimeout(check, 3000);
                }
            } catch {
                setTimeout(check, 5000);
            }
        };
        check();
    }
};
