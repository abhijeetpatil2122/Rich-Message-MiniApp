import { getShare } from './_share-store.js';
import { toTelegramRichMessage } from '../src/lib/document.js';

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

function shareIdFromQuery(query) {
  const match = /^rm_([a-f0-9]{32})$/i.exec(query.trim());
  return match?.[1] || null;
}

function titleForDocument(document) {
  const text = document.blocks
    .map((block) => block.text)
    .filter(Boolean)
    .join(' ')
    .trim();

  if (!text) return 'Rich Message';
  return text.length > 64 ? `${text.slice(0, 63)}…` : text;
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

  const update = request.body || {};
  const inlineQuery = update.inline_query;

  if (!inlineQuery) {
    return response.status(200).json({ ok: true });
  }

  try {
    if (!inlineQuery.query) {
      await telegram('answerInlineQuery', {
        inline_query_id: inlineQuery.id,
        ...emptyResult(),
      });
      return response.status(200).json({ ok: true });
    }

    const shareId = shareIdFromQuery(inlineQuery.query);
    if (!shareId) {
      await telegram('answerInlineQuery', {
        inline_query_id: inlineQuery.id,
        results: [],
        cache_time: 0,
        is_personal: true,
      });
      return response.status(200).json({ ok: true });
    }

    const document = await getShare(shareId);
    if (!document) {
      await telegram('answerInlineQuery', {
        inline_query_id: inlineQuery.id,
        results: [],
        cache_time: 0,
        is_personal: true,
      });
      return response.status(200).json({ ok: true });
    }

    const richMessage = toTelegramRichMessage(document);
    if (!richMessage.blocks.length) {
      await telegram('answerInlineQuery', {
        inline_query_id: inlineQuery.id,
        results: [],
        cache_time: 0,
        is_personal: true,
      });
      return response.status(200).json({ ok: true });
    }

    await telegram('answerInlineQuery', {
      inline_query_id: inlineQuery.id,
      results: [
        {
          type: 'article',
          id: `rich-${shareId}`,
          title: titleForDocument(document),
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

    try {
      await telegram('answerInlineQuery', {
        inline_query_id: inlineQuery.id,
        results: [],
        cache_time: 0,
        is_personal: true,
      });
    } catch (answerError) {
      console.error('failed to clear inline results', answerError);
    }

    return response.status(200).json({ ok: false, error: error.message });
  }
}
