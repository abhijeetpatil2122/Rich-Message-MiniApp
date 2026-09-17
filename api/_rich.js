import { gunzipSync } from 'node:zlib';

const PREFIX_GZIP = 'rm1g.';
const PREFIX_RAW = 'rm1.';
const MAX_QUERY_BYTES = 256;
const MAX_TEXT_BYTES = 32768;
const MAX_BLOCKS = 500;

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized + '='.repeat((4 - (normalized.length % 4)) % 4), 'base64');
}

export function decodeDocument(query) {
  if (typeof query !== 'string') throw new Error('Invalid query.');
  if (Buffer.byteLength(query, 'utf8') > MAX_QUERY_BYTES) throw new Error('Inline query is too large.');

  let bytes;
  if (query.startsWith(PREFIX_GZIP)) {
    bytes = gunzipSync(fromBase64Url(query.slice(PREFIX_GZIP.length)));
  } else if (query.startsWith(PREFIX_RAW)) {
    bytes = fromBase64Url(query.slice(PREFIX_RAW.length));
  } else {
    throw new Error('Unsupported rich message payload.');
  }

  if (bytes.length > MAX_TEXT_BYTES * 4) throw new Error('Payload is too large.');
  const document = JSON.parse(bytes.toString('utf8'));
  return validateDocument(document);
}

export function validateDocument(document) {
  if (!document || document.version !== 1 || !Array.isArray(document.blocks)) {
    throw new Error('Invalid document.');
  }

  const blocks = document.blocks.slice(0, MAX_BLOCKS).map((block) => {
    if (!block || !['paragraph', 'heading'].includes(block.type) || typeof block.text !== 'string') {
      throw new Error('Unsupported block.');
    }

    if (block.type === 'heading') {
      const size = Number(block.size);
      if (!Number.isInteger(size) || size < 1 || size > 6) throw new Error('Invalid heading size.');
      return { type: 'heading', text: block.text, size };
    }

    return { type: 'paragraph', text: block.text };
  });

  if (!blocks.length) throw new Error('Document is empty.');

  const textLength = blocks.reduce((total, block) => total + [...block.text].length, 0);
  if (textLength > MAX_TEXT_BYTES) throw new Error('Rich message text is too long.');

  return { version: 1, blocks };
}

export function toTelegramRichMessage(document) {
  return {
    blocks: document.blocks.map((block) => ({
      type: block.type,
      text: block.text,
      ...(block.type === 'heading' ? { size: block.size } : {}),
    })),
  };
}
