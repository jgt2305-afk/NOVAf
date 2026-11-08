# Nova Proxy

Nova is a local browser-style web proxy with a black starfield start page, neon blue controls, app shortcuts, and tabs. It uses Scramjet in the browser and Libcurl over a local Wisp transport server. Brand marks are rendered from Simple Icons.

## Start it

Install Node.js 20 or newer and pnpm, then run:

```powershell
pnpm install
pnpm dev
```

Open the local URL printed by the server (normally `http://127.0.0.1:4173`). The proxy service worker needs localhost or HTTPS; opening `index.html` directly from disk will not work.

Searches use DuckDuckGo. Search results, shortcut clicks, YouTube, TikTok, and other destinations load inside the selected Nova browser tab. In-page navigation updates the address bar and stays in the proxied tab. The address bar also accepts full website addresses. Some sites may still block proxied playback, sign-in, or other interactive features.

The server binds to `127.0.0.1` by default and blocks private and loopback destinations. Keep it local while developing. Before exposing it on a public network, add authentication, rate limits, and deployment-specific network restrictions.
