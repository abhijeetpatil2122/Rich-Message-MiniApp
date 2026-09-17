import React, { useEffect, useRef, useState } from 'react';
import { createBlock, createInitialDocument, toTelegramRichMessage } from './lib/document.js';

const tg = () => window.Telegram?.WebApp;

function Icon({ name, size = 24 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    undo: <><path d="M9 7 4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 6 6" /></>,
    redo: <><path d="m15 7 5 5-5 5" /><path d="M20 12H10a6 6 0 0 0-6 6" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const HEADING_OPTIONS = [1, 2, 3, 4, 5, 6].map((size) => ({ size, label: `Heading ${size}` }));
const BLOCK_OPTIONS = [
  { type: 'pre', label: 'Code block', icon: '</>' },
  { type: 'footer', label: 'Footer', icon: 'F' },
  { type: 'divider', label: 'Divider', icon: '—' },
];

const CODE_LANGUAGES = [
  { value: '', label: 'Plain text' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
];

function clone(value) { return structuredClone(value); }

export default function App() {
  const [document, setDocument] = useState(createInitialDocument);
  const [activeId, setActiveId] = useState(document.blocks[0].id);
  const [formatOpen, setFormatOpen] = useState(false);
  const [languageOpenId, setLanguageOpenId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);
  const editorRefs = useRef(new Map());
  const pendingFocus = useRef(null);
  const history = useRef({ past: [], future: [], lastInputAt: 0 });

  useEffect(() => {
    const app = tg();
    if (!app) return;
    app.ready();
    app.expand();
    app.setHeaderColor('secondary_bg_color');
    app.setBackgroundColor('bg_color');
  }, []);

  useEffect(() => {
    for (const block of document.blocks) {
      const node = editorRefs.current.get(block.id);
      if (node && node.textContent !== (block.text || '')) node.textContent = block.text || '';
    }
  }, [document]);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const id = pendingFocus.current;
    pendingFocus.current = null;
    requestAnimationFrame(() => {
      const node = editorRefs.current.get(id);
      if (!node) return;
      node.focus();
      const selection = window.getSelection();
      if (!selection) return;
      const range = window.document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }, [document]);

  const activeBlock = document.blocks.find((block) => block.id === activeId) || document.blocks[0];
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  void historyVersion;

  const commit = (next, { coalesce = false } = {}) => {
    const now = Date.now();
    if (!coalesce || now - history.current.lastInputAt > 650) history.current.past.push(clone(document));
    history.current.lastInputAt = now;
    history.current.future = [];
    setDocument(next);
    setHistoryVersion((value) => value + 1);
  };

  const updateText = (id, text) => commit({ ...document, blocks: document.blocks.map((block) => block.id === id ? { ...block, text } : block) }, { coalesce: true });

  const changeType = (type, size = null) => {
    if (type === 'divider') {
      const index = document.blocks.findIndex((block) => block.id === activeId);
      if (index < 0) return;

      // A divider is a standalone structural block. Do not create an extra paragraph
      // here; the user can press Enter in the surrounding text block when they want to continue.
      const divider = createBlock('divider');
      const blocks = [...document.blocks];
      blocks.splice(index + 1, 0, divider);
      commit({ ...document, blocks });
      setActiveId(activeId);
      setLanguageOpenId(null);
    } else {
      commit({
        ...document,
        blocks: document.blocks.map((block) => {
          if (block.id !== activeId) return block;
          if (type === 'paragraph') return { ...block, type: 'paragraph' };
          if (type === 'heading') return { ...block, type: 'heading', size };
          if (type === 'pre') return { ...block, type: 'pre', language: block.language || '' };
          if (type === 'footer') return { ...block, type: 'footer' };
          return block;
        }),
      });
      setLanguageOpenId(null);
      requestAnimationFrame(() => editorRefs.current.get(activeId)?.focus());
    }
    setFormatOpen(false);
    tg()?.HapticFeedback?.selectionChanged?.();
  };

  const setCodeLanguage = (id, language) => {
    commit({
      ...document,
      blocks: document.blocks.map((block) => block.id === id ? { ...block, language } : block),
    });
    setLanguageOpenId(null);
    setActiveId(id);
    tg()?.HapticFeedback?.selectionChanged?.();
    requestAnimationFrame(() => editorRefs.current.get(id)?.focus());
  };

  const insertAfter = (id) => {
    const nextBlock = createBlock('paragraph');
    const blocks = [...document.blocks];
    blocks.splice(blocks.findIndex((block) => block.id === id) + 1, 0, nextBlock);
    commit({ ...document, blocks });
    setActiveId(nextBlock.id);
    pendingFocus.current = nextBlock.id;
    setLanguageOpenId(null);
  };

  const removeBlock = (id) => {
    if (document.blocks.length === 1) return;
    const index = document.blocks.findIndex((block) => block.id === id);
    const nextActive = document.blocks[index - 1] || document.blocks[index + 1];
    commit({ ...document, blocks: document.blocks.filter((block) => block.id !== id) });
    setActiveId(nextActive.id);
    if (nextActive.type !== 'divider') pendingFocus.current = nextActive.id;
    setLanguageOpenId(null);
  };

  const undo = () => {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(clone(document));
    history.current.lastInputAt = 0;
    setDocument(previous);
    setActiveId(previous.blocks.find((block) => block.id === activeId)?.id || previous.blocks[0].id);
    setFormatOpen(false);
    setLanguageOpenId(null);
    setHistoryVersion((value) => value + 1);
  };

  const redo = () => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(clone(document));
    history.current.lastInputAt = 0;
    setDocument(next);
    setActiveId(next.blocks.find((block) => block.id === activeId)?.id || next.blocks[0].id);
    setFormatOpen(false);
    setLanguageOpenId(null);
    setHistoryVersion((value) => value + 1);
  };

  const handleKeyDown = (event, block) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      insertAfter(block.id);
      return;
    }
    if (event.key === 'Backspace' && block.text === '') {
      event.preventDefault();
      removeBlock(block.id);
    }
  };

  const send = async () => {
    setError('');
    const app = tg();
    if (!app?.initData) {
      setError('Open this editor inside Telegram first.');
      return;
    }
    const payload = toTelegramRichMessage(document);
    if (!payload.blocks.length) {
      setError('Write something before sending.');
      return;
    }
    setSending(true);
    try {
      const response = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: app.initData, document }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not send Rich Message.');
      app.HapticFeedback?.impactOccurred?.('light');
    } catch (cause) {
      console.error(cause);
      setError(cause?.message || 'Could not send Rich Message.');
    } finally {
      setSending(false);
    }
  };

  const blockClass = (block) => {
    if (block.type === 'heading') return `heading heading-${block.size}`;
    if (block.type === 'pre') return 'preformatted';
    if (block.type === 'footer') return 'footer-block';
    if (block.type === 'divider') return 'divider-block';
    return 'paragraph';
  };

  const placeholder = (block) => {
    if (block.type === 'heading') return `Heading ${block.size}`;
    if (block.type === 'pre') return 'Write code…';
    if (block.type === 'footer') return 'Footer…';
    return 'Write here…';
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="history-actions">
          <button className="icon-button" aria-label="Undo" onClick={undo} disabled={!canUndo}><Icon name="undo" /></button>
          <button className="icon-button" aria-label="Redo" onClick={redo} disabled={!canRedo}><Icon name="redo" /></button>
        </div>
      </header>

      <section className="editor" onClick={() => { setFormatOpen(false); setLanguageOpenId(null); }}>
        <div className="document-area">
          {document.blocks.map((block) => (
            <div key={block.id} className={`editor-block ${blockClass(block)} ${activeId === block.id ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); setActiveId(block.id); }}>
              {block.type === 'divider' ? (
                <div className="divider-line" role="separator" aria-label="Divider" />
              ) : (
                <>
                  {block.type === 'pre' && (
                    <div className="code-tools" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="code-language-button"
                        aria-label="Set code language"
                        aria-expanded={languageOpenId === block.id}
                        onClick={() => { setActiveId(block.id); setLanguageOpenId((openId) => openId === block.id ? null : block.id); setFormatOpen(false); }}
                      >
                        {CODE_LANGUAGES.find((language) => language.value === block.language)?.label || block.language || 'Language'}
                        <span className="code-language-chevron">⌄</span>
                      </button>
                      {languageOpenId === block.id && (
                        <div className="code-language-menu" onClick={(event) => event.stopPropagation()}>
                          {CODE_LANGUAGES.map((language) => (
                            <button
                              type="button"
                              key={language.value || 'plain'}
                              className={`code-language-option ${block.language === language.value ? 'active' : ''}`}
                              onClick={() => setCodeLanguage(block.id, language.value)}
                            >
                              <span>{language.label}</span>
                              {block.language === language.value && <Icon name="check" size={18} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    ref={(node) => { if (node) editorRefs.current.set(block.id, node); else editorRefs.current.delete(block.id); }}
                    className="editable"
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={block.type !== 'pre'}
                    role="textbox"
                    aria-label={block.type === 'heading' ? `Heading ${block.size}` : block.type === 'pre' ? 'Code block' : block.type === 'footer' ? 'Footer' : 'Paragraph'}
                    data-placeholder={placeholder(block)}
                    onFocus={() => setActiveId(block.id)}
                    onInput={(event) => updateText(block.id, event.currentTarget.textContent || '')}
                    onKeyDown={(event) => handleKeyDown(event, block)}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <footer className="composer-bar">
        <div className="toolbar">
          <div className="format-wrap">
            <button className={`tool-button heading-tool ${formatOpen ? 'selected' : ''}`} aria-label="Text and block formatting" aria-expanded={formatOpen} onClick={(event) => { event.stopPropagation(); setLanguageOpenId(null); setFormatOpen((open) => !open); }}>H</button>
            {formatOpen && <div className="format-menu" onClick={(event) => event.stopPropagation()}>
              <div className="format-menu-title">Text format</div>
              <button className={activeBlock?.type === 'paragraph' ? 'menu-item active' : 'menu-item'} onClick={() => changeType('paragraph')}><span className="menu-heading paragraph-icon">P</span><span>Paragraph</span>{activeBlock?.type === 'paragraph' && <Icon name="check" size={21} />}</button>
              {HEADING_OPTIONS.map((option) => <button key={option.size} className={activeBlock?.type === 'heading' && activeBlock.size === option.size ? 'menu-item active' : 'menu-item'} onClick={() => changeType('heading', option.size)}><span className={`menu-heading h-${option.size}`}>H{option.size}</span><span>{option.label}</span>{activeBlock?.type === 'heading' && activeBlock.size === option.size && <Icon name="check" size={21} />}</button>)}
              <div className="format-menu-title block-title">Blocks</div>
              {BLOCK_OPTIONS.map((option) => <button key={option.type} className={activeBlock?.type === option.type ? 'menu-item active' : 'menu-item'} onClick={() => changeType(option.type)}><span className={`menu-heading block-icon ${option.type}`}>{option.icon}</span><span>{option.label}</span>{activeBlock?.type === option.type && <Icon name="check" size={21} />}</button>)}
            </div>}
          </div>
        </div>
        <button className="share-button" aria-label="Send Rich Message to yourself" onClick={send} disabled={sending}><Icon name="send" size={25} /></button>
      </footer>
    </main>
  );
}
