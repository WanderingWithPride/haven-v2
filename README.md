# CyberDeck ⚡

A **self-hosted survival/utility platform** that turns your Android phone (or any device running Node.js) into a personal, decentralized server. It provides media streaming, AI chat, offline Wikipedia, maps, encrypted storage, survival guides, and utility tools — all accessible through a single, stunning cyberpunk-themed web app without requiring an internet connection.

## 🌟 Core Features

### Knowledge & Information
| Module | Description |
|--------|-------------|
| 🤖 **AI Chat** | Chat with local LLMs (Llama 3, Phi-3, Mistral) via Ollama. 100% offline, streaming responses. |
| 📚 **Wikipedia** | Offline encyclopedia via Kiwix. Search and read articles without internet. |
| 🗺️ **Maps** | Offline/online maps via Leaflet with geolocation tracking. |
| 📖 **Ebooks** | EPUB reader (epub.js) and PDF viewer. Remembers reading progress. |
| 🛡️ **Survival** | Built-in offline survival guides (Water, Fire, Shelter, First Aid, Navigation) modeled after FM 21-76. |

### Media & Storage
| Module | Description |
|--------|-------------|
| 📁 **Files** | Full file manager. Browse, upload, download, and delete files on the host device. |
| 🎵 **Music** | Stream FLAC/MP3/OGG with metadata, album art extraction, visualizer, and persistent queue. |
| 📸 **Photos** | Photo gallery with lazy-loaded thumbnails, date grouping, EXIF data, and lightbox viewer. |
| 🎬 **Videos** | Stream videos with range-request seeking and fullscreen support. |
| 🔒 **Vault** | AES-256-GCM encrypted secure storage. Encrypt/decrypt files directly in the browser (Zero-knowledge server). |

### Utilities & Communication
| Module | Description |
|--------|-------------|
| 🛠️ **Utilities** | Built-in tools: Compass, Calculator, Unit Converter, Morse Code generator, Flashlight toggle, Coordinates. |
| 📡 **LAN Chat** | Local area network chat room using WebSockets. Works entirely offline across devices on the same Wi-Fi. |
| 📦 **Store** | Built-in downloader to easily grab LLM models (via Ollama) and knowledge packs (ZIM files via Kiwix) with cancel/delete support. |
| 🔋 **Power** | System monitor showing CPU load, RAM usage, storage space, battery level, internal temperature, and active service status. |

## 🚀 Quick Start (Installation)

CyberDeck works on any device running Node.js. Choose your platform:

### Option 1: Android (via Termux) - *Ideal portable survival server*
```bash
# 1. Install Termux and Termux:API from F-Droid (not Play Store)
# 2. Update packages and install git
pkg update && pkg upgrade
pkg install git Termux:API

# 3. Clone and run setup
git clone https://github.com/sarogamedev/CyberDeck.git
cd CyberDeck/server
bash setup.sh
```

### Option 2: Linux (Ubuntu/Debian, Fedora, Arch)
```bash
git clone https://github.com/sarogamedev/CyberDeck.git
cd CyberDeck/server
sudo bash setup-linux.sh
```

### Option 3: Windows (PowerShell)
```powershell
git clone https://github.com/sarogamedev/CyberDeck.git
cd CyberDeck\server
# Run as Administrator for automatic dependency installation
.\setup-windows.ps1
```

### Starting the Server
Once setup is complete on any OS, start the server with:
```bash
node server.js
```

The server will display your LAN IP (e.g., `192.168.1.38`). 
Open that IP on any device connected to the same Wi-Fi network:
- **Client App**: `http://<phone-ip>:8888`
- **Admin Panel**: `http://<phone-ip>:8888/admin`

*(Note: CyberDeck uses a default username `admin` and password `cyberdeck` for first-time access. Change this immediately in the Admin Panel).*

## 🔌 Admin Panel (`/admin`)

Access the admin dashboard to manage your CyberDeck node:
- **Security**: Change the access username and password.
- **Service Management**: Start/stop background services (Ollama, Kiwix).
- **Library Scanning**: Force rescan of Music, Photos, Videos, and Ebooks directories.
- **Configuration**: Change default directory paths (`/sdcard/Music`, etc.).
- **Terminal Access**: Run direct shell commands on the host device from your browser.
- **System Metrics**: Real-time server performance graphing.

## 🎛️ How to Use Advanced Features

### Setting up Offline Wikipedia (Kiwix)
1. Go to the **Store** module in the CyberDeck app.
2. Find "Wikipedia", "Medical Wikipedia", or "Survival Manuals".
3. Click Download. The server will fetch the `.zim` file (can be several GBs).
4. Go to **Admin Panel**, ensure Kiwix is enabled, and start the service.
5. Open the **Wikipedia** module to search and read offline!

### Setting up Offline AI (Ollama)
1. Go to the **Store** module and download a model (e.g., `Llama 3.2 3B` or `Phi-3 Mini`).
2. Open the **AI Chat** module. CyberDeck will automatically detect the installed models and allow you to chat completely offline.

### Using the Secure Vault
1. Open the **Vault** module.
2. Enter a strong master password to unlock the vault. *Do not lose this password; the server does not store it and cannot recover encrypted files.*
3. Upload files. They are encrypted *in your browser* before being sent to the server.
4. To view/download, the file is fetched encrypted and decrypted locally in your browser memory.

### LAN Chat
1. Open the **LAN Chat** module.
2. Enter a username.
3. Anyone else on the network who connects to your CyberDeck IP and opens LAN chat will instantly join the room. No internet required.

## 🏗️ Architecture

```text
Host Device (Termux/PC)                 Client (Any Browser)
┌──────────────────────┐               ┌──────────────────────┐
│  Node.js Server      │               │  CyberDeck SPA       │
│  ├─ Express API      │◄─── Wi-Fi ───►│  ├─ Vanilla JS/CSS   │
│  ├─ SQLite DB        │   (Offline)   │  ├─ WebSockets       │
│  ├─ Ollama (LLMs)    │               │  ├─ Crypto API       │
│  └─ Kiwix (Wiki)     │               │  └─ Service Workers  │
└──────────────────────┘               └──────────────────────┘
```

Everything is built using Vanilla JavaScript, HTML, and CSS without heavy frontend frameworks to ensure maximum performance on low-end devices and rapid loading over local networks.

## 📋 Requirements
- **Host**: Node.js 18+ (Android via Termux, Linux, Windows, macOS).
- **Client**: Any modern web browser.
- **Hardware**: For basic features, any smartphone from the last 10 years works. For **AI Chat**, a device with at least 6GB RAM (8GB+ recommended) is required.
- **Network**: Wi-Fi router or Mobile Hotspot (no active internet connection required after initial setup/downloads).

## 📄 License
MIT License. Build, mod, and survive.
