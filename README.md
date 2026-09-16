# Rich Message Studio

A Telegram Mini App for composing Rich Messages with a live Telegram-style preview.

## Current foundation

- Vite + React
- Telegram Mini Apps SDK bootstrap
- Canonical editor block model foundation
- Live Telegram-style preview
- Initial block types: heading, paragraph, table, buttons, photo, video, map
- Responsive desktop/mobile layout
- Vercel SPA fallback

## Next implementation

The editor will grow around a tree-based Rich Document Model (RDM), with Telegram schema validation, nested blocks, rich text entities, button actions/styles, full table controls, media upload/file IDs/URLs, channel publishing, and inline sharing.

Telegram's current Bot API supports outgoing Rich Messages via `InputRichMessage` and block/media variants, including media blocks and `sendRichMessage`. citehttps://core.telegram.org/bots/api
