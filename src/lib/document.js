// Inline formatting marks a run of text can carry. These map 1:1 onto
// Telegram Bot API 10.1 RichText tagged types (bold/italic/underline/
// strikethrough/spoiler/code/marked/subscript/superscript); `link` is
// stored separately on the run since it carries a URL and serializes to
// the RichText "url" type.
export const MARKS = [
  { key: 'bold', label: 'Bold', tag: 'b' },
  { key: 'italic', label: 'Italic', tag: 'i' },
  { key: 'underline', label: 'Underline', tag: 'u' },
  { key: 'strikethrough', label: 'Strikethrough', tag: 's' },
  { key: 'code', label: 'Monospace', tag: 'code' },
  { key: 'spoiler', label: 'Spoiler', tag: 'span' },
  { key: 'marked', label: 'Mark', tag: 'mark' },
  { key: 'subscript', label: 'Subscript', tag: 'sub' },
  { key: 'superscript', label: 'Superscript', tag: 'sup' },
];
const MARK_KEYS = new Set(MARKS.map((mark) => mark.key));

export function createRun(text = '', marks = [], link = null) {
  return { text, marks: marks.filter((mark) => MARK_KEYS.has(mark)), link: link || null };
}

const EMPTY_RUNS = () => [createRun('')];

function sameFormat(a, b) {
  if (a.link !== b.link) return false;
  if (a.marks.length !== b.marks.length) return false;
  return a.marks.every((mark) => b.marks.includes(mark));
}

// Flattens runs back into their plain-text content (formatting stripped),
// used for length checks, caret-offset math, and empty/placeholder tests.
export function runsText(runs) {
  return (runs || []).map((run) => run.text).join('');
}

// Extracts the runs covering flat character offsets [start, end), splitting
// a run at either boundary if the cut falls in its middle.
export function sliceRuns(runs, start, end) {
  const result = [];
  let pos = 0;
  for (const run of runs || []) {
    const runStart = pos;
    const runEnd = pos + run.text.length;
    pos = runEnd;
    const from = Math.max(start, runStart);
    const to = Math.min(end, runEnd);
    if (from < to) result.push(createRun(run.text.slice(from - runStart, to - runStart), run.marks, run.link));
  }
  return result.length ? result : EMPTY_RUNS();
}

// Concatenates run arrays, merging adjacent runs that share identical
// formatting so the run list doesn't fragment on every edit.
export function mergeRuns(...runArrays) {
  const combined = runArrays.flat().filter((run) => run.text !== '');
  const result = [];
  for (const run of combined) {
    const last = result[result.length - 1];
    if (last && sameFormat(last, run)) last.text += run.text;
    else result.push(createRun(run.text, run.marks, run.link));
  }
  return result.length ? result : EMPTY_RUNS();
}

function runToRichTextNode(run) {
  let node = run.text;
  // Innermost-out wrap order; fixed so serialization is deterministic.
  for (const mark of ['spoiler', 'marked', 'bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript', 'code']) {
    if (run.marks.includes(mark)) node = { type: mark, text: node };
  }
  if (run.link) node = { type: 'url', text: node, url: run.link };
  return node;
}

// Converts a block's runs into a Telegram Bot API RichText value: a plain
// string when there's no formatting at all, otherwise the tagged tree/array
// form the API expects.
export function runsToRichText(runs) {
  const parts = (runs || []).filter((run) => run.text.length > 0).map(runToRichTextNode);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return parts;
}

// A list item, for v1, is a single plain-text line — no inline formatting
// yet (see LIST_ITEM scope note in App.jsx). `checked` only matters for
// checklist-style lists.
export function createListItem(text = '') {
  return { id: crypto.randomUUID(), text, checked: false };
}

const LIST_STYLES = new Set(['bullet', 'number', 'checklist']);

const EMPTY_DOCUMENT = {
  version: 1,
  blocks: [{ id: crypto.randomUUID(), type: 'paragraph', runs: EMPTY_RUNS() }],
};

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'pre', 'footer', 'divider', 'blockquote', 'pullquote', 'list']);
// Blockquote/pullquote hold one rich-text paragraph's worth of `runs`,
// exactly like paragraph/heading/footer — they only add an optional plain
// `credit` line on top. This lets them reuse the entire inline-formatting
// engine (splitting, merging, marks, links) with no special-casing.
const RICH_TYPES = new Set(['paragraph', 'heading', 'footer', 'blockquote', 'pullquote']);
const QUOTE_TYPES = new Set(['blockquote', 'pullquote']);

