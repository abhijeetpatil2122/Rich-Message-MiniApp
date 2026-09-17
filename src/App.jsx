import React, { useEffect, useRef, useState } from 'react';
import { createBlock, createInitialDocument, documentTextLength, toTelegramRichMessage } from './lib/document.js';
import { buildInlineQuery, INLINE_QUERY_LIMIT, queryLength } from './lib/codec.js';

const tg = () => window.Telegram?.WebApp;

function Icon({ name, size = 24 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    back: <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
    undo: <><path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/></>,
    redo: <><path d="m15 7 5 5-5 5"/><path d="M20 12H10a6 6 0 0 0-6 6"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const HEADING_OPTIONS = [
  { size: 1, label: 'Heading 1' },
  { size: 2, label: 'Heading 2' },
  { size: 3, label: 'Heading 3' },
  { size: 4, label: 'Heading 4' },
  { size: 5, label: 'Heading 5' },
  { size: 6, label: 'Heading 6' },
];

export default function App() {
  const [document, setDocument] = useState(createInitialDocument);
  const [activeId, setActiveId] = useState(document.blocks[0].id);
  const [formatOpen, setFormatOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const editorRefs = useRef(new Map());
  const pendingFocus = useRef(null);

  useEffect(() => {
    const app = tg();
    if (!app) return;
    app.ready();
    app.expand();
    app.setHeaderColor('secondary_bg_color');
    app.setBackgroundColor('bg_color');
  }, []);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const id = pendingFocus.current;
    pendingFocus.current = null;
    requestAnimationFrame(() => {
      const node = editorRefs.current.get(id);
      if (!node) return;
      node.focus();
      const range = window.getSelection();
      range?.selectAllChildren(node);
      range?.collapse(false);
    });
  }, [document]);

  const activeBlock = document.blocks.find((block) => block.id === activeId) || document.blocks[0];

  const updateText = (id, text) => {
    setDocument((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (block.id === id ? { ...block, text } : block)),
    }));
  };

  const changeType = (type, size = 1) => {
    setDocument((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === activeId
          ? type === 'heading'
            ? { ...block, type, size }
            : { id: block.id, type: 'paragraph', text: block.text }
          : block,
      ),
    }));
    setFormatOpen(false);
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
  };

  const insertAfter = (id) => {
    const next = createBlock('paragraph');
    setDocument((current) => {
      const index = current.blocks.findIndex((block) => block.id === id);
      const blocks = [...current.blocks];
      blocks.splice(index + 1, 0, next);
      return { ...current, blocks };
    });
    setActiveId(next.id);
    pendingFocus.current = next.id;
  };

  const removeBlock = (id) => {
    if (document.blocks.length === 1) return;
    const index = document.blocks.findIndex((block) => block.id === id);
    const nextActive = document.blocks[index - 1] || document.blocks[index + 1];
    setDocument((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== id),
    }));
    setActiveId(nextActive.id);
    pendingFocus.current = nextActive.id;
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

  const share = async () => {
    setError('');
    const app = tg();
    if (!app?.switchInlineQuery) {
      setError('Open this editor inside Telegram to share inline.');
      return;
    }

    const payload = toTelegramRichMessage(document);
    if (!payload.blocks.length) {
      setError('Write something before sharing.');
      return;
    }

    if (documentTextLength(document) > 32768) {
      setError('Rich Message text is over Telegram’s 32,768 character limit.');
      return;
    }

    setSharing(true);
    try {
      const query = await buildInlineQuery(document);
      if (queryLength(query) > INLINE_QUERY_LIMIT) {
        setError('This message is too large for Telegram inline mode. Shorten it and try again.');
        return;
      }
      app.HapticFeedback?.impactOccurred?.('light');
      app.switchInlineQuery(query, ['users', 'groups', 'channels']);
    } catch (cause) {
      console.error(cause);
      setError('Could not prepare the inline message.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="icon-button" aria-label="Back" onClick={() => tg()?.close()}>
          <Icon name="back" />
        </button>
        <div className="history-actions">
          <button className="icon-button muted" aria-label="Undo" disabled><Icon name="undo" /></button>
          <button className="icon-button muted" aria-label="Redo" disabled><Icon name="redo" /></button>
        </div>
      </header>

      <section className="editor" onClick={() => setFormatOpen(false)}>
        <div className="document-area">
          {document.blocks.map((block) => (
            <div
              key={block.id}
              className={`editor-block ${block.type === 'heading' ? `heading heading-${block.size}` : 'paragraph'} ${activeId === block.id ? 'active' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                setActiveId(block.id);
              }}
            >
              <div
                ref={(node) => {
                  if (node) editorRefs.current.set(block.id, node);
                  else editorRefs.current.delete(block.id);
                }}
                className="editable"
                contentEditable
                suppressContentEditableWarning
                spellCheck
                role="textbox"
                aria-label={block.type === 'heading' ? `Heading ${block.size}` : 'Paragraph'}
                data-placeholder={block.type === 'heading' ? `Heading ${block.size}` : document.blocks.length === 1 ? 'Start writing…' : 'Write something…'}
                onFocus={() => setActiveId(block.id)}
                onInput={(event) => updateText(block.id, event.currentTarget.textContent || '')}
                onKeyDown={(event) => handleKeyDown(event, block)}
              >
                {block.text}
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <footer className="composer-bar">
        <div className="toolbar">
          <button className="tool-button ai" aria-label="Assistant" disabled>✦</button>
          <button className="tool-button" aria-label="Emoji" disabled>☺</button>
          <div className="format-wrap">
            <button
              className={`tool-button text-tool ${formatOpen ? 'selected' : ''}`}
              aria-label="Text formatting"
              aria-expanded={formatOpen}
              onClick={(event) => {
                event.stopPropagation();
                setFormatOpen((open) => !open);
              }}
            >Aa</button>
            {formatOpen && (
              <div className="format-menu" onClick={(event) => event.stopPropagation()}>
                <button className={!activeBlock || activeBlock.type === 'paragraph' ? 'menu-item active' : 'menu-item'} onClick={() => changeType('paragraph')}>
                  <span className="menu-icon">T</span><span>Text</span>{activeBlock?.type === 'paragraph' && <Icon name="check" size={21} />}
                </button>
                {HEADING_OPTIONS.map((option) => (
                  <button
                    key={option.size}
                    className={activeBlock?.type === 'heading' && activeBlock.size === option.size ? 'menu-item active' : 'menu-item'}
                    onClick={() => changeType('heading', option.size)}
                  >
                    <span className={`menu-heading h-${option.size}`}>H</span><span>{option.label}</span>
                    {activeBlock?.type === 'heading' && activeBlock.size === option.size && <Icon name="check" size={21} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="tool-button add" aria-label="Add paragraph" onClick={() => insertAfter(activeId)}><Icon name="plus" size={22} /></button>
        </div>
        <button className="share-button" aria-label="Share with inline mode" onClick={share} disabled={sharing}>
          <Icon name="send" size={25} />
        </button>
      </footer>
    </main>
  );
}
