# Rich Message MiniApp

A Telegram-native Rich Message editor built from scratch.

## Current scope

- Telegram-style mobile editor UI
- Paragraph blocks
- Heading blocks H1-H6
- Contextual `Aa` formatting menu
- Telegram theme integration
- Undo/redo shell prepared for the next phase
- Inline sharing through `Telegram.WebApp.switchInlineQuery()`
- Vercel Node.js Function for inline queries
- Direct `InputRichMessageContent` + `InputRichMessage.blocks` output
- No external database

The editor payload is compressed and carried through Telegram's inline query. This keeps the first version stateless: the server does not need to store a document before the user shares it.

## Stack

- React + Vite
- Telegram Mini Apps SDK
- Vercel Functions / Node.js
- Telegram Bot API 10.3 Rich Messages

## Environment variables

Set these in the Vercel project:

```text
TELEGRAM_BOT_TOKEN=123456:...
TELEGRAM_WEBHOOK_SECRET=a-long-random-secret
APP_URL=https://rich-message-mini-app.vercel.app/
```

`TELEGRAM_WEBHOOK_SECRET` is optional, but recommended.

## Bot setup

1. Enable inline mode for the bot with `@BotFather` using `/setinline`.
2. Set the Mini App URL to:
   `https://rich-message-mini-app.vercel.app/`
3. Deploy this project.
4. Set the bot webhook to:
   `https://rich-message-mini-app.vercel.app/api/telegram`
   using the same secret configured in `TELEGRAM_WEBHOOK_SECRET`.
5. Open the bot in inline mode. An empty inline query shows **Open Rich Message Editor**.
6. Create a heading, press the blue share button, choose a chat, then select the returned Rich Message result.

Example webhook command:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://rich-message-mini-app.vercel.app/api/telegram","secret_token":"'$TELEGRAM_WEBHOOK_SECRET'"}'
```

## Architecture

```text
Telegram Mini App
       |
       v
  Rich Document
       |
       +----> local editor state
       |
       +----> compressed inline query (<= 256 bytes)
                         |
                         v
              Telegram inline mode
                         |
                         v
                /api/telegram
                         |
                         v
             InputRichMessageContent
                         |
                         v
                  Telegram chat
```

The inline payload is deliberately versioned (`rm1g.` / `rm1.`), so the serialization format can evolve without coupling the editor UI to Telegram's transport format.

## Important limitation of this first step

Telegram inline queries are limited to 256 characters. The current editor therefore rejects a document when its compressed transport payload cannot fit inside that limit. That is intentional for the first stateless version; a later phase can add a persistent/share-token mechanism without changing the editor document model.