export function createBlock(type = 'paragraph', size = 1, text = '') {
  return {
    id: crypto.randomUUID(),
    type,
    ...(type === 'heading' ? { size } : {}),
    ...(type === 'pre' ? { language: '', text } : {}),
    ...(RICH_TYPES.has(type) ? { runs: text ? [createRun(text)] : EMPTY_RUNS() } : {}),
    ...(QUOTE_TYPES.has(type) ? { credit: null } : {}),
    ...(type === 'list' ? { style: 'bullet', items: [createListItem(text)] } : {}),
  };
}

export function createInitialDocument() {
  return structuredClone(EMPTY_DOCUMENT);
}

function normalizeRuns(block) {
  if (Array.isArray(block.runs) && block.runs.length) {
    return block.runs
      .filter((run) => run && typeof run.text === 'string')
      .map((run) => createRun(run.text, Array.isArray(run.marks) ? run.marks : [], typeof run.link === 'string' ? run.link : null));
  }
  if (typeof block.text === 'string' && block.text) return [createRun(block.text)];
  return EMPTY_RUNS();
}

function normalizeListItems(input) {
  const items = Array.isArray(input)
    ? input
        .filter((item) => item && typeof item === 'object')
        .slice(0, 200)
        .map((item) => ({
          id: item.id || crypto.randomUUID(),
          text: typeof item.text === 'string' ? item.text : '',
          checked: !!item.checked,
        }))
    : [];
  return items.length ? items : [createListItem()];
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

      if (block.type === 'pre') {
        const text = typeof block.text === 'string' ? block.text : '';
        return {
          id: block.id || crypto.randomUUID(),
          type: 'pre',
          language: typeof block.language === 'string' ? block.language : '',
          text,
        };
      }

      if (block.type === 'list') {
        const style = LIST_STYLES.has(block.style) ? block.style : 'bullet';
        return { id: block.id || crypto.randomUUID(), type: 'list', style, items: normalizeListItems(block.items) };
      }

      const runs = normalizeRuns(block);
      const credit = QUOTE_TYPES.has(block.type) ? (typeof block.credit === 'string' && block.credit.trim() ? block.credit : null) : undefined;

      if (block.type === 'heading') {
        const size = Math.min(6, Math.max(1, Number(block.size) || 1));
        return { id: block.id || crypto.randomUUID(), type: 'heading', size, runs };
      }

      return { id: block.id || crypto.randomUUID(), type: block.type, runs, ...(credit !== undefined ? { credit } : {}) };
    });

  return {
    version: 1,
    blocks: blocks.length ? blocks : [createBlock()],
  };
}

// For ordered lists, the API wants a plain accessibility label per item; we
// mirror whatever marker the item visually shows.
function listItemLabel(style, index) {
  if (style === 'number') return String(index + 1);
  if (style === 'checklist') return '';
  return '•';
}

export function toTelegramRichMessage(document) {
  const normalized = normalizeDocument(document);
  return {
    blocks: normalized.blocks
      .filter((block) => {
        if (block.type === 'divider') return true;
        if (block.type === 'pre') return block.text.length > 0;
        if (block.type === 'list') return block.items.some((item) => item.text.trim().length > 0);
        return runsText(block.runs).length > 0;
      })
      .map((block) => {
        if (block.type === 'heading') return { type: 'heading', text: runsToRichText(block.runs), size: block.size };
        if (block.type === 'pre') return { type: 'pre', text: block.text, ...(block.language ? { language: block.language } : {}) };
        if (block.type === 'footer') return { type: 'footer', text: runsToRichText(block.runs) };
        if (block.type === 'divider') return { type: 'divider' };
        if (block.type === 'blockquote') {
          return {
            type: 'blockquote',
            blocks: [{ type: 'paragraph', text: runsToRichText(block.runs) }],
            ...(block.credit ? { credit: block.credit } : {}),
          };
        }
        if (block.type === 'pullquote') {
          return { type: 'pullquote', text: runsToRichText(block.runs), ...(block.credit ? { credit: block.credit } : {}) };
        }
        if (block.type === 'list') {
          const items = block.items.filter((item) => item.text.trim().length > 0);
          return {
            type: 'list',
            items: items.map((item, index) => {
              const base = { label: listItemLabel(block.style, index), blocks: [{ type: 'paragraph', text: item.text }] };
              if (block.style === 'number') return { ...base, type: '1', value: index + 1 };
              if (block.style === 'checklist') return { ...base, has_checkbox: true, is_checked: !!item.checked };
              return base;
            }),
          };
        }
        return { type: 'paragraph', text: runsToRichText(block.runs) };
      }),
  };
}

export function documentTextLength(document) {
  return normalizeDocument(document).blocks.reduce((total, block) => {
    if (block.type === 'pre') return total + (block.text || '').length;
    if (block.type === 'list') return total + block.items.reduce((sum, item) => sum + item.text.length, 0);
    if (block.type === 'divider') return total;
    return total + runsText(block.runs).length + (block.credit ? block.credit.length : 0);
  }, 0);
}
