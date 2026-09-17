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
  if (query.startsWith(PREFIX_GZIP)) bytes = gunzipSync(fromBase64Url(query.slice(PREFIX_GZIP.length)));
  else if (query.startsWith(PREFIX_RAW)) bytes = fromBase64Url(query.slice(PREFIX_RAW.length));
  else throw new Error('Unsupported rich message payload.');

  if (bytes.length > MAX_TEXT_BYTES * 4) throw new Error('Payload is too large.');
  let compact;
  try { compact = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Invalid rich message payload.'); }
  return expandAndValidate(compact);
}

function expandAndValidate(input) {
  if (!input || input.v !== 1 || !Array.isArray(input.b) || !input.b.length || input.b.length > MAX_BLOCKS) {
    throw new Error('Invalid document.');
  }

  const blocks = input.b.map((item) => {
    if (!Array.isArray(item)) throw new Error('Unsupported block.');
    if (item[0] === 'p' && typeof item[1] === 'string') return { type: 'paragraph', text: item[1] };
    if (item[0] === 'h' && Number.isInteger(item[1]) && item[1] >= 1 && item[1] <= 6 && typeof item[2] === 'string') {
      return { type: 'heading', text: item[2], size: item[1] };
    }
    throw new Error('Unsupported block.');
  });

  const textLength = blocks.reduce((total, block) => total + [...block.text].length, 0);
  if (textLength > MAX_TEXT_BYTES) throw new Error('Rich message text is too long.');
  if (!blocks.some((block) => block.text.length > 0)) throw new Error('Document is empty.');

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
