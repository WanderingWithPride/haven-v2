# CyberDeck ⚡

A **self-hosted platform** that turns your Android phone into a personal server for media streaming, AI chat, offline Wikipedia, maps, ebooks, and file management — all accessible through a single, stunning cyberpunk-themed web app.

## Features

| Module | Description |
|--------|-------------|
| 🎵 **Music** | Stream FLAC/MP3/OGG with metadata, album art, queue, seek |
| 📸 **Photos** | Gallery with thumbnails, date grouping, lightbox viewer |
| 🎬 **Videos** | Stream videos with range-request seeking, fullscreen |
| 🤖 **AI Chat** | Chat with local LLMs via Ollama (streaming responses) |
| 📚 **Wikipedia** | Offline encyclopedia via Kiwix with search and article viewer |
| 🗺️ **Maps** | Offline/online maps via Leaflet with geolocation |
| 📖 **Ebooks** | EPUB reader (epub.js) and PDF viewer with library management |
| 📁 **Files** | Browse, upload, download, preview, delete files on the phone |

## Quick Start (Termux)

```bash
# 1. Clone/copy the project to your phone
# 2. Navigate to the server directory
cd CyberDeck/server

# 3. Run the setup script (installs everything)
bash setup.sh

# 4. Start the server
node server.js
```

The server will display your LAN IP. Open it in any browser on the same network:
- **Client App**: `http://<phone-ip>:8888`
- **Admin Panel**: `http://<phone-ip>:8888/admin`

## Admin Panel

Access at `/admin` to:
- **Start/stop services** (Ollama, Kiwix)
- **Configure paths** (music, photos, videos, ebooks directories)
- **Scan libraries** to index your media
- **Run terminal commands** directly on Termux
- **Monitor system** (CPU, RAM, uptime)

## Configuration

Edit `server/config.json` or use the Admin Panel GUI:

```json
{
  "port": 8888,
  "paths": {
    "music": "/sdcard/Music",
    "photos": "/sdcard/DCIM",
    "videos": "/sdcard/Movies",
    "ebooks": "/sdcard/Books",
    "root": "/sdcard"
  }
}
```

## Architecture

```
Phone (Termux)                    Client (Browser)
┌──────────────────┐             ┌──────────────────┐
│  Node.js Server  │◄──Wi-Fi───►│  CyberDeck SPA   │
│  + Ollama (LLM)  │             │  8 modules in    │
│  + Kiwix (Wiki)  │             │  one web app     │
└──────────────────┘             └──────────────────┘
```

## Requirements

- Android phone with [Termux](https://f-droid.org/packages/com.termux/)
- Node.js 18+ (installed by setup script)
- 8GB+ RAM recommended for LLM features
- Wi-Fi network for client access

## License

MIT
