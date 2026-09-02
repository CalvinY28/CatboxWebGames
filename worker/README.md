# Catbox multiplayer Worker

This Cloudflare Worker gives each invite link a Durable Object room. The room only handles WebRTC signaling; Tic-Tac-Toe moves travel through an encrypted browser-to-browser data channel.

## Deploy

```bash
cd worker
npm install
npm run deploy
```

The Wrangler configuration deploys the Worker to `multiplayer.catbox.party` as a Cloudflare Custom Domain.

## Test locally

Run the Worker in one terminal:

```bash
cd worker
npm install
npm run dev
```

Run the website in another terminal from the repository root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/games/tic-tac-toe/` in two browser windows.

## Optional TURN fallback

The game works with Cloudflare's public STUN service by default. For players behind restrictive networks, create a Cloudflare Realtime TURN key and add its ID and API token as Worker secrets:

```bash
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_API_TOKEN
```

The browser receives short-lived TURN credentials; the long-lived API token remains inside the Worker.
