# Rich Message MiniApp

A Telegram-native Rich Message editor built from scratch, with the Mini App frontend and Telegram bot backend running together as Vercel Serverless Functions.

## Current scope

- Telegram-style mobile editor UI
- Paragraph blocks
- Heading blocks H1-H6
- Telegram theme integration
- Undo/redo
- Direct `sendRichMessage` delivery to the user's private chat
- Serverless Telegram bot webhook
- `/start` Rich Message Mini App launcher
- `/testrich` Rich Message Mini App test launcher
- No external database

## Stack

- React + Vite
- Telegram Mini Apps SDK
- Vercel Functions / Node.js
- Telegram Bot API Rich Messages

## Environment variables

Set these in the Vercel project:

```text
TELEGRAM_BOT_TOKEN=123456:...
TELEGRAM_WEBHOOK_SECRET=a-long-random-secret
APP_URL=https://rich-message-mini-app.vercel.app/
```

`TELEGRAM_WEBHOOK_SECRET` is optional, but recommended.

## Bot setup

The same Vercel function handles both Mini App API requests and Telegram webhook updates:

```text
https://rich-message-mini-app.vercel.app/api/telegram
```

The webhook should be configured with the same `TELEGRAM_WEBHOOK_SECRET` value:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://rich-message-mini-app.vercel.app/api/telegram","secret_token":"'$TELEGRAM_WEBHOOK_SECRET'"}'
```

### Bot commands

- `/start` — sends the Rich Message Mini App launcher button.
- `/testrich` — sends the same launcher as a dedicated test command.

Both commands use an inline `web_app` button pointing to:

```text
https://rich-message-mini-app.vercel.app/
```

The inline Mini App button is intended for private chats with the bot, as required by Telegram.

## Architecture

```text
                         Vercel
                           |
             +-------------+-------------+
             |                           |
       Mini App frontend          /api/telegram
             |                           |
             |                    +------+------+
             |                    |             |
             |              Bot webhook    Mini App API
             |                    |             |
             |              /start,/testrich  validate initData
             |                    |             |
             |                    +------+------+
             |                           |
             +------------> Telegram Bot API
                                         |
                                  sendRichMessage
                                         |
                                         v
                                   User's chat
```

No separate VPS, Railway process, polling worker, or database is required for the bot webhook.

## Mini App send flow

1. User opens the Mini App from the bot's inline `web_app` button.
2. Telegram provides `Telegram.WebApp.initData`.
3. The frontend sends the document and `initData` to `/api/telegram`.
4. The server validates the Mini App signature with `TELEGRAM_BOT_TOKEN`.
5. The server sends the Rich Message with `sendRichMessage` to the authenticated user's private chat.

Telegram requires Mini App `initData` to be validated on the server before trusting the user information.
