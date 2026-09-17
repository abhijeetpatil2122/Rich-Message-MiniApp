import crypto from 'node:crypto';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
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

function validateInitData(initData) {
  if (typeof initData !== 'string' || !initData) throw new Error('Telegram initData is missing.');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('Invalid Telegram initData.');

  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key !== 'hash') pairs.push(`${key}=${value}`);
  }
  pairs.sort();

  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const expected = crypto.createHmac('sha256', secret).update(pairs.join('\\n')).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('Invalid Telegram initData signature.');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) {
    throw new Error('Telegram initData has expired.');
  }

  const user = JSON.parse(params.get('user') || 'null');
  if (!user?.id) throw new Error('Telegram user is missing.');
  return user;
}

function validateDocument(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.blocks)) throw new Error('Invalid document.');
  if (input.blocks.length > MAX_BLOCKS) throw new Error('Too many blocks.');

  const blocks = input.blocks
    .filter((block) => block && typeof block.text === 'string' && block.text.length > 0)
    .map((block) => {
      if (block.type === 'heading') {
        const size = Number(block.size);
        if (!Number.isInteger(size) || size < 1 || size > 6) throw new Error('Invalid heading size.');
        return { type: 'heading', text: block.text, size };
      }
      if (block.type === 'paragraph') return { type: 'paragraph', text: block.text };
      throw new Error('Unsupported block type.');
    });

  if (!blocks.length) throw new Error('Write something before sending.');
  const textLength = blocks.reduce((total, block) => total + [...block.text].length, 0);
  if (textLength > MAX_TEXT) throw new Error('Rich Message text is over Telegram’s 32,768 character limit.');
  return { blocks };
}

export default async function handler(request, response) {
  if (request.method === 'GET') return response.status(200).json({ ok: true, service: 'rich-message-send' });
  if (request.method !== 'POST') return response.status(405).json({ ok: false, error: 'Method not allowed.' });

  try {
    const user = validateInitData(request.body?.initData);
    const document = validateDocument(request.body?.document);

    const result = await telegram('sendRichMessage', {
      chat_id: user.id,
      blocks: document.blocks,
    });

    return response.status(200).json({ ok: true, message_id: result?.message_id || null });
  } catch (error) {
    console.error('rich message send error', error);
    return response.status(400).json({ ok: false, error: error?.message || 'Could not send Rich Message.' });
  }
}
