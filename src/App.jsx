import React, { useEffect, useRef, useState } from 'react';
import { createBlock, createInitialDocument, toTelegramRichMessage } from './lib/document.js';

const tg = () => window.Telegram?.WebApp;

function Icon({ name, size = 24 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = { undo: <><path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/></>, redo: <><path d="m15 7 5 5-5 5"/><path d="M20 12H10a6 6 0 0 0-6 6"/></>, send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>, check: <path d="m5 12 4 4L19 6"/> };
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
  const continuationRefs = useRef(new Map());
  const pendingFocus = useRef(null);
  const pendingContinuationFocus = useRef(null);
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

  const focusNode = node => {
    if (!node) return false;
    node.focus();
    if (typeof node.setSelectionRange === 'function') {
      const end = node.value.length; node.setSelectionRange(end, end);
    } else {
      const selection = window.getSelection();
      if (selection) { const range = window.document.createRange(); range.selectNodeContents(node); range.collapse(false); selection.removeAllRanges(); selection.addRange(range); }
    }
    return true;
  };

  const focusBlock = id => {
    const block = document.blocks.find(item => item.id === id); if (!block) return false;
    if (block.type === 'divider') {
      const index = document.blocks.findIndex(item => item.id === id);
      const next = document.blocks.slice(index + 1).find(item => item.type !== 'divider');
      return next ? focusNode(editorRefs.current.get(next.id)) : focusNode(continuationRefs.current.get(id));
    }
    return focusNode(editorRefs.current.get(id));
  };

  useEffect(() => {
    if (pendingFocus.current) { const id = pendingFocus.current; pendingFocus.current = null; requestAnimationFrame(() => focusBlock(id)); }
    if (pendingContinuationFocus.current) { const id = pendingContinuationFocus.current; pendingContinuationFocus.current = null; requestAnimationFrame(() => focusNode(continuationRefs.current.get(id))); }
  }, [document]);

  const commit = (next, { coalesce = false } = {}) => {
    const now = Date.now();
    if (!coalesce || now - history.current.lastInputAt > 650) history.current.past.push(clone(document));
    history.current.lastInputAt = now; history.current.future = []; setDocument(next); setHistoryVersion(v => v + 1);
  };
  const updateText = (id, text) => commit({ ...document, blocks: document.blocks.map(b => b.id === id ? { ...b, text } : b) }, { coalesce: true });

  const changeType = (type, size = null) => {
    if (type === 'divider') {
      const index = document.blocks.findIndex(b => b.id === activeId); if (index < 0) return;
      const blocks = [...document.blocks];
      if (blocks[index + 1]?.type === 'paragraph' && blocks[index + 1].text === '') blocks.splice(index + 1, 1);
      const divider = createBlock('divider'); blocks.splice(index + 1, 0, divider);
      commit({ ...document, blocks }); setActiveId(divider.id); setLanguageOpenId(null); setFormatOpen(false);
      if (index + 1 === blocks.length - 1) pendingContinuationFocus.current = divider.id;
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

  const insertAfter = id => {
    const nextBlock = createBlock('paragraph'); const blocks = [...document.blocks];
    blocks.splice(blocks.findIndex(b => b.id === id) + 1, 0, nextBlock); commit({ ...document, blocks });
    setActiveId(nextBlock.id); pendingFocus.current = nextBlock.id; setLanguageOpenId(null);
  };

  const createParagraphAfterDivider = (dividerId, text) => {
    if (!text) return;
    const index = document.blocks.findIndex(b => b.id === dividerId); if (index < 0) return;
    const blocks = [...document.blocks]; const following = blocks[index + 1]; let nextBlock;
    if (following?.type === 'paragraph' && following.text === '') { nextBlock = { ...following, text }; blocks[index + 1] = nextBlock; }
    else { nextBlock = createBlock('paragraph', 1, text); blocks.splice(index + 1, 0, nextBlock); }
    commit({ ...document, blocks }); setActiveId(nextBlock.id); pendingFocus.current = nextBlock.id; setLanguageOpenId(null);
  };

  const removeBlock = id => {
    if (document.blocks.length === 1) return;
    const index = document.blocks.findIndex(b => b.id === id); const nextActive = document.blocks[index - 1] || document.blocks[index + 1];
    commit({ ...document, blocks: document.blocks.filter(b => b.id !== id) }); setActiveId(nextActive.id);
    if (nextActive.type !== 'divider') pendingFocus.current = nextActive.id; setLanguageOpenId(null);
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
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); insertAfter(block.id); return; }
    if (event.key === 'Backspace' && block.text === '') { event.preventDefault(); removeBlock(block.id); }
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
        {document.blocks.map((block, index) => <React.Fragment key={block.id}>
          <div className={`editor-block ${blockClass(block)} ${activeId === block.id ? 'active' : ''}`} onClick={event => { event.stopPropagation(); setActiveId(block.id); requestAnimationFrame(() => focusBlock(block.id)); }}>
            {block.type === 'divider' ? <div className="divider-line" role="separator" aria-label="Divider"/> : <>
              {block.type === 'pre' && <div className="code-tools" onClick={event => event.stopPropagation()}>
                <button type="button" className="code-language-button" aria-label="Set code language" aria-expanded={languageOpenId === block.id} onClick={() => { setActiveId(block.id); setLanguageOpenId(open => open === block.id ? null : block.id); setFormatOpen(false); }}>
                  {CODE_LANGUAGES.find(language => language.value === block.language)?.label || block.language || 'Language'} <span className="code-language-chevron">⌄</span>
                </button>
                {languageOpenId === block.id && <div className="code-language-menu" onClick={event => event.stopPropagation()}>{CODE_LANGUAGES.map(language => <button type="button" key={language.value || 'plain'} className={`code-language-option ${block.language === language.value ? 'active' : ''}`} onClick={() => setCodeLanguage(block.id, language.value)}><span>{language.label}</span>{block.language === language.value && <Icon name="check" size={18}/>}</button>)}</div>}
              </div>}
              {block.type === 'pre' ? <textarea ref={node => { if (node) editorRefs.current.set(block.id, node); else editorRefs.current.delete(block.id); }} className="editable code-editor" value={block.text} rows={4} wrap="off" spellCheck={false} aria-label="Code block" aria-multiline="true" placeholder={placeholder(block)} onFocus={() => setActiveId(block.id)} onClick={event => event.stopPropagation()} onChange={event => updateText(block.id, event.currentTarget.value)} onKeyDown={event => handleKeyDown(event, block)}/> : <div ref={node => { if (node) editorRefs.current.set(block.id, node); else editorRefs.current.delete(block.id); }} className="editable" contentEditable suppressContentEditableWarning spellCheck role="textbox" aria-multiline="true" aria-label={block.type === 'heading' ? `Heading ${block.size}` : block.type === 'footer' ? 'Footer' : 'Paragraph'} data-placeholder={placeholder(block)} onFocus={() => setActiveId(block.id)} onClick={event => event.stopPropagation()} onInput={event => updateText(block.id, event.currentTarget.textContent || '')} onKeyDown={event => handleKeyDown(event, block)}/>} 
            </>}
          </div>
          {block.type === 'divider' && index === document.blocks.length - 1 && <div className="divider-continuation" onClick={event => event.stopPropagation()}><div ref={node => { if (node) continuationRefs.current.set(block.id, node); else continuationRefs.current.delete(block.id); }} className="continuation-editable" contentEditable="plaintext-only" suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Text below divider" data-placeholder="Write here…" onFocus={() => setActiveId(block.id)} onInput={event => { const text = event.currentTarget.innerText.replace(/\r\n/g, '\n').trimEnd(); if (text) createParagraphAfterDivider(block.id, text); }}/></div>}
        </React.Fragment>)}
      </div>
    </section>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <footer className="composer-bar"><div className="toolbar"><div className="format-wrap"><button className={`tool-button heading-tool ${formatOpen ? 'selected' : ''}`} aria-label="Text and block formatting" aria-expanded={formatOpen} onClick={event => { event.stopPropagation(); setLanguageOpenId(null); setFormatOpen(open => !open); }}>H</button>
      {formatOpen && <div className="format-menu" onClick={event => event.stopPropagation()}><div className="format-menu-title">Text format</div><button className={activeBlock?.type === 'paragraph' ? 'menu-item active' : 'menu-item'} onClick={() => changeType('paragraph')}><span className="menu-heading paragraph-icon">P</span><span>Paragraph</span>{activeBlock?.type === 'paragraph' && <Icon name="check" size={21}/>}</button>{HEADING_OPTIONS.map(option => <button key={option.size} className={activeBlock?.type === 'heading' && activeBlock.size === option.size ? 'menu-item active' : 'menu-item'} onClick={() => changeType('heading', option.size)}><span className={`menu-heading h-${option.size}`}>H{option.size}</span><span>{option.label}</span>{activeBlock?.type === 'heading' && activeBlock.size === option.size && <Icon name="check" size={21}/>}</button>)}<div className="format-menu-title block-title">Blocks</div>{BLOCK_OPTIONS.map(option => <button key={option.type} className={activeBlock?.type === option.type ? 'menu-item active' : 'menu-item'} onClick={() => changeType(option.type)}><span className={`menu-heading block-icon ${option.type}`}>{option.icon}</span><span>{option.label}</span>{activeBlock?.type === option.type && <Icon name="check" size={21}/>}</button>)}</div>}
    </div></div><button className="share-button" aria-label="Send Rich Message to yourself" onClick={send} disabled={sending}><Icon name="send" size={23}/></button></footer>
  </main>;
}
