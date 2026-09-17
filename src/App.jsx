import React, { useEffect, useRef, useState } from 'react';
import { createBlock, createInitialDocument, documentTextLength, toTelegramRichMessage } from './lib/document.js';

const tg = () => window.Telegram?.WebApp;

function Icon({ name, size = 24 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  const paths = {
    undo: <><path d="M9 7 4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 6 6" /></>,
    redo: <><path d="m15 7 5 5-5 5" /><path d="M20 12H10a6 6 0 0 0-6 6" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    check: <path d="m5 12 4 4L19 6" />,
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

function clone(value) {
  return structuredClone(value);
}

export default function App() {
  const [document, setDocument] = useState(createInitialDocument);
  const [activeId, setActiveId] = useState(document.blocks[0].id);
  const [formatOpen, setFormatOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
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

  // Never re-render the editable element's children from React on every keystroke.
  // That is what caused the caret to jump to the beginning ("hi |" -> "|ih").
  useEffect(() => {
    for (const block of document.blocks) {
      const node = editorRefs.current.get(block.id);
      if (!node) continue;
      const value = node.textContent || '';
      if (value !== block.text) node.textContent = block.text;
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

  const commit = (next, { historyEntry = true, coalesce = false } = {}) => {
    if (historyEntry) {
      const now = Date.now();
      const shouldRecord = !coalesce || now - history.current.lastInputAt > 650;
      if (shouldRecord) history.current.past.push(clone(document));
      history.current.lastInputAt = now;
      history.current.future = [];
    } else {
      history.current.lastInputAt = 0;
    }

    setDocument(next);
    setHistoryVersion((value) => value + 1);
  };

  const updateText = (id, text) => {
    const next = {
      ...document,
      blocks: document.blocks.map((block) => (block.id === id ? { ...block, text } : block)),
    };
    commit(next, { coalesce: true });
  };

  const changeType = (size) => {
    const next = {
      ...document,
      blocks: document.blocks.map((block) =>
        block.id === activeId ? { ...block, type: 'heading', size } : block,
      ),
    };
    commit(next);
    setFormatOpen(false);
    tg()?.HapticFeedback?.selectionChanged?.();
    requestAnimationFrame(() => editorRefs.current.get(activeId)?.focus());
  };

  const insertAfter = (id) => {
    const nextBlock = createBlock('paragraph');
    const index = document.blocks.findIndex((block) => block.id === id);
    const blocks = [...document.blocks];
    blocks.splice(index + 1, 0, nextBlock);

    commit({ ...document, blocks });
    setActiveId(nextBlock.id);
    pendingFocus.current = nextBlock.id;
  };

  const removeBlock = (id) => {
    if (document.blocks.length === 1) return;
    const index = document.blocks.findIndex((block) => block.id === id);
    const nextActive = document.blocks[index - 1] || document.blocks[index + 1];
    const blocks = document.blocks.filter((block) => block.id !== id);

    commit({ ...document, blocks });
    setActiveId(nextActive.id);
    pendingFocus.current = nextActive.id;
  };

  const undo = () => {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(clone(document));
    history.current.lastInputAt = 0;
    setDocument(previous);
    setActiveId(previous.blocks.find((block) => block.id === activeId)?.id || previous.blocks[0].id);
    setFormatOpen(false);
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
      // Do not put the Rich Message JSON in Telegram's inline query.
      // The inline query is only a short random reference; the full document
      // is stored temporarily on the server and resolved by the inline webhook.
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok || !data.query) {
        throw new Error(data.error || 'Could not prepare the Rich Message.');
      }

      app.HapticFeedback?.impactOccurred?.('light');
      app.switchInlineQuery(data.query, ['users', 'groups', 'channels']);
    } catch (cause) {
      console.error(cause);
      setError(cause?.message || 'Could not prepare the Rich Message.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="history-actions">
          <button className="icon-button" aria-label="Undo" onClick={undo} disabled={!canUndo}>
            <Icon name="undo" />
          </button>
          <button className="icon-button" aria-label="Redo" onClick={redo} disabled={!canRedo}>
            <Icon name="redo" />
          </button>
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
                data-placeholder={block.type === 'heading' ? `Heading ${block.size}` : 'Write here…'}
                onFocus={() => setActiveId(block.id)}
                onInput={(event) => updateText(block.id, event.currentTarget.textContent || '')}
                onKeyDown={(event) => handleKeyDown(event, block)}
              />
            </div>
          ))}
        </div>
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <footer className="composer-bar">
        <div className="toolbar">
          <div className="format-wrap">
            <button
              className={`tool-button heading-tool ${formatOpen ? 'selected' : ''}`}
              aria-label="Heading formatting"
              aria-expanded={formatOpen}
              onClick={(event) => {
                event.stopPropagation();
                setFormatOpen((open) => !open);
              }}
            >
              H
            </button>
            {formatOpen && (
              <div className="format-menu" onClick={(event) => event.stopPropagation()}>
                <div className="format-menu-title">Heading</div>
                {HEADING_OPTIONS.map((option) => (
                  <button
                    key={option.size}
                    className={activeBlock?.type === 'heading' && activeBlock.size === option.size ? 'menu-item active' : 'menu-item'}
                    onClick={() => changeType(option.size)}
                  >
                    <span className={`menu-heading h-${option.size}`}>H{option.size}</span>
                    <span>{option.label}</span>
                    {activeBlock?.type === 'heading' && activeBlock.size === option.size && <Icon name="check" size={21} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button className="share-button" aria-label="Share with inline mode" onClick={share} disabled={sharing}>
          <Icon name="send" size={25} />
        </button>
      </footer>
    </main>
  );
}
