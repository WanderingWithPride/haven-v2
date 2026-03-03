// ═══════════════════════════════════════════
// CyberDeck Client - App Controller
// ═══════════════════════════════════════════

const API = window.location.origin;
let currentModule = 'music';
let sidebarCollapsed = false;

// Module switch
function switchModule(name) {
    document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(`mod-${name}`).classList.add('active');
    document.querySelector(`.nav-item[data-module="${name}"]`).classList.add('active');

    currentModule = name;

    // Initialize module on first visit
    const modEl = document.getElementById(`mod-${name}`);
    if (!modEl.dataset.loaded) {
        modEl.dataset.loaded = '1';
        switch (name) {
            case 'music': MusicModule.init(); break;
            case 'photos': PhotosModule.init(); break;
            case 'videos': VideosModule.init(); break;
            case 'llm': LLMModule.init(); break;
            case 'wiki': WikiModule.init(); break;
            case 'maps': MapsModule.init(); break;
            case 'ebooks': EbooksModule.init(); break;
            case 'files': FilesModule.init(); break;
        }
    }

    // Handle player bar padding
    const playerBar = document.getElementById('playerBar');
    if (playerBar.style.display !== 'none') {
        modEl.classList.add('has-player');
    }

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
    }
}

// Sidebar toggle
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('open');
    } else {
        sidebar.classList.toggle('collapsed');
        sidebarCollapsed = sidebar.classList.contains('collapsed');
    }
}

// Connection check
async function checkConnection() {
    const dot = document.querySelector('.conn-dot');
    const text = document.querySelector('.conn-text');
    try {
        const res = await fetch(`${API}/api/system`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            dot.classList.remove('offline');
            text.textContent = 'Connected';
        }
    } catch {
        dot.classList.add('offline');
        text.textContent = 'Offline';
    }
}

// Utility: format duration
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Utility: format bytes
function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Utility: format date
function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Utility: get file icon
function getFileIcon(ext, isDir) {
    if (isDir) return '📁';
    const icons = {
        flac: '🎵', mp3: '🎵', ogg: '🎵', wav: '🎵', aac: '🎵', m4a: '🎵',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', bmp: '🖼️',
        mp4: '🎬', mkv: '🎬', webm: '🎬', avi: '🎬', mov: '🎬',
        pdf: '📄', epub: '📖', txt: '📝', doc: '📄', docx: '📄',
        zip: '📦', tar: '📦', gz: '📦', rar: '📦',
        apk: '📱', exe: '💻', js: '⚙️', py: '🐍', html: '🌐', css: '🎨',
        json: '📋', xml: '📋', csv: '📊'
    };
    return icons[ext] || '📄';
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    switchModule('music');
    checkConnection();
    setInterval(checkConnection, 30000);
});
