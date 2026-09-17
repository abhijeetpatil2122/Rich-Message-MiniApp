import { normalizeDocument, toTelegramRichMessage, documentTextLength } from '../src/lib/document.js';
import { createShare } from './_share-store.js';

const MAX_RICH_TEXT = 32768;
const MAX_BLOCKS = 500;

function validateDocument(input) {
  const document = normalizeDocument(input);

  if (!Array.isArray(document.blocks) || document.blocks.length > MAX_BLOCKS) {
    throw new Error('The Rich Message contains too many blocks.');
  }

  if (documentTextLength(document) > MAX_RICH_TEXT) {
    throw new Error('Rich Message text is over Telegram’s 32,768 character limit.');
  }

  const payload = toTelegramRichMessage(document);
  if (!payload.blocks.length) {
    throw new Error('Write something before sharing.');
  }

  return document;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  try {
    const document = validateDocument(request.body?.document);
    const id = await createShare(document);

    // Keep the inline query tiny. The actual Rich Message JSON stays server-side.
    return response.status(200).json({
      ok: true,
      query: `rm_${id}`,
      expires_in: 600,
    });
  } catch (error) {
    console.error('share preparation error', error);
    return response.status(400).json({
      ok: false,
      error: error?.message || 'Could not prepare the Rich Message.',
    });
  }
}
