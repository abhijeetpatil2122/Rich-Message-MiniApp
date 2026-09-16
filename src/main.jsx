import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronDown, Eye, FileText, Image, MapPin, Plus, Send, Settings2, Table2, Type, Video, WandSparkles } from 'lucide-react';
import './styles.css';

const fallbackBlocks = [
  { id: 'b1', type: 'heading', level: 1, text: 'Your Rich Message' },
  { id: 'b2', type: 'paragraph', text: 'Build a structured Telegram post with the same document model used by the preview and publisher.' },
  { id: 'b3', type: 'table', columns: 2, rows: [['Feature', 'Status'], ['Rich text', 'Ready'], ['Tables', 'Ready']] },
  { id: 'b4', type: 'buttons', align: 'center', buttons: [{ text: 'Preview', style: 'primary' }, { text: 'Learn more', style: 'link' }] }
];

function tg() {
  return window.Telegram?.WebApp;
}

function App() {
  const [blocks, setBlocks] = useState(fallbackBlocks);
  const [selectedId, setSelectedId] = useState('b2');
  const [preview, setPreview] = useState(true);
  const selected = useMemo(() => blocks.find((block) => block.id === selectedId) ?? blocks[0], [blocks, selectedId]);

  useEffect(() => {
    const app = tg();
    if (!app) return;
    app.ready();
    app.expand();
    if (app.setHeaderColor) app.setHeaderColor('#ffffff');
    if (app.setBackgroundColor) app.setBackgroundColor('#f5f7fb');
  }, []);

  function addBlock(type) {
    const id = `b${Date.now()}`;
    const next = type === 'paragraph'
      ? { id, type, text: 'Start writing your content…' }
      : type === 'heading'
        ? { id, type, level: 2, text: 'New heading' }
        : type === 'map'
          ? { id, type, latitude: 0, longitude: 0 }
          : type === 'photo'
            ? { id, type, source: { type: 'url', url: '' } }
            : type === 'video'
              ? { id, type, source: { type: 'url', url: '' } }
              : type === 'table'
                ? { id, type, columns: 2, rows: [['Column 1', 'Column 2'], ['Value', 'Value']] }
                : { id, type: 'buttons', align: 'left', buttons: [{ text: 'Button', style: 'primary' }] };
    setBlocks((current) => [...current, next]);
    setSelectedId(id);
  }

  function updateSelected(patch) {
    setBlocks((current) => current.map((block) => block.id === selected.id ? { ...block, ...patch } : block));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark"><WandSparkles size={18} /></div>
          <div>
            <div className="brand-title">Rich Message Studio</div>
            <div className="brand-subtitle">Telegram Mini App</div>
          </div>
        </div>
        <button className="icon-button" onClick={() => setPreview((value) => !value)} title="Toggle preview">
          <Eye size={18} />
        </button>
      </header>

      <main className="workspace">
        <section className="editor-pane">
          <div className="section-heading">
            <div>
              <div className="eyebrow">COMPOSER</div>
              <h1>Build your message</h1>
            </div>
            <div className="status-pill"><span className="status-dot" />Draft</div>
          </div>

          <div className="composer-card">
            <div className="block-list">
              {blocks.map((block, index) => (
                <button
                  key={block.id}
                  className={`block-card ${selectedId === block.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(block.id)}
                >
                  <div className="block-index">{index + 1}</div>
                  <div className="block-main">
                    <div className="block-type">{block.type.replace('_', ' ')}</div>
                    <div className="block-preview">{block.text || (block.type === 'table' ? `${block.rows.length} rows · ${block.columns} columns` : block.type === 'buttons' ? `${block.buttons.length} button(s)` : block.type === 'map' ? 'Location block' : 'Media block')}</div>
                  </div>
                  <ChevronDown size={16} className="muted-icon" />
                </button>
              ))}
            </div>

            <div className="add-block-row">
              <span className="add-label">Add block</span>
              <div className="quick-adds">
                <button onClick={() => addBlock('heading')}><Type size={16} />Heading</button>
                <button onClick={() => addBlock('paragraph')}><FileText size={16} />Text</button>
                <button onClick={() => addBlock('table')}><Table2 size={16} />Table</button>
                <button onClick={() => addBlock('buttons')}><Plus size={16} />Buttons</button>
                <button onClick={() => addBlock('photo')}><Image size={16} />Photo</button>
                <button onClick={() => addBlock('video')}><Video size={16} />Video</button>
                <button onClick={() => addBlock('map')}><MapPin size={16} />Map</button>
              </div>
            </div>
          </div>

          <section className="inspector-card">
            <div className="inspector-title"><Settings2 size={17} /> Block settings</div>
            {selected?.type === 'heading' || selected?.type === 'paragraph' ? (
              <>
                <label>Text</label>
                <textarea value={selected.text ?? ''} onChange={(event) => updateSelected({ text: event.target.value })} />
                {selected.type === 'heading' && <>
                  <label>Heading size</label>
                  <select value={selected.level} onChange={(event) => updateSelected({ level: Number(event.target.value) })}>
                    {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>Heading {level}</option>)}
                  </select>
                </>}
              </>
            ) : selected?.type === 'buttons' ? (
              <>
                <label>Row alignment</label>
                <select value={selected.align} onChange={(event) => updateSelected({ align: event.target.value })}>
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
                <div className="helper-text">Button builder will support Telegram RichMessageButton actions and styles in the next editor pass.</div>
              </>
            ) : selected?.type === 'table' ? (
              <div className="helper-text">Table builder foundation is ready for rows, columns, spans, alignment, compact, bordered and striped options.</div>
            ) : selected?.type === 'map' ? (
              <div className="helper-text">Map block is ready for native Mini App location input and manual coordinates.</div>
            ) : (
              <div className="helper-text">Media blocks will accept Telegram file IDs, uploads and HTTPS URLs through the backend media pipeline.</div>
            )}
          </section>
        </section>

        {preview && <section className="preview-pane">
          <div className="preview-heading">
            <div><div className="eyebrow">LIVE PREVIEW</div><h2>Telegram-style message</h2></div>
            <div className="preview-actions"><button className="secondary-button">Save</button><button className="primary-button"><Send size={15} /> Share</button></div>
          </div>

          <div className="phone-frame">
            <div className="phone-header"><div className="chat-avatar">R</div><div><strong>Rich Studio</strong><span>preview</span></div></div>
            <div className="chat-background">
              <div className="telegram-message">
                {blocks.map((block) => <PreviewBlock key={block.id} block={block} />)}
                <div className="message-meta">09:41 ✓✓</div>
              </div>
            </div>
          </div>
        </section>}
      </main>

      <footer className="bottom-bar">
        <div className="format-note">RDM → Rich Message</div>
        <button className="publish-button"><Send size={16} /> Publish</button>
      </footer>
    </div>
  );
}

function PreviewBlock({ block }) {
  if (block.type === 'heading') return <div className={`rich-heading h${block.level}`}>{block.text}</div>;
  if (block.type === 'paragraph') return <p className="rich-paragraph">{block.text}</p>;
  if (block.type === 'table') return <div className="rich-table">{block.rows.map((row, i) => <div className="table-row" key={i}>{row.map((cell, j) => <div className={`table-cell ${i === 0 ? 'header' : ''}`} key={j}>{cell}</div>)}</div>)}</div>;
  if (block.type === 'buttons') return <div className={`rich-buttons align-${block.align}`}>{block.buttons.map((button, i) => <span className={`rich-button ${button.style}`} key={i}>{button.text}</span>)}</div>;
  if (block.type === 'map') return <div className="media-placeholder"><MapPin size={18} /> Map</div>;
  if (block.type === 'photo') return <div className="media-placeholder"><Image size={18} /> Photo media</div>;
  if (block.type === 'video') return <div className="media-placeholder"><Video size={18} /> Video media</div>;
  return null;
}

createRoot(document.getElementById('root')).render(<App />);
