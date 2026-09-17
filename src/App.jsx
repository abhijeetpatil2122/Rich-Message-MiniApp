import React, { useEffect, useRef, useState } from 'react';
import { createBlock, createInitialDocument, toTelegramRichMessage } from './lib/document.js';

const tg = () => window.Telegram?.WebApp;

function Icon({ name, size = 24 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = { undo: <><path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/></>, redo: <><path d="m15 7 5 5-5 5"/><path d="M20 12H10a6 6 0 0 0-6 6"/></>, send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>, check: <path d="m5 12 4 4L19 6"/>, trash: <><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></> };
  return <svg {...common}>{paths[name]}</svg>;
}

const HEADING_OPTIONS = [1,2,3,4,5,6].map(size => ({ size, label: `Heading ${size}` }));
const BLOCK_OPTIONS = [{ type: 'pre', label: 'Code block', icon: '</>' }, { type: 'footer', label: 'Footer', icon: 'F' }, { type: 'divider', label: 'Divider', icon: '—' }];
const CODE_LANGUAGES = [['','Plain text'],['python','Python'],['javascript','JavaScript'],['typescript','TypeScript'],['html','HTML'],['css','CSS'],['json','JSON'],['bash','Bash / Shell'],['sql','SQL'],['java','Java'],['c','C'],['cpp','C++'],['csharp','C#'],['go','Go'],['rust','Rust'],['php','PHP'],['kotlin','Kotlin'],['swift','Swift'],['xml','XML'],['yaml','YAML'],['markdown','Markdown']].map(([value,label]) => ({ value, label }));
const clone = value => structuredClone(value);

export default function App() {
  const [document, setDocument] = useState(createInitialDocument);
  const [activeId, setActiveId] = useState(document.blocks[0].id);
  const [formatOpen, setFormatOpen] = useState(false);
  const [languageOpenId, setLanguageOpenId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [, setHistoryVersion] = useState(0);
  const editorRefs = useRef(new Map());
  const pendingFocus = useRef(null);
  const pendingAfterFocus = useRef(null);
  const history = useRef({ past: [], future: [], lastInputAt: 0 });

  useEffect(() => {
    const app = tg(); if (!app) return;
    app.ready(); app.expand(); app.setHeaderColor('secondary_bg_color'); app.setBackgroundColor('bg_color');
  }, []);

  useEffect(() => {
    for (const block of document.blocks) {
      if (block.type === 'pre') continue;
      const node = editorRefs.current.get(block.id);
      if (node && node.textContent !== (block.text || '')) node.textContent = block.text || '';
    }
  }, [document]);

  const focusNode = (node, offset = Infinity) => {
    if (!node) return false;
    node.focus();
    if (typeof node.setSelectionRange === 'function') {
      const pos = Math.min(Math.max(offset, 0), node.value.length);
      node.setSelectionRange(pos, pos);
    } else {
      const selection = window.getSelection(); if (!selection) return true;
      const range = window.document.createRange(); const textNode = node.firstChild;
      if (textNode && textNode.nodeType === 3) {
        const pos = Math.min(Math.max(offset, 0), textNode.length);
        range.setStart(textNode, pos); range.setEnd(textNode, pos);
      } else { range.selectNodeContents(node); range.collapse(true); }
      selection.removeAllRanges(); selection.addRange(range);
    }
    return true;
  };

  // Reads the caret's character offsets within a block's own text, treating
  // the node's content as one flat string (our blocks hold plain text, no
  // nested markup yet).
  const getCaretOffsets = node => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!node.contains(range.startContainer) || !node.contains(range.endContainer)) return null;
    const startRange = window.document.createRange(); startRange.selectNodeContents(node); startRange.setEnd(range.startContainer, range.startOffset);
    const endRange = window.document.createRange(); endRange.selectNodeContents(node); endRange.setEnd(range.endContainer, range.endOffset);
    return { start: startRange.toString().length, end: endRange.toString().length };
  };

  const focusBlock = (id, offset = Infinity) => {
    const block = document.blocks.find(item => item.id === id); if (!block) return false;
    if (block.type === 'divider') {
      const index = document.blocks.findIndex(item => item.id === id);
      const next = document.blocks.slice(index + 1).find(item => item.type !== 'divider');
      return next ? focusNode(editorRefs.current.get(next.id), offset) : false;
    }
    return focusNode(editorRefs.current.get(id), offset);
  };

  useEffect(() => {
    if (pendingFocus.current) { const { id, offset } = pendingFocus.current; pendingFocus.current = null; requestAnimationFrame(() => focusBlock(id, offset)); }
    if (pendingAfterFocus.current) {
      const { anchorId, offset } = pendingAfterFocus.current; pendingAfterFocus.current = null;
      const anchorIndex = document.blocks.findIndex(item => item.id === anchorId);
      const target = anchorIndex >= 0 ? document.blocks[anchorIndex + 1] : null;
      if (target) { setActiveId(target.id); requestAnimationFrame(() => focusBlock(target.id, offset)); }
    }
  }, [document]);

  // Neither a `divider` nor a `pre` block may be the first or the last block
  // in the document: either position would leave no ordinary block to click
  // or type into. Whenever a mutation would leave one there, silently add a
  // normal empty paragraph next to it so there's always somewhere to write.
  const ensureBoundaryParagraphs = next => {
    let blocks = next.blocks;
    const first = blocks[0];
    if (first && (first.type === 'pre' || first.type === 'divider')) blocks = [createBlock('paragraph'), ...blocks];
    const last = blocks[blocks.length - 1];
    if (last && (last.type === 'pre' || last.type === 'divider')) blocks = [...blocks, createBlock('paragraph')];
    return blocks === next.blocks ? next : { ...next, blocks };
  };

  const commit = (next, { coalesce = false } = {}) => {
    const normalized = ensureBoundaryParagraphs(next);
    const now = Date.now();
    if (!coalesce || now - history.current.lastInputAt > 650) history.current.past.push(clone(document));
    history.current.lastInputAt = now; history.current.future = []; setDocument(normalized); setHistoryVersion(v => v + 1);
  };
  const updateText = (id, text) => commit({ ...document, blocks: document.blocks.map(b => b.id === id ? { ...b, text } : b) }, { coalesce: true });

  const changeType = (type, size = null) => {
    if (type === 'divider') {
      const index = document.blocks.findIndex(b => b.id === activeId); if (index < 0) return;
      const blocks = [...document.blocks];
      if (blocks[index + 1]?.type === 'paragraph' && blocks[index + 1].text === '') blocks.splice(index + 1, 1);
      const divider = createBlock('divider'); blocks.splice(index + 1, 0, divider);
      commit({ ...document, blocks }); setLanguageOpenId(null); setFormatOpen(false);
      pendingAfterFocus.current = { anchorId: divider.id, offset: Infinity };
    } else {
      commit({ ...document, blocks: document.blocks.map(block => {
        if (block.id !== activeId) return block;
        if (type === 'paragraph') return { ...block, type: 'paragraph' };
        if (type === 'heading') return { ...block, type: 'heading', size };
        if (type === 'pre') return { ...block, type: 'pre', language: block.language || '' };
        if (type === 'footer') return { ...block, type: 'footer' };
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

  // Enter splits the active block's text at the caret: the part before the
  // caret stays in this block, the part after moves into a new plain
  // paragraph. If the caret was at the very start, the *new* empty
  // paragraph goes above instead, and this block (with all its text) slides
  // down, keeping the caret in place — matching how most block editors
  // treat Enter at the start of a line.
  const splitBlock = (id, before, after) => {
    const index = document.blocks.findIndex(b => b.id === id); if (index < 0) return;
    const blocks = [...document.blocks];
    if (before === '') {
      blocks[index] = { ...blocks[index], text: after };
      blocks.splice(index, 0, createBlock('paragraph'));
      commit({ ...document, blocks });
      setActiveId(id); pendingFocus.current = { id, offset: 0 };
    } else {
      blocks[index] = { ...blocks[index], text: before };
      const tail = createBlock('paragraph', 1, after);
      blocks.splice(index + 1, 0, tail);
      commit({ ...document, blocks });
      setActiveId(tail.id); pendingFocus.current = { id: tail.id, offset: 0 };
    }
    setLanguageOpenId(null); setFormatOpen(false);
  };

  // Backspace at the very start of a block: a divider right above is a
  // single deletable unit (one press removes just the divider); a code
  // block above is stepped into rather than merged, so prose never lands
  // inside code; anything else merges this block's text into the one above,
  // keeping the earlier block's type, with the caret landing at the seam.
  const mergeWithPrevious = id => {
    const index = document.blocks.findIndex(b => b.id === id); if (index <= 0) return;
    const prev = document.blocks[index - 1];
    if (prev.type === 'divider') {
      commit({ ...document, blocks: document.blocks.filter(b => b.id !== prev.id) });
      setActiveId(id); pendingFocus.current = { id, offset: 0 };
      return;
    }
    if (prev.type === 'pre') { setActiveId(prev.id); pendingFocus.current = { id: prev.id, offset: Infinity }; return; }
    const current = document.blocks[index];
    const joinOffset = (prev.text || '').length;
    const merged = { ...prev, text: joinOffset ? prev.text + (current.text || '') : (current.text || '') };
    const blocks = document.blocks.filter(b => b.id !== current.id).map(b => b.id === prev.id ? merged : b);
    commit({ ...document, blocks });
    setActiveId(prev.id); pendingFocus.current = { id: prev.id, offset: joinOffset };
  };

  const removeBlock = id => {
    if (document.blocks.length === 1) return;
    const index = document.blocks.findIndex(b => b.id === id); const nextActive = document.blocks[index - 1] || document.blocks[index + 1];
    commit({ ...document, blocks: document.blocks.filter(b => b.id !== id) }); setActiveId(nextActive.id);
    if (nextActive.type !== 'divider') pendingFocus.current = { id: nextActive.id, offset: Infinity }; setLanguageOpenId(null);
  };

  const undo = () => {
    const previous = history.current.past.pop(); if (!previous) return;
    history.current.future.push(clone(document)); history.current.lastInputAt = 0; setDocument(previous);
    setActiveId(previous.blocks.find(b => b.id === activeId)?.id || previous.blocks[0].id); setFormatOpen(false); setLanguageOpenId(null); setHistoryVersion(v => v + 1);
  };
  const redo = () => {
    const next = history.current.future.pop(); if (!next) return;
    history.current.past.push(clone(document)); history.current.lastInputAt = 0; setDocument(next);
    setActiveId(next.blocks.find(b => b.id === activeId)?.id || next.blocks[0].id); setFormatOpen(false); setLanguageOpenId(null); setHistoryVersion(v => v + 1);
  };

  const handleKeyDown = (event, block) => {
    if (block.type === 'pre') { if (event.key === 'Backspace' && block.text === '') { event.preventDefault(); removeBlock(block.id); } return; }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const node = editorRefs.current.get(block.id);
      const fullText = block.text || '';
      const offsets = node ? getCaretOffsets(node) : null;
      const start = offsets ? offsets.start : fullText.length;
      const end = offsets ? offsets.end : fullText.length;
      splitBlock(block.id, fullText.slice(0, start), fullText.slice(end));
      return;
    }

    if (event.key === 'Backspace') {
      if (block.text === '') { event.preventDefault(); removeBlock(block.id); return; }
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
      const fullText = block.text || ''; const index = document.blocks.findIndex(b => b.id === block.id);
      if (event.key === 'ArrowUp' && offsets.start === 0 && offsets.end === 0) {
        const prev = [...document.blocks].slice(0, index).reverse().find(b => b.type !== 'divider');
        if (prev) { event.preventDefault(); setActiveId(prev.id); pendingFocus.current = { id: prev.id, offset: Infinity }; }
      } else if (event.key === 'ArrowDown' && offsets.start === fullText.length && offsets.end === fullText.length) {
        const next = document.blocks.slice(index + 1).find(b => b.type !== 'divider');
        if (next) { event.preventDefault(); setActiveId(next.id); pendingFocus.current = { id: next.id, offset: 0 }; }
      }
    }
  };

  const send = async () => {
    setError(''); const app = tg();
    if (!app?.initData) { setError('Open this editor inside Telegram first.'); return; }
    const payload = toTelegramRichMessage(document); if (!payload.blocks.length) { setError('Write something before sending.'); return; }
    setSending(true);
    try {
      const response = await fetch('/api/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: app.initData, document: { version: 1, blocks: payload.blocks } }) });
      const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || 'Could not send Rich Message.');
      app.HapticFeedback?.impactOccurred?.('light');
    } catch (cause) { console.error(cause); setError(cause?.message || 'Could not send Rich Message.'); }
    finally { setSending(false); }
  };

  const blockClass = block => block.type === 'heading' ? `heading heading-${block.size}` : block.type === 'pre' ? 'preformatted' : block.type === 'footer' ? 'footer-block' : block.type === 'divider' ? 'divider-block' : 'paragraph';
  const placeholder = block => block.type === 'heading' ? `Heading ${block.size}` : block.type === 'pre' ? 'Write code…' : block.type === 'footer' ? 'Footer…' : 'Write here…';
  const activeBlock = document.blocks.find(b => b.id === activeId) || document.blocks[0];
  const canUndo = history.current.past.length > 0; const canRedo = history.current.future.length > 0;

  return <main className="app-shell">
    <header className="topbar"><div className="history-actions"><button className="icon-button" aria-label="Undo" onClick={undo} disabled={!canUndo}><Icon name="undo" size={21}/></button><button className="icon-button" aria-label="Redo" onClick={redo} disabled={!canRedo}><Icon name="redo" size={21}/></button></div></header>
    <section className="editor" onClick={() => { setFormatOpen(false); setLanguageOpenId(null); }}>
      <div className="document-area" onClick={event => { if (event.target === event.currentTarget) requestAnimationFrame(() => focusBlock(activeId)); }}>
        {document.blocks.map(block => <React.Fragment key={block.id}>
          <div className={`editor-block ${blockClass(block)} ${activeId === block.id ? 'active' : ''}`} onClick={event => { event.stopPropagation(); setActiveId(block.id); requestAnimationFrame(() => focusBlock(block.id)); }}>
            {block.type === 'divider' ? <>
              <div className="divider-line" role="separator" aria-label="Divider"/>
              {activeId === block.id && document.blocks.length > 1 && <button type="button" className="block-delete divider-delete" aria-label="Delete divider" onClick={event => { event.stopPropagation(); removeBlock(block.id); }}><Icon name="trash" size={15}/></button>}
            </> : <>
              {block.type === 'pre' && <div className="code-tools" onClick={event => event.stopPropagation()}>
                <button type="button" className="code-language-button" aria-label="Set code language" aria-expanded={languageOpenId === block.id} onClick={() => { setActiveId(block.id); setLanguageOpenId(open => open === block.id ? null : block.id); setFormatOpen(false); }}>
                  {CODE_LANGUAGES.find(language => language.value === block.language)?.label || block.language || 'Language'} <span className="code-language-chevron">⌄</span>
                </button>
                {activeId === block.id && document.blocks.length > 1 && <button type="button" className="block-delete" aria-label="Delete code block" onClick={() => removeBlock(block.id)}><Icon name="trash" size={15}/></button>}
                {languageOpenId === block.id && <div className="code-language-menu" onClick={event => event.stopPropagation()}>{CODE_LANGUAGES.map(language => <button type="button" key={language.value || 'plain'} className={`code-language-option ${block.language === language.value ? 'active' : ''}`} onClick={() => setCodeLanguage(block.id, language.value)}><span>{language.label}</span>{block.language === language.value && <Icon name="check" size={18}/>}</button>)}</div>}
              </div>}
              {block.type !== 'pre' && activeId === block.id && document.blocks.length > 1 && <button type="button" className="block-delete" aria-label={`Delete ${block.type}`} onClick={event => { event.stopPropagation(); removeBlock(block.id); }}><Icon name="trash" size={15}/></button>}
              {block.type === 'pre' ? <textarea ref={node => { if (node) editorRefs.current.set(block.id, node); else editorRefs.current.delete(block.id); }} className="editable code-editor" value={block.text} rows={4} wrap="off" spellCheck={false} aria-label="Code block" aria-multiline="true" placeholder={placeholder(block)} onFocus={() => setActiveId(block.id)} onClick={event => event.stopPropagation()} onChange={event => updateText(block.id, event.currentTarget.value)} onKeyDown={event => handleKeyDown(event, block)}/> : <div ref={node => { if (node) editorRefs.current.set(block.id, node); else editorRefs.current.delete(block.id); }} className="editable" contentEditable suppressContentEditableWarning spellCheck role="textbox" aria-multiline="true" aria-label={block.type === 'heading' ? `Heading ${block.size}` : block.type === 'footer' ? 'Footer' : 'Paragraph'} data-placeholder={placeholder(block)} onFocus={() => setActiveId(block.id)} onClick={event => event.stopPropagation()} onInput={event => updateText(block.id, event.currentTarget.textContent || '')} onKeyDown={event => handleKeyDown(event, block)}/>} 
            </>}
          </div>
        </React.Fragment>)}
      </div>
    </section>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <footer className="composer-bar"><div className="toolbar"><div className="format-wrap"><button className={`tool-button heading-tool ${formatOpen ? 'selected' : ''}`} aria-label="Text and block formatting" aria-expanded={formatOpen} onClick={event => { event.stopPropagation(); setLanguageOpenId(null); setFormatOpen(open => !open); }}>H</button>
      {formatOpen && <div className="format-menu" onClick={event => event.stopPropagation()}><div className="format-menu-title">Text format</div><button className={activeBlock?.type === 'paragraph' ? 'menu-item active' : 'menu-item'} onClick={() => changeType('paragraph')}><span className="menu-heading paragraph-icon">P</span><span>Paragraph</span>{activeBlock?.type === 'paragraph' && <Icon name="check" size={21}/>}</button>{HEADING_OPTIONS.map(option => <button key={option.size} className={activeBlock?.type === 'heading' && activeBlock.size === option.size ? 'menu-item active' : 'menu-item'} onClick={() => changeType('heading', option.size)}><span className={`menu-heading h-${option.size}`}>H{option.size}</span><span>{option.label}</span>{activeBlock?.type === 'heading' && activeBlock.size === option.size && <Icon name="check" size={21}/>}</button>)}<div className="format-menu-title block-title">Blocks</div>{BLOCK_OPTIONS.map(option => <button key={option.type} className={activeBlock?.type === option.type ? 'menu-item active' : 'menu-item'} onClick={() => changeType(option.type)}><span className={`menu-heading block-icon ${option.type}`}>{option.icon}</span><span>{option.label}</span>{activeBlock?.type === option.type && <Icon name="check" size={21}/>}</button>)}</div>}
    </div></div><button className="share-button" aria-label="Send Rich Message to yourself" onClick={send} disabled={sending}><Icon name="send" size={23}/></button></footer>
  </main>;
}
