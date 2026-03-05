# Third Party Licenses

CyberDeck safely leverages several powerful open-source libraries to function offline:

## Backend

| Library | License | Source / Repository |
|---------|---------|---------------------|
| **express** | MIT | [expressjs/express](https://github.com/expressjs/express) |
| **ws** | MIT | [websockets/ws](https://github.com/websockets/ws) |
| **multer** | MIT | [expressjs/multer](https://github.com/expressjs/multer) |
| **cors** | MIT | [expressjs/cors](https://github.com/expressjs/cors) |
| **mime-types** | MIT | [jshttp/mime-types](https://github.com/jshttp/mime-types) |
| **multicast-dns** | MIT | [mafintosh/multicast-dns](https://github.com/mafintosh/multicast-dns) |
| **music-metadata** | MIT | [Borewit/music-metadata](https://github.com/Borewit/music-metadata) |
| **sharp** | Apache-2.0 | [lovell/sharp](https://github.com/lovell/sharp) |
| **node-fetch** | MIT | [node-fetch/node-fetch](https://github.com/node-fetch/node-fetch) |
| **selfsigned** | MIT | [jfromaniello/selfsigned](https://github.com/jfromaniello/selfsigned) |

## Frontend

Because CyberDeck prioritizes lightweight portability, the frontend entirely avoids heavy frameworks (React, Vue, etc.) and instead uses standard Vanilla JS/CSS alongside a few specialized renderers.

| Library | License | Source / Repository |
|---------|---------|---------------------|
| **Leaflet.js** | BSD-2-Clause | [leafletjs.com](https://leafletjs.com) |
| **Epub.js** | BSD-3-Clause | [futurepress/epub.js](https://github.com/futurepress/epub.js) |
| **qrcode.js** | MIT | [davidshimjs/qrcodejs](https://github.com/davidshimjs/qrcodejs) |
| **jsQR** | Apache-2.0 | [cozmo/jsQR](https://github.com/cozmo/jsQR) |

## External Services

These services are interfaced with natively on the host OS and are not bundled directly inside the JS application footprint.

| Service | License | Repository | Description |
|---------|---------|------------|-------------|
| **Kiwix** | GPL-3.0 | [kiwix.org](https://www.kiwix.org/) | Used as an external service to provide offline Wikipedia access. |
| **Ollama** | MIT | [ollama.ai](https://ollama.ai/) | Used as a local runtime for running large language models. |