import { decodeDocument, toTelegramRichMessage } from './_rich.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || 'https://rich-message-mini-app.vercel.app/';

async function telegram(method, body) {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed.`);
  return data.result;
}

function emptyResult() {
  return {
    button: {
      text: 'Open Rich Message Editor',
      web_app: { url: APP_URL },
    },
    results: [
      {
        type: 'article',
        id: 'editor-help',
        title: 'Create a Rich Message',
        description: 'Open the editor to create a heading and share it inline.',
        input_message_content: {
          message_text: 'Open the Rich Message editor to create a message.',
        },
      },
    ],
    cache_time: 0,
    is_personal: true,
  };
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    return response.status(200).json({ ok: true, service: 'rich-message-inline-bot' });
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  if (WEBHOOK_SECRET && request.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    return response.status(401).json({ ok: false, error: 'Unauthorized.' });
  }

  try {
    const update = request.body || {};
    const inlineQuery = update.inline_query;

    if (!inlineQuery) {
      return response.status(200).json({ ok: true });
    }

    if (!inlineQuery.query) {
      await telegram('answerInlineQuery', {
        inline_query_id: inlineQuery.id,
        ...emptyResult(),
      });
      return response.status(200).json({ ok: true });
    }

    const document = decodeDocument(inlineQuery.query);
    const richMessage = toTelegramRichMessage(document);
    const firstText = document.blocks.find((block) => block.text)?.text || 'Rich Message';
    const title = firstText.length > 42 ? `${firstText.slice(0, 42)}…` : firstText;

    await telegram('answerInlineQuery', {
      inline_query_id: inlineQuery.id,
      results: [
        {
          type: 'article',
          id: `rich-${inlineQuery.id}`,
          title,
          description: 'Rich Message',
          input_message_content: {
            rich_message: richMessage,
          },
        },
      ],
      cache_time: 0,
      is_personal: true,
    });

    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error('inline query error', error);
    if (inlineQueryIdFromRequest(request.body)) {
      try {
        await telegram('answerInlineQuery', {
          inline_query_id: inlineQueryIdFromRequest(request.body),
          results: [],
          cache_time: 0,
          is_personal: true,
        });
      } catch (answerError) {
        console.error('failed to clear inline results', answerError);
      }
    }
    return response.status(200).json({ ok: false, error: error.message });
  }
}

function inlineQueryIdFromRequest(update) {
  return update?.inline_query?.id || null;
}
