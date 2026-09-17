const PREFIX_GZIP = 'rm1g.';
const PREFIX_RAW = 'rm1.';

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function gzip(text) {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

function compactDocument(document) {
  return {
    v: 1,
    b: document.blocks
      .filter((block) => typeof block.text === 'string' && block.text.length > 0)
      .map((block) => (block.type === 'heading' ? ['h', block.size, block.text] : ['p', block.text])),
  };
}

export async function encodeDocument(document) {
  const json = JSON.stringify(compactDocument(document));

  if ('CompressionStream' in window) {
    const compressed = await gzip(json);
    return PREFIX_GZIP + bytesToBase64Url(compressed);
  }

  return PREFIX_RAW + bytesToBase64Url(new TextEncoder().encode(json));
}

export function queryLength(query) {
  return new TextEncoder().encode(query).length;
}

export const INLINE_QUERY_LIMIT = 256;

export function buildInlineQuery(documentPayload) {
  return encodeDocument(documentPayload);
}
