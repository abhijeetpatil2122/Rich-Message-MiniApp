const EMPTY_DOCUMENT = {
  version: 1,
  blocks: [{ id: crypto.randomUUID(), type: 'paragraph', text: '' }],
};

export function createBlock(type = 'paragraph', size = 1, text = '') {
  return {
    id: crypto.randomUUID(),
    type,
    ...(type === 'heading' ? { size } : {}),
    text,
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
    .filter((block) => block && (block.type === 'paragraph' || block.type === 'heading'))
    .slice(0, 500)
    .map((block) => {
      const text = typeof block.text === 'string' ? block.text : '';
      if (block.type === 'heading') {
        const size = Math.min(6, Math.max(1, Number(block.size) || 1));
        return { id: block.id || crypto.randomUUID(), type: 'heading', size, text };
      }
      return { id: block.id || crypto.randomUUID(), type: 'paragraph', text };
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
      .filter((block) => block.text.length > 0)
      .map((block) =>
        block.type === 'heading'
          ? { type: 'heading', text: block.text, size: block.size }
          : { type: 'paragraph', text: block.text },
      ),
  };
}

export function documentTextLength(document) {
  return normalizeDocument(document).blocks.reduce((total, block) => total + block.text.length, 0);
}
