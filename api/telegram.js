import crypto from 'node:crypto';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || 'https://rich-message-mini-app.vercel.app/';
const MAX_BLOCKS = 500;
const MAX_TEXT = 32768;

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

function validateWebhookSecret(request) {
  if (!WEBHOOK_SECRET) return true;
  return request.headers['x-telegram-bot-api-secret-token'] === WEBHOOK_SECRET;
}

function richAppKeyboard() {
  return {
    inline_keyboard: [[
      { text: '✏️ Open Rich Message Editor', web_app: { url: APP_URL } },
    ]],
  };
}

async function handleBotUpdate(update) {
  const message = update?.message;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  const chat = message?.chat;
  if (!chat || chat.type !== 'private' || !text) return;

  const command = text.split(/\s+/, 1)[0].split('@', 1)[0].toLowerCase();
  if (command === '/start') {
    await telegram('sendMessage', {
      chat_id: chat.id,
      text: '👋 Welcome!\n\nCreate and send Telegram Rich Messages directly from the Mini App.',
      reply_markup: richAppKeyboard(),
    });
    return;
  }
  if (command === '/testrich') {
    await telegram('sendMessage', {
      chat_id: chat.id,
      text: '🧪 Rich Message Mini App test launcher:',
      reply_markup: richAppKeyboard(),
    });
  }
}

function validateInitData(initData) {
  if (typeof initData !== 'string' || !initData) throw new Error('Telegram initData is missing.');
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) throw new Error('Invalid Telegram initData.');

  params.delete('hash');
  params.sort();
  const dataCheckString = [...params.entries()].map(([key, value]) => `${key}=${value}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN, 'utf8').digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString, 'utf8').digest('hex');
  const received = Buffer.from(receivedHash, 'hex');
  const calculated = Buffer.from(calculatedHash, 'hex');

  if (received.length !== calculated.length || !crypto.timingSafeEqual(received, calculated)) {
    const error = new Error('Invalid Telegram initData signature.');
    error.code = 'INVALID_INIT_DATA_SIGNATURE';
    throw error;
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) {
    throw new Error('Telegram initData has expired.');
  }

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); }
  catch { throw new Error('Invalid Telegram user data.'); }
  if (!user?.id) throw new Error('Telegram user is missing.');
  return user;
}

async function getBotIdentity() {
  try {
    const bot = await telegram('getMe', {});
    return bot?.username ? `@${bot.username}` : null;
  } catch {
    return null;
  }
}

function validateDocument(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.blocks)) throw new Error('Invalid document.');
  if (input.blocks.length > MAX_BLOCKS) throw new Error('Too many blocks.');

  const blocks = input.blocks
    .filter((block) => block && typeof block === 'object')
    .map((block) => {
      if (block.type === 'divider') return { type: 'divider' };

      if (typeof block.text !== 'string' || block.text.length === 0) return null;

      if (block.type === 'paragraph') return { type: 'paragraph', text: block.text };

      if (block.type === 'heading') {
        const size = Number(block.size);
        if (!Number.isInteger(size) || size < 1 || size > 6) throw new Error('Invalid heading size.');
        return { type: 'heading', text: block.text, size };
      }

      if (block.type === 'pre') {
        const language = typeof block.language === 'string' ? block.language.trim() : '';
        if (language.length > 100) throw new Error('Code language is too long.');
        return { type: 'pre', text: block.text, ...(language ? { language } : {}) };
      }

      if (block.type === 'footer') return { type: 'footer', text: block.text };

      throw new Error(`Unsupported block type: ${block.type || 'unknown'}.`);
    })
    .filter(Boolean);

  if (!blocks.length) throw new Error('Write something before sending.');
  const textLength = blocks.reduce((total, block) => total + (block.text ? [...block.text].length : 0), 0);
  if (textLength > MAX_TEXT) throw new Error('Rich Message text is over Telegram’s 32,768 character limit.');
  return blocks;
}

export default async function handler(request, response) {
  if (request.method === 'GET') return response.status(200).json({ ok: true, service: 'rich-message-bot' });
  if (request.method !== 'POST') return response.status(405).json({ ok: false, error: 'Method not allowed.' });

  try {
    const body = request.body || {};

    if (!body.initData && body.update_id !== undefined) {
      if (!validateWebhookSecret(request)) return response.status(401).json({ ok: false, error: 'Unauthorized webhook request.' });
      await handleBotUpdate(body);
      return response.status(200).json({ ok: true });
    }

    const user = validateInitData(body.initData);
    const blocks = validateDocument(body.document);
    const result = await telegram('sendRichMessage', {
      chat_id: user.id,
      rich_message: { blocks },
    });

    return response.status(200).json({ ok: true, message_id: result?.message_id || null });
  } catch (error) {
    console.error('telegram handler error', error);

    if (error?.code === 'INVALID_INIT_DATA_SIGNATURE') {
      const botIdentity = await getBotIdentity();
      const suffix = botIdentity
        ? ` Backend TELEGRAM_BOT_TOKEN belongs to ${botIdentity}. Make sure this is the same bot that opened this Mini App.`
        : ' The backend TELEGRAM_BOT_TOKEN could not be verified with Telegram.';
      return response.status(400).json({ ok: false, error: `Invalid Telegram initData signature.${suffix}` });
    }

    return response.status(400).json({ ok: false, error: error?.message || 'Telegram request failed.' });
  }
}
