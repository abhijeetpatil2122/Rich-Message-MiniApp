import React, { useEffect, useRef, useState } from 'react';
import { createBlock, createInitialDocument, createListItem, createRun, mergeRuns, runsText, sliceRuns, toTelegramRichMessage } from './lib/document.js';

const tg = () => window.Telegram?.WebApp;

function Icon({ name, size = 24 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    undo: <><path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/></>,
    redo: <><path d="m15 7 5 5-5 5"/><path d="M20 12H10a6 6 0 0 0-6 6"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>,
    link: <><path d="M9 17H7a5 5 0 0 1 0-10h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    close: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const HEADING_OPTIONS = [1,2,3,4,5,6].map(size => ({ size, label: `Heading ${size}` }));
const BLOCK_OPTIONS = [
  { type: 'pre', label: 'Code block', icon: '</>' },
  { type: 'footer', label: 'Footer', icon: 'F' },
  { type: 'blockquote', label: 'Blockquote', icon: '❝' },
  { type: 'pullquote', label: 'Pullquote', icon: '„' },
  { type: 'list-bullet', label: 'Bulleted list', icon: '•' },
  { type: 'list-number', label: 'Numbered list', icon: '1.' },
  { type: 'list-checklist', label: 'Checklist', icon: '☑' },
  { type: 'divider', label: 'Divider', icon: '—' },
];
const LIST_STYLE_TYPES = new Set(['list-bullet', 'list-number', 'list-checklist']);
const CODE_LANGUAGES = [['','Plain text'],['python','Python'],['javascript','JavaScript'],['typescript','TypeScript'],['html','HTML'],['css','CSS'],['json','JSON'],['bash','Bash / Shell'],['sql','SQL'],['java','Java'],['c','C'],['cpp','C++'],['csharp','C#'],['go','Go'],['rust','Rust'],['php','PHP'],['kotlin','Kotlin'],['swift','Swift'],['xml','XML'],['yaml','YAML'],['markdown','Markdown']].map(([value,label]) => ({ value, label }));
// Inline formatting options shown in the "B" panel. `core` are the
// everyday marks; `extra` mirrors how Blocks are separated from headings
// in the H menu — additional Rich Message formats grouped below a divider.
const MARK_OPTIONS = [
  { key: 'bold', label: 'Bold', glyph: 'B', className: 'mark-glyph mark-bold' },
  { key: 'italic', label: 'Italic', glyph: 'I', className: 'mark-glyph mark-italic' },
  { key: 'underline', label: 'Underline', glyph: 'U', className: 'mark-glyph mark-underline' },
  { key: 'strikethrough', label: 'Strikethrough', glyph: 'S', className: 'mark-glyph mark-strike' },
  { key: 'code', label: 'Monospace', glyph: '</>', className: 'mark-glyph mark-code' },
  { key: 'spoiler', label: 'Spoiler', glyph: '•••', className: 'mark-glyph mark-spoiler' },
];
const MARK_OPTIONS_EXTRA = [
  { key: 'marked', label: 'Mark', glyph: 'A', className: 'mark-glyph mark-highlight' },
  { key: 'subscript', label: 'Subscript', glyph: 'X₂', className: 'mark-glyph mark-sub' },
  { key: 'superscript', label: 'Superscript', glyph: 'X²', className: 'mark-glyph mark-super' },
];
const RICH_TAGS = { bold: 'b', italic: 'i', underline: 'u', strikethrough: 's', code: 'code', spoiler: 'span', marked: 'mark', subscript: 'sub', superscript: 'sup' };
const RICH_WRAP_ORDER = ['spoiler', 'marked', 'bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript', 'code'];
const clone = value => structuredClone(value);
const canHoldRuns = block => block.type !== 'pre' && block.type !== 'divider' && block.type !== 'list';

const escapeHTML = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runToHTML(run) {
  let html = escapeHTML(run.text);
  for (const mark of RICH_WRAP_ORDER) {
    if (run.marks.includes(mark)) {
      const tag = RICH_TAGS[mark];
      const cls = mark === 'spoiler' ? ' class="rt-spoiler"' : mark === 'marked' ? ' class="rt-mark"' : '';
      html = `<${tag}${cls}>${html}</${tag}>`;
    }
  }
  if (run.link) html = `<span class="rt-link" data-url="${escapeHTML(run.link)}">${html}</span>`;
  return html;
}
const runsToHTML = runs => (runs || []).map(runToHTML).join('');

// Reconstructs runs by walking the contentEditable's actual DOM after a
// native edit (typing, browser-native formatting, etc.). Any element we
// don't recognize is walked through with no formatting added, which
// doubles as a cheap safety net against unexpected pasted markup. A <br>,
// or a nested <div>/<p> (what Chrome/WebView insert natively for Enter
// inside a contentEditable when our own interception doesn't catch it in
// time), is surfaced as a literal '\n' — the caller then converts that
// into a real block split, the same way a multi-line paste is handled.
function domToRuns(node) {
  const runs = [];
  const BLOCK_TAGS = new Set(['DIV', 'P']);
  const walk = (n, marks, link) => {
    if (n.nodeType === 3) { if (n.data) runs.push(createRun(n.data, marks, link)); return; }
    if (n.nodeType !== 1) return;
    if (n.tagName === 'BR') { runs.push(createRun('\n', [], null)); return; }
    const tag = n.tagName.toLowerCase();
    let nextMarks = marks; let nextLink = link;
    if (tag === 'b' || tag === 'strong') nextMarks = [...marks, 'bold'];
    else if (tag === 'i' || tag === 'em') nextMarks = [...marks, 'italic'];
    else if (tag === 'u') nextMarks = [...marks, 'underline'];
    else if (tag === 's' || tag === 'strike' || tag === 'del') nextMarks = [...marks, 'strikethrough'];
    else if (tag === 'code') nextMarks = [...marks, 'code'];
    else if (tag === 'mark') nextMarks = [...marks, 'marked'];
    else if (tag === 'sub') nextMarks = [...marks, 'subscript'];
    else if (tag === 'sup') nextMarks = [...marks, 'superscript'];
    else if (n.classList?.contains('rt-spoiler')) nextMarks = [...marks, 'spoiler'];
    if (n.classList?.contains('rt-link')) nextLink = n.getAttribute('data-url') || link;
    nextMarks = [...new Set(nextMarks)];
    for (const child of Array.from(n.childNodes)) walk(child, nextMarks, nextLink);
  };
  const children = Array.from(node.childNodes);
  children.forEach((child, index) => {
    if (index > 0 && child.nodeType === 1 && BLOCK_TAGS.has(child.tagName)) runs.push(createRun('\n', [], null));
    walk(child, [], null);
  });
  return mergeRuns(runs);
}

const runsEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((run, i) => run.text === b[i].text && run.link === b[i].link && run.marks.length === b[i].marks.length && run.marks.every(m => b[i].marks.includes(m)));
};

// The browser's contentEditable has no notion of "this mark shouldn't keep
// extending" — if the caret sits at the edge of a formatted run, whatever
// you type next is native-inherited into that same run, indefinitely. We
// never offer a "type new bold text going forward" mode (marks are only
// ever applied to text that already exists, via the format panel), so any
// freshly-typed character that got silently absorbed into a pre-existing
// run's formatting is always unwanted — it should always be corrected back
// to plain. This diffs the block's text before/after one input event: a
// plain, un-selected insertion that landed exactly at an existing run's
// boundary (not strictly inside it) gets its formatting stripped; typing
// truly in the middle of already-formatted text, or replacing a selection,
// is left to inherit normally, since that's genuinely expected.
function resolveTypedRuns(previousRuns, rawRuns) {
  const previousText = runsText(previousRuns);
  const newText = runsText(rawRuns);
  if (newText.length <= previousText.length) return { runs: rawRuns, corrected: false };

  let prefixLen = 0; const maxPrefix = Math.min(previousText.length, newText.length);
  while (prefixLen < maxPrefix && previousText[prefixLen] === newText[prefixLen]) prefixLen += 1;
  let suffixLen = 0; const maxSuffix = Math.min(previousText.length, newText.length) - prefixLen;
  while (suffixLen < maxSuffix && previousText[previousText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]) suffixLen += 1;

  const removedLen = previousText.length - prefixLen - suffixLen;
  if (removedLen > 0) return { runs: rawRuns, corrected: false }; // a selection was replaced — inheriting is expected here

  const insertStart = prefixLen; const insertEnd = newText.length - suffixLen;
  if (insertEnd <= insertStart) return { runs: rawRuns, corrected: false };

  let pos = 0; let isInterior = false;
  for (const run of previousRuns) {
    const start = pos; const end = pos + run.text.length; pos = end;
    if (insertStart > start && insertStart < end) { isInterior = true; break; }
  }
  if (isInterior) return { runs: rawRuns, corrected: false }; // typing inside already-formatted text — inherit as expected

  const insertedRaw = sliceRuns(rawRuns, insertStart, insertEnd);
  const needsStrip = insertedRaw.some(run => run.marks.length > 0 || run.link);
  if (!needsStrip) return { runs: rawRuns, corrected: false }; // already plain — take the normal, no-rewrite fast path

  const before = sliceRuns(rawRuns, 0, insertStart);
  const inserted = insertedRaw.map(run => createRun(run.text, [], null));
  const after = sliceRuns(rawRuns, insertEnd, newText.length);
  return { runs: mergeRuns(before, inserted, after), corrected: true, caretOffset: insertEnd };
}

export default function App() {
  const [document, setDocument] = useState(createInitialDocument);
  const [activeId, setActiveId] = useState(document.blocks[0].id);
  const [formatOpen, setFormatOpen] = useState(false);
  const [inlineOpen, setInlineOpen] = useState(false);
  const [activeSelection, setActiveSelection] = useState(null); // { blockId, start, end }
  const [linkDraft, setLinkDraft] = useState(null); // { url }
  const [languageOpenId, setLanguageOpenId] = useState(null);
  const [sending, setSending] = useState(false);
  const [notifications, setNotifications] = useState([]); // { id, type: 'success' | 'error', message }
  const [, setHistoryVersion] = useState(0);
  const editorRefs = useRef(new Map());
  const lastRenderedRuns = useRef(new Map());
  const pendingFocus = useRef(null);
  const pendingAfterFocus = useRef(null);
  const history = useRef({ past: [], future: [], lastInputAt: 0 });
  const notificationTimers = useRef(new Map());

  const dismissNotification = id => {
    setNotifications(list => list.filter(item => item.id !== id));
    const timer = notificationTimers.current.get(id); if (timer) { clearTimeout(timer); notificationTimers.current.delete(id); }
  };
  const notify = (type, message, duration = 4000) => {
    const id = crypto.randomUUID();
    setNotifications(list => [...list, { id, type, message }]);
    notificationTimers.current.set(id, setTimeout(() => dismissNotification(id), duration));
  };

  useEffect(() => {
    const app = tg(); if (!app) return;
    app.ready(); app.expand(); app.setHeaderColor('secondary_bg_color'); app.setBackgroundColor('bg_color');
  }, []);

  // Keeps each rich block's DOM in sync with its `runs`. Skipped when the
  // DOM already reflects those exact runs — which is always true right
  // after the user's own typing, since that path parses the DOM into state
  // rather than the other way around — so normal typing never gets its
  // cursor clobbered by a re-render. Deliberate actions (format toggles,
  // splits, merges, undo/redo, paste) don't pre-populate the cache, so they
  // correctly trigger a real re-render, then restore the caret/selection
  // via pendingFocus.
  useEffect(() => {
    for (const block of document.blocks) {
      if (!canHoldRuns(block)) continue;
      const node = editorRefs.current.get(block.id);
      if (!node) continue;
      const cached = lastRenderedRuns.current.get(block.id);
      if (cached && runsEqual(cached, block.runs)) continue;
      node.innerHTML = runsToHTML(block.runs);
      lastRenderedRuns.current.set(block.id, block.runs);
    }
    const liveIds = new Set(document.blocks.map(b => b.id));
    for (const id of Array.from(lastRenderedRuns.current.keys())) if (!liveIds.has(id)) lastRenderedRuns.current.delete(id);
  }, [document]);

  const locateOffset = (node, targetOffset) => {
    let remaining = targetOffset; let result = null;
    const walk = n => {
      if (result) return;
      if (n.nodeType === 3) { if (remaining <= n.data.length) result = { node: n, offset: remaining }; else remaining -= n.data.length; return; }
      for (const child of Array.from(n.childNodes)) { walk(child); if (result) return; }
    };
    walk(node);
    return result;
  };

  const focusNode = (node, start = Infinity, end = start) => {
    if (!node) return false;
    node.focus();
    if (typeof node.setSelectionRange === 'function') {
      const s = Math.min(Math.max(start, 0), node.value.length); const e = Math.min(Math.max(end, 0), node.value.length);
      node.setSelectionRange(Math.min(s, e), Math.max(s, e));
      return true;
    }
    const selection = window.getSelection(); if (!selection) return true;
    const range = window.document.createRange();
    const startPos = start === Infinity ? null : locateOffset(node, Math.max(start, 0));
    const endPos = end === Infinity ? null : locateOffset(node, Math.max(end, 0));
    if (startPos) range.setStart(startPos.node, startPos.offset); else { range.selectNodeContents(node); range.collapse(start !== Infinity && start <= 0); }
    if (endPos) range.setEnd(endPos.node, endPos.offset); else if (startPos) range.setEnd(startPos.node, startPos.offset);
    selection.removeAllRanges(); selection.addRange(range);
    return true;
  };

  // Reads the caret's/selection's flat character offsets within a block,
  // treating its content as one string regardless of how many nested
  // <b>/<i>/... elements it's split across.
  const getCaretOffsets = node => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!node.contains(range.startContainer) || !node.contains(range.endContainer)) return null;
    const startRange = window.document.createRange(); startRange.selectNodeContents(node); startRange.setEnd(range.startContainer, range.startOffset);
    const endRange = window.document.createRange(); endRange.selectNodeContents(node); endRange.setEnd(range.endContainer, range.endOffset);
    return { start: startRange.toString().length, end: endRange.toString().length };
  };

  const focusBlock = (id, start = Infinity, end = start) => {
    const block = document.blocks.find(item => item.id === id);
    if (block?.type === 'divider') {
      const index = document.blocks.findIndex(item => item.id === id);
      const next = document.blocks.slice(index + 1).find(item => item.type !== 'divider');
      if (!next) return false;
      return next.type === 'list' ? focusNode(editorRefs.current.get(next.items[0].id), start, end) : focusNode(editorRefs.current.get(next.id), start, end);
    }
    if (block?.type === 'list') return focusNode(editorRefs.current.get(block.items[0].id), start, end);
    return focusNode(editorRefs.current.get(id), start, end);
  };

  useEffect(() => {
    if (pendingFocus.current) { const { id, start, end } = pendingFocus.current; pendingFocus.current = null; requestAnimationFrame(() => focusBlock(id, start, end)); }
    if (pendingAfterFocus.current) {
      const { anchorId, start, end } = pendingAfterFocus.current; pendingAfterFocus.current = null;
      const anchorIndex = document.blocks.findIndex(item => item.id === anchorId);
      const target = anchorIndex >= 0 ? document.blocks[anchorIndex + 1] : null;
      if (target) { setActiveId(target.id); requestAnimationFrame(() => focusBlock(target.id, start, end)); }
    }
  }, [document]);

  // Neither a `divider`, a `pre`, nor a `list` block may be the first or
  // last block in the document: each of those is edited through its own
  // separate mechanism (not the normal split/merge path), so being at
  // either edge would leave no ordinary block to click or type into.
  // Whenever a mutation would leave one there, silently add a normal empty
  // paragraph next to it so there's always somewhere to write.
  const ensureBoundaryParagraphs = next => {
    let blocks = next.blocks;
    const isBoundaryRisk = type => type === 'pre' || type === 'divider' || type === 'list';
    const first = blocks[0];
    if (first && isBoundaryRisk(first.type)) blocks = [createBlock('paragraph'), ...blocks];
    const last = blocks[blocks.length - 1];
    if (last && isBoundaryRisk(last.type)) blocks = [...blocks, createBlock('paragraph')];
    return blocks === next.blocks ? next : { ...next, blocks };
  };

  const commit = (next, { coalesce = false } = {}) => {
    const normalized = ensureBoundaryParagraphs(next);
    const now = Date.now();
    if (!coalesce || now - history.current.lastInputAt > 650) history.current.past.push(clone(document));
    history.current.lastInputAt = now; history.current.future = []; setDocument(normalized); setHistoryVersion(v => v + 1);
  };

  // Plain-text-only update path, used only by the code-block textarea.
  const updateText = (id, text) => commit({ ...document, blocks: document.blocks.map(b => b.id === id ? { ...b, text } : b) }, { coalesce: true });

  const closeMenus = () => { setFormatOpen(false); setLanguageOpenId(null); setInlineOpen(false); setActiveSelection(null); setLinkDraft(null); };

  const changeType = (type, size = null) => {
    if (type === 'divider') {
      const index = document.blocks.findIndex(b => b.id === activeId); if (index < 0) return;
      const blocks = [...document.blocks];
      if (blocks[index + 1]?.type === 'paragraph' && runsText(blocks[index + 1].runs).length === 0) blocks.splice(index + 1, 1);
      const divider = createBlock('divider'); blocks.splice(index + 1, 0, divider);
      commit({ ...document, blocks }); setLanguageOpenId(null); setFormatOpen(false);
      pendingAfterFocus.current = { anchorId: divider.id, start: Infinity, end: Infinity };
    } else if (LIST_STYLE_TYPES.has(type)) {
      const style = type === 'list-bullet' ? 'bullet' : type === 'list-number' ? 'number' : 'checklist';
      commit({ ...document, blocks: document.blocks.map(block => {
        if (block.id !== activeId) return block;
        if (block.type === 'list') return { ...block, style }; // already a list — just switch its style, keep items
        const seedText = block.runs ? runsText(block.runs) : (block.text || '');
        return { id: block.id, type: 'list', style, items: [createListItem(seedText)] };
      }) });
      setLanguageOpenId(null); setFormatOpen(false); requestAnimationFrame(() => focusBlock(activeId));
    } else {
      commit({ ...document, blocks: document.blocks.map(block => {
        if (block.id !== activeId) return block;
        const { text, language, items, style, credit, ...rest } = block;
        const seedText = block.type === 'list' ? (items?.[0]?.text || '') : (text || '');
        const runs = block.runs || [createRun(seedText)];
        if (type === 'paragraph') return { ...rest, type: 'paragraph', runs };
        if (type === 'heading') return { ...rest, type: 'heading', size, runs };
        if (type === 'footer') return { ...rest, type: 'footer', runs };
        if (type === 'blockquote' || type === 'pullquote') return { ...rest, type, runs, credit: credit !== undefined ? credit : null };
        if (type === 'pre') return { ...rest, type: 'pre', language: block.language || '', text: runsText(runs) };
        return block;
      }) });
      setLanguageOpenId(null); setFormatOpen(false); requestAnimationFrame(() => focusBlock(activeId));
    }
    tg()?.HapticFeedback?.selectionChanged?.();
  };

  const setCodeLanguage = (id, language) => {
    commit({ ...document, blocks: document.blocks.map(b => b.id === id ? { ...b, language } : b) });
    setLanguageOpenId(null); setActiveId(id); tg()?.HapticFeedback?.selectionChanged?.(); requestAnimationFrame(() => focusBlock(id));
  };

  // Enter splits the active block's runs at the caret: the part before the
  // caret stays in this block, the part after moves into a new plain
  // paragraph (formatting carried over intact for both halves). If the
  // caret was at the very start, the *new* empty paragraph goes above
  // instead, and this block (with all its content) slides down, keeping
  // the caret in place — matching how most block editors treat Enter at
  // the start of a line.
  const splitBlock = (id, beforeRuns, afterRuns) => {
    const index = document.blocks.findIndex(b => b.id === id); if (index < 0) return;
    const blocks = [...document.blocks];
    if (runsText(beforeRuns) === '') {
      blocks[index] = { ...blocks[index], runs: mergeRuns(afterRuns) };
      blocks.splice(index, 0, createBlock('paragraph'));
      commit({ ...document, blocks });
      setActiveId(id); pendingFocus.current = { id, start: 0, end: 0 };
    } else {
      blocks[index] = { ...blocks[index], runs: mergeRuns(beforeRuns) };
      const tail = createBlock('paragraph'); tail.runs = mergeRuns(afterRuns);
      blocks.splice(index + 1, 0, tail);
      commit({ ...document, blocks });
      setActiveId(tail.id); pendingFocus.current = { id: tail.id, start: 0, end: 0 };
    }
    setLanguageOpenId(null); setFormatOpen(false);
  };

  // Backspace at the very start of a block: a divider right above is a
  // single deletable unit (one press removes just the divider); a code
  // block above is stepped into rather than merged, so prose never lands
  // inside code; anything else merges this block's runs into the one
  // above, keeping the earlier block's type and formatting, with the caret
  // landing at the seam.
  const mergeWithPrevious = id => {
    const index = document.blocks.findIndex(b => b.id === id); if (index <= 0) return;
    const prev = document.blocks[index - 1];
    if (prev.type === 'divider') {
      commit({ ...document, blocks: document.blocks.filter(b => b.id !== prev.id) });
      setActiveId(id); pendingFocus.current = { id, start: 0, end: 0 };
      return;
    }
    if (prev.type === 'pre' || prev.type === 'list') {
      // Step into the previous block rather than merging text into it —
      // code and list content shouldn't silently absorb plain prose.
      setActiveId(prev.id);
      pendingFocus.current = prev.type === 'list' ? { id: prev.items[prev.items.length - 1].id, start: Infinity, end: Infinity } : { id: prev.id, start: Infinity, end: Infinity };
      return;
    }
    const current = document.blocks[index];
    const joinOffset = runsText(prev.runs).length;
    const merged = { ...prev, runs: mergeRuns(prev.runs, current.runs) };
    const blocks = document.blocks.filter(b => b.id !== current.id).map(b => b.id === prev.id ? merged : b);
    commit({ ...document, blocks });
    setActiveId(prev.id); pendingFocus.current = { id: prev.id, start: joinOffset, end: joinOffset };
  };

  const removeBlock = id => {
    if (document.blocks.length === 1) return;
    const index = document.blocks.findIndex(b => b.id === id); const nextActive = document.blocks[index - 1] || document.blocks[index + 1];
    commit({ ...document, blocks: document.blocks.filter(b => b.id !== id) }); setActiveId(nextActive.id);
    if (nextActive.type === 'divider') { /* not focusable directly */ }
    else if (nextActive.type === 'list') pendingFocus.current = { id: nextActive.items[nextActive.items.length - 1].id, start: Infinity, end: Infinity };
    else pendingFocus.current = { id: nextActive.id, start: Infinity, end: Infinity };
    setLanguageOpenId(null);
  };

  // --- List blocks -----------------------------------------------------
  // v1 scope: list items are plain text lines (no inline bold/italic/etc.
  // inside an item yet) — see the note in the H menu's list options.
  const updateListItemText = (blockId, itemId, text) => {
    commit({ ...document, blocks: document.blocks.map(b => b.id === blockId ? { ...b, items: b.items.map(i => i.id === itemId ? { ...i, text } : i) } : b) }, { coalesce: true });
  };

  const toggleListItemChecked = (blockId, itemId) => {
    commit({ ...document, blocks: document.blocks.map(b => b.id === blockId ? { ...b, items: b.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i) } : b) });
    tg()?.HapticFeedback?.selectionChanged?.();
  };

  const splitListItem = (blockId, itemId, before, after) => {
    const blockIndex = document.blocks.findIndex(b => b.id === blockId); if (blockIndex < 0) return;
    const block = document.blocks[blockIndex];
    const itemIndex = block.items.findIndex(i => i.id === itemId); if (itemIndex < 0) return;
    const items = [...block.items]; items[itemIndex] = { ...items[itemIndex], text: before };
    const newItem = createListItem(after); items.splice(itemIndex + 1, 0, newItem);
    const blocks = [...document.blocks]; blocks[blockIndex] = { ...block, items };
    commit({ ...document, blocks });
    setActiveId(blockId); pendingFocus.current = { id: newItem.id, start: 0, end: 0 };
  };

  // Backspace at the start of an item merges it into the previous item
  // (caret lands at the seam), removes it outright if it's empty and the
  // only item (the whole list block goes away), or is a safe no-op at the
  // very first item of a multi-item list (v1 doesn't outdent/exit from there).
  const removeListItem = (blockId, itemId) => {
    const blockIndex = document.blocks.findIndex(b => b.id === blockId); if (blockIndex < 0) return;
    const block = document.blocks[blockIndex];
    const itemIndex = block.items.findIndex(i => i.id === itemId); if (itemIndex < 0) return;
    if (block.items.length === 1) {
      if (document.blocks.length === 1) return;
      const nextActive = document.blocks[blockIndex - 1] || document.blocks[blockIndex + 1];
      commit({ ...document, blocks: document.blocks.filter(b => b.id !== blockId) });
      setActiveId(nextActive.id);
      if (nextActive.type === 'list') pendingFocus.current = { id: nextActive.items[nextActive.items.length - 1].id, start: Infinity, end: Infinity };
      else if (nextActive.type !== 'divider') pendingFocus.current = { id: nextActive.id, start: Infinity, end: Infinity };
      return;
    }
    if (itemIndex === 0) return;
    const current = block.items[itemIndex]; const prevItem = block.items[itemIndex - 1];
    const joinOffset = prevItem.text.length;
    const items = block.items.filter(i => i.id !== itemId).map(i => i.id === prevItem.id ? { ...i, text: prevItem.text + current.text } : i);
    const blocks = [...document.blocks]; blocks[blockIndex] = { ...block, items };
    commit({ ...document, blocks });
    setActiveId(blockId); pendingFocus.current = { id: prevItem.id, start: joinOffset, end: joinOffset };
  };

  // Enter on an empty last item exits the list entirely (matches the usual
  // "blank line to end the list" convention), leaving a normal paragraph
  // to keep writing in.
  const exitList = blockId => {
    const index = document.blocks.findIndex(b => b.id === blockId); if (index < 0) return;
    const block = document.blocks[index];
    const remainingItems = block.items.slice(0, -1);
    const paragraph = createBlock('paragraph');
    const blocks = [...document.blocks];
    if (remainingItems.length === 0) blocks.splice(index, 1, paragraph);
    else { blocks[index] = { ...block, items: remainingItems }; blocks.splice(index + 1, 0, paragraph); }
    commit({ ...document, blocks });
    setActiveId(paragraph.id); pendingFocus.current = { id: paragraph.id, start: 0, end: 0 };
  };

  // Enter is handled directly on keydown here. Unlike the rich
  // contentEditable blocks, a single-line <input> structurally can't ever
  // contain a '\n' character, so there's no "let it happen, detect after"
  // fallback available — this has to be caught before the OS keyboard
  // decides what Enter means. Android soft keyboards often default an
  // <input>'s Enter key to a "move to next field" action instead of a real
  // keypress unless told otherwise, which is why the input also declares
  // enterKeyHint="enter" below.
  const handleListItemKeyDown = (event, block, item, itemIndex) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (item.text.trim() === '' && itemIndex === block.items.length - 1) { exitList(block.id); return; }
      const input = event.currentTarget;
      const start = input.selectionStart ?? item.text.length; const end = input.selectionEnd ?? item.text.length;
      splitListItem(block.id, item.id, item.text.slice(0, start), item.text.slice(end));
      return;
    }
    if (event.key === 'Backspace') {
      const input = event.currentTarget;
      const atStart = (input.selectionStart ?? 0) === 0 && (input.selectionEnd ?? 0) === 0;
      if (item.text === '' || atStart) { event.preventDefault(); removeListItem(block.id, item.id); }
    }
  };

  // --- Blockquote / pullquote credit ------------------------------------
  const updateCredit = (blockId, credit) => commit({ ...document, blocks: document.blocks.map(b => b.id === blockId ? { ...b, credit } : b) }, { coalesce: true });

  const undo = () => {
    const previous = history.current.past.pop(); if (!previous) return;
    history.current.future.push(clone(document)); history.current.lastInputAt = 0; setDocument(previous);
    setActiveId(previous.blocks.find(b => b.id === activeId)?.id || previous.blocks[0].id); closeMenus(); setHistoryVersion(v => v + 1);
  };
  const redo = () => {
    const next = history.current.future.pop(); if (!next) return;
    history.current.past.push(clone(document)); history.current.lastInputAt = 0; setDocument(next);
    setActiveId(next.blocks.find(b => b.id === activeId)?.id || next.blocks[0].id); closeMenus(); setHistoryVersion(v => v + 1);
  };

  // Paste always drops in as plain, unformatted text — the safest default
  // so nothing pasted from a browser or another app can inject unexpected
  // markup into the editor. Multi-line paste is split into separate plain
  // paragraph blocks, one per line, matching how Enter would have behaved
  // had you typed it out line by line.
  const insertPlainText = (blockId, text) => {
    const block = document.blocks.find(b => b.id === blockId); if (!block || !canHoldRuns(block)) return;
    const node = editorRefs.current.get(blockId);
    const offsets = node ? getCaretOffsets(node) : null;
    const fullLen = runsText(block.runs).length;
    const start = offsets ? Math.min(offsets.start, offsets.end) : fullLen;
    const end = offsets ? Math.max(offsets.start, offsets.end) : fullLen;
    const before = sliceRuns(block.runs, 0, start);
    const after = sliceRuns(block.runs, end, fullLen);
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const index = document.blocks.findIndex(b => b.id === blockId);
    const blocks = [...document.blocks];

    if (lines.length === 1) {
      blocks[index] = { ...block, runs: mergeRuns(before, [createRun(lines[0])], after) };
      commit({ ...document, blocks });
      setActiveId(blockId); pendingFocus.current = { id: blockId, start: start + lines[0].length, end: start + lines[0].length };
      return;
    }

    const lastLine = lines[lines.length - 1];
    const middleBlocks = lines.slice(1, -1).map(line => { const b = createBlock('paragraph'); b.runs = mergeRuns([createRun(line)]); return b; });
    const tail = createBlock('paragraph'); tail.runs = mergeRuns([createRun(lastLine)], after);
    blocks[index] = { ...block, runs: mergeRuns(before, [createRun(lines[0])]) };
    blocks.splice(index + 1, 0, ...middleBlocks, tail);
    commit({ ...document, blocks });
    setActiveId(tail.id); pendingFocus.current = { id: tail.id, start: lastLine.length, end: lastLine.length };
  };

  // Fallback net for onInput: if a native Enter still slipped past
  // handleKeyDown's preventDefault (some webviews don't honor it
  // consistently) and the browser inserted its own line break, domToRuns
  // will have surfaced it as a literal '\n'. Convert that into a real block
  // split after the fact — the same principle as the sticky-formatting fix:
  // don't fight the browser's write, correct the result.
  const resolveNewlineSplit = (blockId, rawRuns) => {
    const text = runsText(rawRuns);
    const newlineIndex = text.indexOf('\n');
    if (newlineIndex < 0) return false;
    splitBlock(blockId, sliceRuns(rawRuns, 0, newlineIndex), sliceRuns(rawRuns, newlineIndex + 1, text.length));
    return true;
  };

  const handleKeyDown = (event, block) => {
    if (block.type === 'pre') { if (event.key === 'Backspace' && block.text === '') { event.preventDefault(); removeBlock(block.id); } return; }

    if (event.key === 'Enter') {
      event.preventDefault();
      const node = editorRefs.current.get(block.id);
      const fullText = runsText(block.runs);
      const offsets = node ? getCaretOffsets(node) : null;
      const start = offsets ? offsets.start : fullText.length;
      const end = offsets ? offsets.end : fullText.length;
      splitBlock(block.id, sliceRuns(block.runs, 0, start), sliceRuns(block.runs, end, fullText.length));
      return;
    }

    if (event.key === 'Backspace') {
      if (runsText(block.runs) === '') { event.preventDefault(); removeBlock(block.id); return; }
      const node = editorRefs.current.get(block.id);
      const offsets = node ? getCaretOffsets(node) : null;
      if (offsets && offsets.start === 0 && offsets.end === 0) { event.preventDefault(); mergeWithPrevious(block.id); }
      return;
    }

    // Basic block-to-block navigation: only kicks in right at the very top
    // or bottom of a block's own text, so normal cursor movement within a
    // block (including wrapped multi-line paragraphs) is left to the browser.
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const node = editorRefs.current.get(block.id);
      const offsets = node ? getCaretOffsets(node) : null;
      if (!offsets) return;
      const fullText = runsText(block.runs); const index = document.blocks.findIndex(b => b.id === block.id);
      if (event.key === 'ArrowUp' && offsets.start === 0 && offsets.end === 0) {
        const prev = [...document.blocks].slice(0, index).reverse().find(b => b.type !== 'divider');
        if (prev) { event.preventDefault(); setActiveId(prev.id); pendingFocus.current = { id: prev.id, start: Infinity, end: Infinity }; }
      } else if (event.key === 'ArrowDown' && offsets.start === fullText.length && offsets.end === fullText.length) {
        const next = document.blocks.slice(index + 1).find(b => b.type !== 'divider');
        if (next) { event.preventDefault(); setActiveId(next.id); pendingFocus.current = { id: next.id, start: 0, end: 0 }; }
      }
    }
  };

  // Toggles one inline mark across a selection: if every run in the
  // selection already has it, it's removed everywhere; otherwise it's
  // added everywhere. Subscript and superscript are mutually exclusive
  // (a character can't sit both above and below the baseline), so turning
  // one on switches the other off. The selection itself is restored
  // afterward so several marks can be combined without re-selecting.
  const toggleMark = (blockId, start, end, mark) => {
    if (start === end) return;
    const block = document.blocks.find(b => b.id === blockId); if (!block || !canHoldRuns(block)) return;
    const fullLen = runsText(block.runs).length;
    const before = sliceRuns(block.runs, 0, start);
    const target = sliceRuns(block.runs, start, end);
    const after = sliceRuns(block.runs, end, fullLen);
    const shouldRemove = target.every(run => run.marks.includes(mark));
    const opposite = mark === 'subscript' ? 'superscript' : mark === 'superscript' ? 'subscript' : null;
    const updatedTarget = target.map(run => {
      let marks = shouldRemove ? run.marks.filter(m => m !== mark) : [...new Set([...run.marks, mark])];
      if (!shouldRemove && opposite) marks = marks.filter(m => m !== opposite);
      return createRun(run.text, marks, run.link);
    });
    commit({ ...document, blocks: document.blocks.map(b => b.id === blockId ? { ...b, runs: mergeRuns(before, updatedTarget, after) } : b) });
    setActiveId(blockId); pendingFocus.current = { id: blockId, start, end };
    tg()?.HapticFeedback?.selectionChanged?.();
  };

  // "Regular" strips every mark and any link from the selection, resetting
  // it to plain text.
  const clearFormatting = (blockId, start, end) => {
    if (start === end) return;
    const block = document.blocks.find(b => b.id === blockId); if (!block || !canHoldRuns(block)) return;
    const fullLen = runsText(block.runs).length;
    const before = sliceRuns(block.runs, 0, start);
    const target = sliceRuns(block.runs, start, end);
    const after = sliceRuns(block.runs, end, fullLen);
    const updatedTarget = target.map(run => createRun(run.text, [], null));
    commit({ ...document, blocks: document.blocks.map(b => b.id === blockId ? { ...b, runs: mergeRuns(before, updatedTarget, after) } : b) });
    setActiveId(blockId); pendingFocus.current = { id: blockId, start, end };
    tg()?.HapticFeedback?.selectionChanged?.();
  };

  // Bare domains/paths (no scheme) are auto-upgraded to https:// rather
  // than rejected; an explicit http(s):// or tg:// (Telegram deep link)
  // scheme is left exactly as typed.
  const normalizeLinkUrl = raw => {
    const trimmed = raw.trim(); if (!trimmed) return '';
    return /^(https?:\/\/|tg:\/\/)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  const applyLink = url => {
    if (!activeSelection) return;
    const { blockId, start, end } = activeSelection;
    const block = document.blocks.find(b => b.id === blockId); if (!block || !canHoldRuns(block)) return;
    const fullLen = runsText(block.runs).length;
    const before = sliceRuns(block.runs, 0, start);
    const target = sliceRuns(block.runs, start, end);
    const after = sliceRuns(block.runs, end, fullLen);
    const nextLink = url.trim() ? normalizeLinkUrl(url) : null;
    const updatedTarget = target.map(run => createRun(run.text, run.marks, nextLink));
    commit({ ...document, blocks: document.blocks.map(b => b.id === blockId ? { ...b, runs: mergeRuns(before, updatedTarget, after) } : b) });
    setActiveId(blockId); pendingFocus.current = { id: blockId, start, end };
    setLinkDraft(null); setInlineOpen(false); setActiveSelection(null);
  };

  const send = async () => {
    const app = tg();
    if (!app?.initData) { notify('error', 'Open this editor inside Telegram first.'); return; }
    const payload = toTelegramRichMessage(document); if (!payload.blocks.length) { notify('error', 'Write something before sending.'); return; }
    setSending(true);
    try {
      const response = await fetch('/api/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: app.initData, document: { version: 1, blocks: payload.blocks } }) });
      const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || 'Could not send Rich Message.');
      app.HapticFeedback?.impactOccurred?.('light');
      notify('success', 'Sent to your chat with the bot.');
    } catch (cause) { console.error(cause); notify('error', cause?.message || 'Could not send Rich Message.'); }
    finally { setSending(false); }
  };

  const blockClass = block => {
    if (block.type === 'heading') return `heading heading-${block.size}`;
    if (block.type === 'pre') return 'preformatted';
    if (block.type === 'footer') return 'footer-block';
    if (block.type === 'divider') return 'divider-block';
    if (block.type === 'blockquote') return 'blockquote-block';
    if (block.type === 'pullquote') return 'pullquote-block';
    if (block.type === 'list') return 'list-block-wrap';
    return 'paragraph';
  };
  const placeholder = block => {
    if (block.type === 'heading') return `Heading ${block.size}`;
    if (block.type === 'pre') return 'Write code…';
    if (block.type === 'footer') return 'Footer…';
    if (block.type === 'blockquote') return 'Quote…';
    if (block.type === 'pullquote') return 'Pullquote…';
    return 'Write here…';
  };
  const activeBlock = document.blocks.find(b => b.id === activeId) || document.blocks[0];
  const canUndo = history.current.past.length > 0; const canRedo = history.current.future.length > 0;
  const canFormatInline = activeBlock && canHoldRuns(activeBlock);
  const selectionBlock = activeSelection && document.blocks.find(b => b.id === activeSelection.blockId);
  const selectionRuns = selectionBlock && activeSelection.start !== activeSelection.end ? sliceRuns(selectionBlock.runs, activeSelection.start, activeSelection.end) : null;
  const markIsActive = mark => !!selectionRuns && selectionRuns.every(run => run.marks.includes(mark));
  const selectionLink = selectionRuns && selectionRuns.every(run => run.link === selectionRuns[0].link) ? (selectionRuns[0].link || '') : '';
  const hasSelection = !!activeSelection && activeSelection.start !== activeSelection.end;

  const openInlineMenu = () => {
    const node = editorRefs.current.get(activeId);
    const offsets = node ? getCaretOffsets(node) : null;
    setActiveSelection(offsets ? { blockId: activeId, start: Math.min(offsets.start, offsets.end), end: Math.max(offsets.start, offsets.end) } : null);
    setLinkDraft(null); setLanguageOpenId(null); setFormatOpen(false);
    setInlineOpen(open => !open);
  };

  return <main className="app-shell">
    <header className="topbar"><div className="history-actions"><button className="icon-button" aria-label="Undo" onClick={undo} disabled={!canUndo}><Icon name="undo" size={21}/></button><button className="icon-button" aria-label="Redo" onClick={redo} disabled={!canRedo}><Icon name="redo" size={21}/></button></div></header>
    <section className="editor" onClick={closeMenus}>
      <div className="document-area" onClick={event => { if (event.target === event.currentTarget) requestAnimationFrame(() => focusBlock(activeId)); }}>
        {document.blocks.map(block => <React.Fragment key={block.id}>
          <div className={`editor-block ${blockClass(block)} ${activeId === block.id ? 'active' : ''}`} onClick={event => { event.stopPropagation(); setActiveId(block.id); requestAnimationFrame(() => focusBlock(block.id)); }}>
            {block.type === 'divider' ? <>
              <div className="divider-line" role="separator" aria-label="Divider"/>
              {activeId === block.id && document.blocks.length > 1 && <button type="button" className="block-delete divider-delete" aria-label="Delete divider" onClick={event => { event.stopPropagation(); removeBlock(block.id); }}><Icon name="trash" size={15}/></button>}
            </> : block.type === 'list' ? <>
              {activeId === block.id && document.blocks.length > 1 && <button type="button" className="block-delete" aria-label="Delete list" onClick={event => { event.stopPropagation(); removeBlock(block.id); }}><Icon name="trash" size={15}/></button>}
              <div className="list-block">
                {block.items.map((item, itemIndex) => <div key={item.id} className="list-item" onClick={event => event.stopPropagation()}>
                  {block.style === 'checklist'
                    ? <button type="button" className={`list-checkbox ${item.checked ? 'checked' : ''}`} aria-label={item.checked ? 'Mark as not done' : 'Mark as done'} onClick={() => toggleListItemChecked(block.id, item.id)}>{item.checked && <Icon name="check" size={13}/>}</button>
                    : <span className="list-marker">{block.style === 'number' ? `${itemIndex + 1}.` : '•'}</span>}
                  <input ref={node => { if (node) editorRefs.current.set(item.id, node); else editorRefs.current.delete(item.id); }} type="text" enterKeyHint="enter" className={`list-item-input ${item.checked ? 'checked' : ''}`} value={item.text} placeholder={block.items.length === 1 ? 'List item' : ''} onFocus={() => setActiveId(block.id)} onChange={event => updateListItemText(block.id, item.id, event.currentTarget.value)} onKeyDown={event => handleListItemKeyDown(event, block, item, itemIndex)}/>
                </div>)}
              </div>
            </> : <>
              {block.type === 'pre' && <div className="code-tools" onClick={event => event.stopPropagation()}>
                <button type="button" className="code-language-button" aria-label="Set code language" aria-expanded={languageOpenId === block.id} onClick={() => { setActiveId(block.id); setLanguageOpenId(open => open === block.id ? null : block.id); setFormatOpen(false); }}>
                  {CODE_LANGUAGES.find(language => language.value === block.language)?.label || block.language || 'Language'} <span className="code-language-chevron">⌄</span>
                </button>
                {activeId === block.id && document.blocks.length > 1 && <button type="button" className="block-delete" aria-label="Delete code block" onClick={() => removeBlock(block.id)}><Icon name="trash" size={15}/></button>}
                {languageOpenId === block.id && <div className="code-language-menu" onClick={event => event.stopPropagation()}>{CODE_LANGUAGES.map(language => <button type="button" key={language.value || 'plain'} className={`code-language-option ${block.language === language.value ? 'active' : ''}`} onClick={() => setCodeLanguage(block.id, language.value)}><span>{language.label}</span>{block.language === language.value && <Icon name="check" size={18}/>}</button>)}</div>}
              </div>}
              {block.type !== 'pre' && activeId === block.id && document.blocks.length > 1 && <button type="button" className="block-delete" aria-label={`Delete ${block.type}`} onClick={event => { event.stopPropagation(); removeBlock(block.id); }}><Icon name="trash" size={15}/></button>}
              {block.type === 'pre'
                ? <textarea ref={node => { if (node) editorRefs.current.set(block.id, node); else editorRefs.current.delete(block.id); }} className="editable code-editor" value={block.text} rows={4} wrap="off" spellCheck={false} aria-label="Code block" aria-multiline="true" placeholder={placeholder(block)} onFocus={() => setActiveId(block.id)} onClick={event => event.stopPropagation()} onChange={event => updateText(block.id, event.currentTarget.value)} onKeyDown={event => handleKeyDown(event, block)}/>
                : <div ref={node => { if (node) editorRefs.current.set(block.id, node); else editorRefs.current.delete(block.id); }} className="editable" contentEditable suppressContentEditableWarning spellCheck role="textbox" aria-multiline="true" aria-label={block.type === 'heading' ? `Heading ${block.size}` : block.type === 'footer' ? 'Footer' : block.type === 'blockquote' ? 'Blockquote' : block.type === 'pullquote' ? 'Pullquote' : 'Paragraph'} data-placeholder={placeholder(block)}
                    onFocus={() => setActiveId(block.id)} onClick={event => event.stopPropagation()}
                    onInput={event => {
                      const rawRuns = domToRuns(event.currentTarget);
                      if (resolveNewlineSplit(block.id, rawRuns)) return;
                      const { runs, corrected, caretOffset } = resolveTypedRuns(block.runs, rawRuns);
                      if (corrected) pendingFocus.current = { id: block.id, start: caretOffset, end: caretOffset };
                      else lastRenderedRuns.current.set(block.id, runs);
                      commit({ ...document, blocks: document.blocks.map(b => b.id === block.id ? { ...b, runs } : b) }, { coalesce: true });
                    }}
                    onPaste={event => { event.preventDefault(); const text = (event.clipboardData || window.clipboardData)?.getData('text/plain') || ''; if (text) insertPlainText(block.id, text); }}
                    enterKeyHint="enter"
                    onKeyDown={event => handleKeyDown(event, block)}/>}
              {(block.type === 'blockquote' || block.type === 'pullquote') && (block.credit !== null
                ? <div className="quote-credit-row" onClick={event => event.stopPropagation()}>
                    <span className="quote-credit-dash">—</span>
                    <input type="text" className="quote-credit-input" placeholder="Credit (optional)" value={block.credit} onFocus={() => setActiveId(block.id)} onChange={event => updateCredit(block.id, event.currentTarget.value)}/>
                    <button type="button" className="quote-credit-remove" aria-label="Remove credit" onClick={() => updateCredit(block.id, null)}><Icon name="close" size={12}/></button>
                  </div>
                : activeId === block.id && <button type="button" className="quote-add-credit" onClick={event => { event.stopPropagation(); updateCredit(block.id, ''); }}>+ Add credit</button>)}
            </>}
          </div>
        </React.Fragment>)}
      </div>
    </section>
    {notifications.length > 0 && <div className="notifications">{notifications.map(item => <div key={item.id} className={`notification ${item.type}`} role="status">
      <span className="notification-message">{item.message}</span>
      <button type="button" className="notification-close" aria-label="Dismiss" onClick={() => dismissNotification(item.id)}><Icon name="close" size={14}/></button>
    </div>)}</div>}
    <footer className="composer-bar"><div className="toolbar">
      <div className="format-wrap"><button className={`tool-button heading-tool ${formatOpen ? 'selected' : ''}`} aria-label="Text and block formatting" aria-expanded={formatOpen} onClick={event => { event.stopPropagation(); setLanguageOpenId(null); setInlineOpen(false); setFormatOpen(open => !open); }}>H</button>
        {formatOpen && <div className="format-menu" onClick={event => event.stopPropagation()}><div className="format-menu-title">Text format</div><button className={activeBlock?.type === 'paragraph' ? 'menu-item active' : 'menu-item'} onClick={() => changeType('paragraph')}><span className="menu-heading paragraph-icon">P</span><span>Paragraph</span>{activeBlock?.type === 'paragraph' && <Icon name="check" size={21}/>}</button>{HEADING_OPTIONS.map(option => <button key={option.size} className={activeBlock?.type === 'heading' && activeBlock.size === option.size ? 'menu-item active' : 'menu-item'} onClick={() => changeType('heading', option.size)}><span className={`menu-heading h-${option.size}`}>H{option.size}</span><span>{option.label}</span>{activeBlock?.type === 'heading' && activeBlock.size === option.size && <Icon name="check" size={21}/>}</button>)}<div className="format-menu-title block-title">Blocks</div>{BLOCK_OPTIONS.map(option => { const isListOption = LIST_STYLE_TYPES.has(option.type); const listStyle = option.type === 'list-bullet' ? 'bullet' : option.type === 'list-number' ? 'number' : option.type === 'list-checklist' ? 'checklist' : null; const isActive = isListOption ? activeBlock?.type === 'list' && activeBlock.style === listStyle : activeBlock?.type === option.type; return <button key={option.type} className={isActive ? 'menu-item active' : 'menu-item'} onClick={() => changeType(option.type)}><span className={`menu-heading block-icon ${option.type}`}>{option.icon}</span><span>{option.label}</span>{isActive && <Icon name="check" size={21}/>}</button>; })}</div>}
      </div>
      <div className="format-wrap"><button type="button" className={`tool-button inline-tool ${inlineOpen ? 'selected' : ''}`} aria-label="Inline text formatting" aria-expanded={inlineOpen} disabled={!canFormatInline} onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); openInlineMenu(); }}>B</button>
        {inlineOpen && <div className="format-menu" onClick={event => event.stopPropagation()}>
          {linkDraft ? <div className="link-editor">
            <input type="url" inputMode="url" autoFocus placeholder="https://example.com" value={linkDraft.url} onChange={event => setLinkDraft({ url: event.currentTarget.value })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyLink(linkDraft.url); } }}/>
            <div className="link-editor-actions">
              {selectionLink && <button type="button" className="link-remove" onClick={() => applyLink('')}>Remove link</button>}
              <button type="button" className="link-cancel" onClick={() => { setLinkDraft(null); setInlineOpen(false); setActiveSelection(null); }}>Cancel</button>
              <button type="button" className="link-apply" disabled={!linkDraft.url.trim()} onClick={() => applyLink(linkDraft.url)}>Apply</button>
            </div>
          </div> : <>
            <div className="format-menu-title">{hasSelection ? 'Formatting' : 'Select text to format'}</div>
            <button type="button" className="menu-item" disabled={!hasSelection} onMouseDown={event => event.preventDefault()} onClick={() => clearFormatting(activeSelection.blockId, activeSelection.start, activeSelection.end)}>
              <span className="menu-heading paragraph-icon">T</span><span>Regular</span>
            </button>
            {MARK_OPTIONS.map(option => <button type="button" key={option.key} className={markIsActive(option.key) ? 'menu-item active' : 'menu-item'} disabled={!hasSelection} onMouseDown={event => event.preventDefault()} onClick={() => toggleMark(activeSelection.blockId, activeSelection.start, activeSelection.end, option.key)}>
              <span className={`menu-heading ${option.className}`}>{option.glyph}</span><span>{option.label}</span>{markIsActive(option.key) && <Icon name="check" size={21}/>}
            </button>)}
            <div className="format-menu-title block-title">More formatting</div>
            {MARK_OPTIONS_EXTRA.map(option => <button type="button" key={option.key} className={markIsActive(option.key) ? 'menu-item active' : 'menu-item'} disabled={!hasSelection} onMouseDown={event => event.preventDefault()} onClick={() => toggleMark(activeSelection.blockId, activeSelection.start, activeSelection.end, option.key)}>
              <span className={`menu-heading ${option.className}`}>{option.glyph}</span><span>{option.label}</span>{markIsActive(option.key) && <Icon name="check" size={21}/>}
            </button>)}
            <button type="button" className={selectionLink ? 'menu-item active' : 'menu-item'} disabled={!hasSelection} onMouseDown={event => event.preventDefault()} onClick={() => setLinkDraft({ url: selectionLink })}>
              <span className="menu-heading link-icon"><Icon name="link" size={18}/></span><span>Link</span>{selectionLink && <Icon name="check" size={21}/>}
            </button>
          </>}
        </div>}
      </div>
    </div><button className="share-button" aria-label="Send Rich Message to yourself" onClick={send} disabled={sending}><Icon name="send" size={23}/></button></footer>
  </main>;
}
