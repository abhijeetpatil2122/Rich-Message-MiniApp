const EMPTY_DOCUMENT = {
  version: 1,
  blocks: [{ id: crypto.randomUUID(), type: 'paragraph', text: '' }],
};

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'pre', 'footer', 'divider']);

export function createBlock(type = 'paragraph', size = 1, text = '') {
  return {
    id: crypto.randomUUID(),
    type,
    ...(type === 'heading' ? { size } : {}),
    ...(type === 'pre' ? { language: '' } : {}),
    ...(type === 'divider' ? {} : { text }),
  };
}

export function createInitialDocument() {
  return structuredClone(EMPTY_DOCUMENT);
}

export function normalizeDocument(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.blocks)) {
    return createInitialDocument();
  }

  const blocks = input.blocks
    .filter((block) => block && BLOCK_TYPES.has(block.type))
    .slice(0, 500)
    .map((block) => {
      if (block.type === 'divider') {
        return { id: block.id || crypto.randomUUID(), type: 'divider' };
      }

      const text = typeof block.text === 'string' ? block.text : '';
      if (block.type === 'heading') {
        const size = Math.min(6, Math.max(1, Number(block.size) || 1));
        return { id: block.id || crypto.randomUUID(), type: 'heading', size, text };
      }

      if (block.type === 'pre') {
        return {
          id: block.id || crypto.randomUUID(),
          type: 'pre',
          language: typeof block.language === 'string' ? block.language : '',
          text,
        };
      }

      return { id: block.id || crypto.randomUUID(), type: block.type, text };
    });

  return {
    version: 1,
    blocks: blocks.length ? blocks : [createBlock()],
  };
}

export function toTelegramRichMessage(document) {
  const normalized = normalizeDocument(document);
  return {
    blocks: normalized.blocks
      .filter((block) => block.type === 'divider' || block.text.length > 0)
      .map((block) => {
        if (block.type === 'heading') return { type: 'heading', text: block.text, size: block.size };
        if (block.type === 'pre') return { type: 'pre', text: block.text, ...(block.language ? { language: block.language } : {}) };
        if (block.type === 'footer') return { type: 'footer', text: block.text };
        if (block.type === 'divider') return { type: 'divider' };
        return { type: 'paragraph', text: block.text };
      }),
  };
}

export function documentTextLength(document) {
  return normalizeDocument(document).blocks.reduce((total, block) => total + (block.text || '').length, 0);
}
