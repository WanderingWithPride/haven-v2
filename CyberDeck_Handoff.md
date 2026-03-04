# CyberDeck Handoff Document

You are continuing work on "CyberDeck", a self-hosted platform where an Android phone runs as the server (via Termux + Node.js) and serves a highly-polished, unified web app (SPA) to any device on the local network. 

The architecture is extremely componentized. The backend is Express/Node, and the frontend is Vanilla JS + HTML + CSS with a sleek, dark-mode cyberpunk aesthetic (glassmorphism, neon accents). **No complex build tools (Webpack, React, etc.) are used — everything is native Vanilla JS and HTML.**

## Current State of the Project

The core platform (Tier 1) and advanced offline/p2p features (Tier 2) are **100% complete and working**. 

### Server Architecture (Node.js/Express)
- **`server.js`**: Main entrypoint. Auto-discovers LAN IP, handles CORS, mounts `/api/` routes and serves the `/admin` and static client.
- **`config.json`**: Stores absolute paths for media (`/sdcard/Music`, etc.) and port configurations for services (Ollama, Kiwix, Maps).
- **Core Routes** (`server/routes/`):
  - `music.js`, `photos.js`, `videos.js`, `ebooks.js`: Scanners and streaming endpoints for media.
  - `llm.js`: Proxies chat requests to a local Ollama instance (port 11434).
  - `wiki.js`: Proxies search and article requests to a local Kiwix-serve instance (port 8889).
  - `maps.js`: Serves offline OpenStreetMap tiles (`/tiles/:z/:x/:y.png`) and handles background downloading of bounding box regions directly from OSM.
  - `files.js`: A full file manager API (upload, download, mkdir, delete).
  - `store.js`: Handles backend downloading of large files (ZIMs, models) using `https.get`, `fs.createWriteStream`, and supports HTTP Range headers for pausing/resuming.

### Client Architecture (Vanilla JS SPA)
- **`index.html`**: The app shell. Contains the sidebar nav and a single `<main>` container where modules are injected dynamically.
- **`sw.js` & `manifest.json`**: Progressive Web App (PWA) configuration allowing offline caching of the app shell and install-to-homescreen.
- **`css/style.css`**: The design system. Uses CSS variables for theming (`--surface`, `--neon-blue`, etc.).
- **Client Modules** (`client/js/`):
  - **`app.js`**: Controls routing by swapping DOM content based on the URL hash and calling the `.init()` method of individual module objects (e.g., `MapsModule.init()`).
  - **`music.js`, `photos.js`, `videos.js`, `ebooks.js`**: Media consumption interfaces.
  - **`llm.js`**: Chat UI that streams responses from the Ollama proxy.
  - **`wiki.js`**: Article viewer. **Crucial detail:** the client intercepts Kiwix's raw HTML, overrides links to keep them inside the SPA, and forcibly strips out raw LaTeX/MathML tags that crash the layout.
  - **`maps.js`**: Uses Leaflet.js. The user can select a bounding box to download OSM tiles to disk. The UI has a toggle button to switch between online and downloaded offline tiles.
  - **`chat.js`**: A WebSocket-based LAN chat room with SOS alerts.
  - **`p2p.js`**: Integrates with the WebSocket chat to perform WebRTC signaling, allowing direct device-to-device file transfers without uploading to the Node server first.
  - **`store.js`**: A "Content Store" UI that lets the user trigger server-side background downloads (like grabbing a 50GB Wikipedia ZIM file). The client polls for progress and accurately renders pause/resume states.

## Important Technical Nuances

1. **AuthFetch**: All client-side requests to `/api/*` MUST use the generic wrapper `authFetch(url, options)` defined in `index.html`, which auto-injects the JWT authentication token.
2. **Path Resolution**: The server runs on Windows during development but is deployed on Android. Use `path.resolve()` and `path.join(__dirname, ...)` carefully to ensure paths don't break across OS boundaries.
3. **Vanilla JS Lifecycle**: Each client module must have an `init()` method that clears the main container, injects HTML via string templates, and binds event listeners dynamically.
4. **WebSocket Global State**: `chat.js` maintains a global `window.appSocket` connection. `p2p.js` heavily relies on this socket state specifically for its WebRTC signaling.