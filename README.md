# WHY Chat (chat.html)

A ready-to-fork, open-source Discord analogue. Place this folder on GitHub, slice it into your own community, and keep the polished chat UI under your control.

## What's included
- **`chat.html`** – a single-file experience with the two-pane lobby, sidebar badges, presence indicators, message cards, notifications, profile modal, and embedded Algorand wallet widgets.
- **`docs/chat-open-source.md`** – marketing copy that maps WHY Chat to Discord expectations, spells out the open-source benefits, and gives contributors guidance for customization.

## Quick start
1. Drop this folder into a GitHub repo (rename to your preferred project name) and commit the files.
2. Serve the contents with any static host (`npx http-server -c-1`, Netlify/Vercel, GitHub Pages, etc.).
3. Optional: hook the wallet cards to your Algorand node by setting up `/.netlify/functions/OMNIBRANE-proxy` or pointing the `proxyAlgodFetch` helper at any JSON RPC endpoint. Add `VAULT_URL`/Algod URLs as needed.
4. Open `chat.html` and share it as your Discord-style lobby.

## Why this repo works
- No build step—`chat.html` bundles all layout, styling, and interaction logic in one document.
- Remote dependencies are minimal (Algorand SDK, EmailJS, Firebase modules via CDN) so you can host it anywhere.
- Replace the Algorand wallet block with another data source or webhook without rewriting the UI.
- Add screenshots, branding, or analytics by editing the top of the page; all assets are inline or remote placeholders.

## Marketing & contributions
- Update `docs/chat-open-source.md` when you fork the project so collaborators understand how it mirrors Discord.
- Document new bots, embeds, or event hooks you add directly in this repo’s README or new markdown files.
- Tag releases and keep a `CHANGELOG.md` if you start branching the experience for events or communities.

## License
This project is licensed under MIT. See the `LICENSE` file for details.
