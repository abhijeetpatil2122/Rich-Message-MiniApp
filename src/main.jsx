import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { init } from '@telegram-apps/sdk';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Braces, Check, ChevronDown, CircleHelp,
  Code2, Copy, Eye, FileCode2, FileText, Heading1, ImagePlus, Italic, Link2, List,
  ListOrdered, MapPin, Minus, MoreHorizontal, Plus, Quote, Redo2, Send, Settings2,
  Strikethrough, Table2, Trash2, Underline, Undo2, Video, X
} from 'lucide-react';
import './editor.css';

const STORAGE_KEY = 'rich-message-miniapp-v3';
const uid = () => `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const block = (type = 'paragraph', extra = {}) => ({ id: uid(), type, text: '', ...extra });

const starter = [
  block('paragraph', { text: '' }),
];

function tg() {
  return window.Telegram?.WebApp || null;
}

function bootTelegram() {
  try { init(); } catch {}
  const app = tg();
  if (!app) return;
  try {
    app.ready();
    app.expand();
    app.setHeaderColor(app.themeParams?.header_bg_color || app.themeParams?.bg_color || '#ffffff');
    app.setBackgroundColor(app.themeParams?.bg_color || '#ffffff');
    app.setBottomBarColor(app.themeParams?.bottom_bar_bg_color || app.themeParams?.bg_color || '#ffffff');
  } catch {}
}

function applyTheme() {
  const app = tg();
  const root = document.documentElement;
  const t = app?.themeParams || {};
  const fallback = {
    bg_color: '#ffffff', text_color: '#111827', hint_color: '#8b96a5',
    link_color: '#3390ec', button_color: '#3390ec', button_text_color: '#ffffff',
    secondary_bg_color: '#f1f3f5', header_bg_color: '#ffffff',
    bottom_bar_bg_color: '#ffffff', section_bg_color: '#ffffff',
    section_header_text_color: '#8b96a5', section_separator_color: '#e5e7eb',
    subtitle_text_color: '#8b96a5', destructive_text_color: '#e53935',
    accent_text_color: '#3390ec'
  };
  Object.entries(fallback).forEach(([key, value]) => {
    root.style.setProperty(`--tg-${key.replaceAll('_', '-')}`, t[key] || value);
  });
  root.dataset.scheme = app?.colorScheme || 'light';
}

function useTelegramTheme() {
  useEffect(() => {
    bootTelegram();
    applyTheme();
    const app = tg();
    if (!app) return undefined;
    const onTheme = () => applyTheme();
    app.onEvent('themeChanged', onTheme);
    return () => app.offEvent('themeChanged', onTheme);
  }, []);
}

function loadDraft() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(value) && value.length ? value : starter;
  } catch {
    return starter;
  }
}

function cleanHtml(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html || '';
  wrapper.querySelectorAll('script,style').forEach((node) => node.remove());
  wrapper.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attr) => {
      if (attr.name.toLowerCase().startsWith('on')) node.removeAttribute(attr.name);
    });
  });
  return wrapper.innerHTML;
}

function plainText(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || '';
}

function htmlToRichText(html) {
  const value = cleanHtml(html);
  if (!value) return '';
  return value;
}

function toInputRichMessage(blocks) {
  const result = [];
  for (const item of blocks) {
    const text = htmlToRichText(item.text);
    if (item.type === 'paragraph') result.push({ type: 'paragraph', text });
    else if (item.type === 'heading') result.push({ type: 'heading', size: item.size || 2, text });
    else if (item.type === 'pre') result.push({ type: 'pre', language: item.language || undefined, text: plainText(item.text) });
    else if (item.type === 'quote') result.push({ type: 'blockquote', blocks: [{ type: 'paragraph', text }] });
    else if (item.type === 'pullquote') result.push({ type: 'pullquote', text });
    else if (item.type === 'expandable') result.push({ type: 'expandable_blockquote', text });
    else if (item.type === 'footer') result.push({ type: 'footer', text });
    else if (item.type === 'divider') result.push({ type: 'divider' });
    else if (item.type === 'math') result.push({ type: 'mathematical_expression', expression: item.expression || '' });
    else if (item.type === 'anchor') result.push({ type: 'anchor', name: item.name || '' });
    else if (item.type === 'list') result.push({ type: 'list', items: item.items.map((x) => ({ blocks: [{ type: 'paragraph', text: x }] })) });
    else if (item.type === 'table') result.push({
      type: 'table',
      is_bordered: item.bordered || undefined,
      is_striped: item.striped || undefined,
      is_compact: item.compact || undefined,
      cells: item.rows.map((row) => row.map((cell) => ({ text: cell.text, is_header: cell.header || undefined, colspan: cell.colspan > 1 ? cell.colspan : undefined, rowspan: cell.rowspan > 1 ? cell.rowspan : undefined, align: cell.align !== 'left' ? cell.align : undefined })))
    });
    else if (item.type === 'buttons') result.push({ type: 'buttons', align: item.align, buttons: item.buttons.map((b) => ({ text: b.text, style: b.style, ...(b.action === 'url' ? { url: b.value } : { callback_data: b.value }) })) });
    else if (item.type === 'photo') result.push({ type: 'photo', photo: item.source || '' });
    else if (item.type === 'video') result.push({ type: 'video', video: item.source || '' });
    else if (item.type === 'map') result.push({ type: 'map', location: { latitude: Number(item.latitude) || 0, longitude: Number(item.longitude) || 0 } });
  }
  return { blocks: result };
}

function App() {
  useTelegramTheme();
  const [blocks, setBlocks] = useState(loadDraft);
  const [selected, setSelected] = useState(blocks[0]?.id || null);
  const [showAdd, setShowAdd] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
  }, [blocks]);

  const current = blocks.find((item) => item.id === selected) || blocks[0];

  const toast = (message) => {
    setNotice(message);
    window.clearTimeout(window.__richToast);
    window.__richToast = window.setTimeout(() => setNotice(''), 1600);
  };

  const commit = (next, remember = true) => {
    if (remember) setHistory((items) => [...items.slice(-29), blocks]);
    setFuture([]);
    setBlocks(next);
  };

  const update = (id, patch, remember = false) => {
    setBlocks((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
    if (remember) setFuture([]);
  };

  const addBlock = (type) => {
    const next = makeBlock(type);
    const index = Math.max(0, blocks.findIndex((item) => item.id === selected));
    const nextBlocks = [...blocks.slice(0, index + 1), next, ...blocks.slice(index + 1)];
    commit(nextBlocks);
    setSelected(next.id);
    setShowAdd(false);
    setShowMore(false);
    window.setTimeout(() => document.getElementById(`editor-${next.id}`)?.focus(), 30);
  };

  const remove = (id) => {
    if (blocks.length === 1) {
      commit([block('paragraph')]);
      return;
    }
    const next = blocks.filter((item) => item.id !== id);
    commit(next);
    setSelected(next[Math.max(0, blocks.findIndex((item) => item.id === id) - 1)]?.id || next[0]?.id);
  };

  const move = (id, direction) => {
    const index = blocks.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [blocks, ...items]);
    setHistory((items) => items.slice(0, -1));
    setBlocks(previous);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, blocks]);
    setFuture((items) => items.slice(1));
    setBlocks(next);
  };

  const copyJson = async () => {
    await navigator.clipboard?.writeText(JSON.stringify({ type: 'rich_message', ...toInputRichMessage(blocks) }, null, 2));
    toast('Rich Message JSON copied');
  };

  const copyHtml = async () => {
    const html = blocks.map((item) => blockToHtml(item)).join('\n');
    await navigator.clipboard?.writeText(html);
    toast('HTML copied');
  };

  const reset = () => {
    commit([block('paragraph')]);
    setSelected(null);
    toast('Draft reset');
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-title"><strong>Rich Message</strong><span>Editor</span></div>
        <div className="header-actions">
          <IconButton title="Undo" disabled={!history.length} onClick={undo}><Undo2 /></IconButton>
          <IconButton title="Redo" disabled={!future.length} onClick={redo}><Redo2 /></IconButton>
          <IconButton title="Preview" active={preview} onClick={() => setPreview((value) => !value)}><Eye /></IconButton>
        </div>
      </header>

      {preview ? (
        <main className="preview-page">
          <div className="preview-top"><span>Preview</span><button onClick={() => setPreview(false)}><X size={18} /> Edit</button></div>
          <TelegramPreview blocks={blocks} />
        </main>
      ) : (
        <main className="editor-page">
          <div className="document-card">
            <div className="document-head">
              <div><span className="eyebrow">RICH MESSAGE</span><h1>New message</h1></div>
              <button className="more-button" onClick={() => setShowMore((value) => !value)}><MoreHorizontal /></button>
            </div>

            {showMore && (
              <div className="more-menu">
                <button onClick={copyJson}><Braces size={17} /> Copy Rich Message JSON</button>
                <button onClick={copyHtml}><FileCode2 size={17} /> Copy HTML</button>
                <button onClick={reset}><Trash2 size={17} /> Reset draft</button>
              </div>
            )}

            <div className="blocks">
              {blocks.map((item, index) => (
                <EditorBlock
                  key={item.id}
                  block={item}
                  index={index}
                  selected={item.id === selected}
                  onSelect={() => setSelected(item.id)}
                  onUpdate={(patch) => update(item.id, patch)}
                  onRemove={() => remove(item.id)}
                  onMove={(direction) => move(item.id, direction)}
                  onAdd={addBlock}
                />
              ))}
            </div>

            <button className="add-inline" onClick={() => setShowAdd(true)}><Plus size={18} /> Add block</button>
          </div>
        </main>
      )}

      {!preview && current && (
        <FormattingBar block={current} onUpdate={(patch) => update(current.id, patch)} onAdd={addBlock} onOpenAdd={() => setShowAdd(true)} />
      )}

      <footer className="bottom-bar">
        <button onClick={() => toast(`${JSON.stringify(toInputRichMessage(blocks)).length} bytes`)}><FileText size={17} /><span>Info</span></button>
        <button onClick={copyJson}><Copy size={17} /><span>Copy</span></button>
        <button className="publish" onClick={() => toast('Publish API will send this InputRichMessage')}><Send size={17} /><span>Publish</span></button>
      </footer>

      {showAdd && <BlockSheet onPick={addBlock} onClose={() => setShowAdd(false)} />}
      {notice && <div className="toast"><Check size={15} /> {notice}</div>}
    </div>
  );
}

function IconButton({ children, onClick, disabled, active, title }) {
  return <button className={`icon-button ${active ? 'active' : ''}`} title={title} disabled={disabled} onClick={onClick}>{children}</button>;
}

function makeBlock(type) {
  switch (type) {
    case 'heading': return block('heading', { text: '', size: 2 });
    case 'quote': return block('quote', { text: '' });
    case 'pullquote': return block('pullquote', { text: '' });
    case 'expandable': return block('expandable', { text: '', label: 'More' });
    case 'pre': return block('pre', { text: '', language: '' });
    case 'footer': return block('footer', { text: '' });
    case 'list': return block('list', { ordered: false, items: [''] });
    case 'table': return block('table', { bordered: true, striped: false, compact: false, rows: [[{ text: '', header: true }, { text: '', header: true }], [{ text: '', header: false }, { text: '', header: false }]] });
    case 'buttons': return block('buttons', { align: 'left', buttons: [{ text: 'Button', style: 'primary', action: 'url', value: '' }] });
    case 'photo': return block('photo', { source: '', caption: '' });
    case 'video': return block('video', { source: '', caption: '' });
    case 'map': return block('map', { latitude: '', longitude: '', zoom: 14 });
    case 'math': return block('math', { expression: '' });
    case 'anchor': return block('anchor', { name: '' });
    case 'divider': return block('divider');
    default: return block('paragraph', { text: '' });
  }
}

function EditorBlock({ block, selected, onSelect, onUpdate, onRemove, onMove, onAdd }) {
  return (
    <section className={`editor-block ${selected ? 'selected' : ''} type-${block.type}`} onClick={onSelect}>
      {selected && <BlockControls onRemove={onRemove} onMove={onMove} />}
      {block.type === 'paragraph' && <EditableText id={block.id} html={block.text} placeholder="Write your message…" onChange={(text) => onUpdate({ text })} onSlash={onAdd} />}
      {block.type === 'heading' && <HeadingBlock block={block} onUpdate={onUpdate} />}
      {block.type === 'quote' && <QuoteBlock block={block} onUpdate={onUpdate} />}
      {block.type === 'pullquote' && <div className="pullquote"><EditableText id={block.id} html={block.text} placeholder="Pull quote…" onChange={(text) => onUpdate({ text })} /></div>}
      {block.type === 'expandable' && <ExpandableBlock block={block} onUpdate={onUpdate} />}
      {block.type === 'pre' && <PreBlock block={block} onUpdate={onUpdate} />}
      {block.type === 'footer' && <div className="footer-block"><EditableText id={block.id} html={block.text} placeholder="Footer…" onChange={(text) => onUpdate({ text })} /></div>}
      {block.type === 'list' && <ListEditor block={block} onUpdate={onUpdate} />}
      {block.type === 'table' && <TableEditor block={block} onUpdate={onUpdate} />}
      {block.type === 'buttons' && <ButtonsEditor block={block} onUpdate={onUpdate} />}
      {block.type === 'photo' && <MediaEditor block={block} kind="photo" onUpdate={onUpdate} />}
      {block.type === 'video' && <MediaEditor block={block} kind="video" onUpdate={onUpdate} />}
      {block.type === 'map' && <MapEditor block={block} onUpdate={onUpdate} />}
      {block.type === 'math' && <MathEditor block={block} onUpdate={onUpdate} />}
      {block.type === 'anchor' && <div className="simple-block"><label>Anchor name</label><input value={block.name} onChange={(e) => onUpdate({ name: e.target.value })} placeholder="section-name" /></div>}
      {block.type === 'divider' && <div className="divider-block" />}
    </section>
  );
}

function BlockControls({ onRemove, onMove }) {
  return <div className="block-controls"><button onClick={(e) => { e.stopPropagation(); onMove(-1); }}>↑</button><button onClick={(e) => { e.stopPropagation(); onMove(1); }}>↓</button><button className="delete" onClick={(e) => { e.stopPropagation(); onRemove(); }}><Trash2 size={14} /></button></div>;
}

function EditableText({ id, html, placeholder, onChange, onSlash, className = '' }) {
  const ref = useRef(null);
  const last = useRef(html);
  useEffect(() => {
    if (!ref.current) return;
    if (last.current !== html && document.activeElement !== ref.current) {
      ref.current.innerHTML = html || '';
      last.current = html;
    }
  }, [html]);
  return <div id={`editor-${id}`} ref={ref} className={`editable-text ${className}`} contentEditable suppressContentEditableWarning data-placeholder={placeholder} dir="auto" spellCheck onInput={(e) => { const value = e.currentTarget.innerHTML; last.current = value; onChange(value); if (plainText(value).trimEnd().endsWith('/')) onSlash?.('paragraph'); }} dangerouslySetInnerHTML={{ __html: html || '' }} />;
}

function HeadingBlock({ block, onUpdate }) {
  return <div className="heading-block"><div className="block-style-row"><select aria-label="Heading level" value={block.size} onChange={(e) => onUpdate({ size: Number(e.target.value) })}>{[1,2,3,4,5,6].map((size) => <option key={size} value={size}>Heading {size}</option>)}</select><span>Section heading</span></div><EditableText id={block.id} html={block.text} className={`heading-text h${block.size}`} placeholder="Heading…" onChange={(text) => onUpdate({ text })} /></div>;
}

function QuoteBlock({ block, onUpdate }) {
  return <div className="quote-editor"><Quote size={18} /><EditableText id={block.id} html={block.text} placeholder="Write a quotation…" onChange={(text) => onUpdate({ text })} /></div>;
}

function ExpandableBlock({ block, onUpdate }) {
  return <div className="expandable-editor"><div className="expandable-title"><ChevronDown size={16} /><input value={block.label} onChange={(e) => onUpdate({ label: e.target.value })} /></div><EditableText id={block.id} html={block.text} placeholder="Expandable content…" onChange={(text) => onUpdate({ text })} /></div>;
}

function PreBlock({ block, onUpdate }) {
  return <div className="pre-editor"><div className="pre-head"><Code2 size={16} /><select value={block.language} onChange={(e) => onUpdate({ language: e.target.value })}><option value="">Plain text</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="json">JSON</option><option value="bash">Bash</option></select></div><EditableText id={block.id} html={block.text} className="code-text" placeholder="Code…" onChange={(text) => onUpdate({ text })} /></div>;
}

function ListEditor({ block, onUpdate }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  const setItem = (index, value) => onUpdate({ items: block.items.map((item, i) => i === index ? value : item) });
  return <div className="list-editor"><div className="list-head"><div><button className={block.ordered ? '' : 'selected'} onClick={() => onUpdate({ ordered: false })}><List size={16} /></button><button className={block.ordered ? 'selected' : ''} onClick={() => onUpdate({ ordered: true })}><ListOrdered size={16} /></button></div><span>{block.ordered ? 'Numbered list' : 'Bulleted list'}</span></div><Tag>{block.items.map((item, index) => <li key={index}><EditableText id={`${block.id}-${index}`} html={item} placeholder="List item…" onChange={(text) => setItem(index, text)} /></li>)}</Tag><button className="add-item" onClick={() => onUpdate({ items: [...block.items, ''] })}><Plus size={15} /> Add item</button></div>;
}

function TableEditor({ block, onUpdate }) {
  const updateCell = (r, c, patch) => onUpdate({ rows: block.rows.map((row, ri) => row.map((cell, ci) => ri === r && ci === c ? { ...cell, ...patch } : cell)) });
  const addRow = () => onUpdate({ rows: [...block.rows, Array.from({ length: block.rows[0]?.length || 2 }, () => ({ text: '', header: false }))] });
  const addColumn = () => onUpdate({ rows: block.rows.map((row) => [...row, { text: '', header: false }]) });
  const removeRow = () => block.rows.length > 1 && onUpdate({ rows: block.rows.slice(0, -1) });
  const removeColumn = () => (block.rows[0]?.length || 0) > 1 && onUpdate({ rows: block.rows.map((row) => row.slice(0, -1)) });
  return <div className="table-editor"><div className="table-head"><div><Table2 size={17} /><strong>Table</strong></div><div><button onClick={addRow}><Plus size={13}/> Row</button><button onClick={addColumn}><Plus size={13}/> Column</button><button onClick={removeRow}>− Row</button><button onClick={removeColumn}>− Column</button></div></div><div className="table-scroll"><table><tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} className={cell.header ? 'is-header' : ''}><EditableText id={`${block.id}-${r}-${c}`} html={cell.text} placeholder="Cell" onChange={(text) => updateCell(r,c,{text})}/><button className="cell-head" title="Toggle header" onClick={() => updateCell(r,c,{header: !cell.header})}><Heading1 size={11}/></button></td>)}</tr>)}</tbody></table></div><div className="table-options"><Toggle label="Borders" checked={block.bordered} onChange={(bordered) => onUpdate({ bordered })}/><Toggle label="Striped" checked={block.striped} onChange={(striped) => onUpdate({ striped })}/><Toggle label="Compact" checked={block.compact} onChange={(compact) => onUpdate({ compact })}/></div></div>;
}

function Toggle({ label, checked, onChange }) { return <button className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span>{label}</span><i /></button>; }

function ButtonsEditor({ block, onUpdate }) {
  const set = (index, patch) => onUpdate({ buttons: block.buttons.map((button, i) => i === index ? { ...button, ...patch } : button) });
  return <div className="buttons-editor"><div className="buttons-head"><strong>Buttons</strong><div><button className={block.align === 'left' ? 'selected' : ''} onClick={() => onUpdate({ align: 'left' })}><AlignLeft size={14}/></button><button className={block.align === 'center' ? 'selected' : ''} onClick={() => onUpdate({ align: 'center' })}><AlignCenter size={14}/></button><button className={block.align === 'right' ? 'selected' : ''} onClick={() => onUpdate({ align: 'right' })}><AlignRight size={14}/></button></div></div><div className={`button-builder-row ${block.align}`}>{block.buttons.map((button, index) => <div className="button-builder" key={index}><input value={button.text} onChange={(e) => set(index,{text:e.target.value})}/><select value={button.style} onChange={(e) => set(index,{style:e.target.value})}><option value="primary">Primary</option><option value="success">Success</option><option value="danger">Danger</option><option value="link">Link</option></select><select value={button.action} onChange={(e) => set(index,{action:e.target.value})}><option value="url">URL</option><option value="callback">Callback</option></select><input value={button.value} onChange={(e) => set(index,{value:e.target.value})} placeholder="Value"/></div>)}</div><button className="add-item" disabled={block.buttons.length >= 8} onClick={() => onUpdate({ buttons: [...block.buttons, { text: 'Button', style: 'primary', action: 'url', value: '' }] })}><Plus size={15}/> Add button</button></div>;
}

function MediaEditor({ block, kind, onUpdate }) {
  const Icon = kind === 'photo' ? ImagePlus : Video;
  return <div className="media-editor"><div className="media-icon"><Icon size={20}/></div><div className="media-fields"><strong>{kind === 'photo' ? 'Photo' : 'Video'}</strong><input value={block.source} onChange={(e) => onUpdate({ source: e.target.value })} placeholder="Telegram file ID or HTTPS URL"/><input value={block.caption} onChange={(e) => onUpdate({ caption: e.target.value })} placeholder="Caption (optional)"/></div></div>;
}

function MapEditor({ block, onUpdate }) {
  const locate = () => navigator.geolocation?.getCurrentPosition((position) => onUpdate({ latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6) }));
  return <div className="map-editor"><div className="map-icon"><MapPin size={20}/></div><div><strong>Map location</strong><div className="map-fields"><input value={block.latitude} onChange={(e) => onUpdate({ latitude: e.target.value })} placeholder="Latitude"/><input value={block.longitude} onChange={(e) => onUpdate({ longitude: e.target.value })} placeholder="Longitude"/></div><button onClick={locate}><MapPin size={14}/> Use my location</button></div></div>;
}

function MathEditor({ block, onUpdate }) { return <div className="math-editor"><div className="math-symbol">∑</div><div><strong>Formula</strong><input value={block.expression} onChange={(e) => onUpdate({ expression: e.target.value })} placeholder="LaTeX expression, e.g. x^2 + y^2 = z^2"/><small>Telegram renders this as a mathematical expression block.</small></div></div>; }

function FormattingBar({ block, onUpdate, onAdd, onOpenAdd }) {
  const exec = (command, value = null) => { document.execCommand(command, false, value); };
  const link = () => { const url = window.prompt('Enter URL'); if (url) exec('createLink', url); };
  return <div className="formatting-wrap"><div className="formatting-bar"><button onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><Bold/></button><button onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><Italic/></button><button onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}><Underline/></button><button onMouseDown={(e) => e.preventDefault()} onClick={() => exec('strikeThrough')}><Strikethrough/></button><button onMouseDown={(e) => e.preventDefault()} onClick={link}><Link2/></button><span/><button onClick={() => exec('insertUnorderedList')}><List/></button><button onClick={() => exec('insertOrderedList')}><ListOrdered/></button><button onClick={() => onAdd('quote')}><Quote/></button><button className="add-button" onClick={onOpenAdd}><Plus/></button></div><div className="format-select"><select value={block.type === 'heading' ? `h${block.size}` : block.type === 'paragraph' ? 'p' : block.type} onChange={(e) => { const value = e.target.value; if (value === 'p') onUpdate({ type: 'paragraph' }); else if (value.startsWith('h')) onUpdate({ type: 'heading', size: Number(value.slice(1)) }); else onAdd(value); }}><option value="p">Paragraph</option>{[1,2,3,4,5,6].map((n)=><option key={n} value={`h${n}`}>Heading {n}</option>)}<option value="quote">Quote</option><option value="pre">Code</option><option value="list">List</option></select><ChevronDown size={15}/></div></div>;
}

function BlockSheet({ onPick, onClose }) {
  const groups = [
    { title: 'Text', items: [['paragraph','Text',FileText],['heading','Heading',Heading1],['quote','Quote',Quote],['pullquote','Pull quote',Quote],['expandable','Expandable',ChevronDown],['pre','Code',Code2],['footer','Footer',FileText],['divider','Divider',Minus]] },
    { title: 'Content', items: [['list','List',List],['table','Table',Table2],['buttons','Buttons',Plus],['math','Formula',Braces],['anchor','Anchor',Link2]] },
    { title: 'Media', items: [['photo','Photo',ImagePlus],['video','Video',Video],['map','Map',MapPin]] }
  ];
  return <div className="sheet-layer"><div className="sheet-dim" onClick={onClose}/><div className="block-sheet"><div className="sheet-handle"/><div className="sheet-title"><strong>Add to message</strong><button onClick={onClose}><X size={18}/></button></div>{groups.map((group)=><div className="sheet-group" key={group.title}><span>{group.title}</span><div className="sheet-grid">{group.items.map(([type,label,Icon])=><button key={type} onClick={() => onPick(type)}><Icon size={19}/><span>{label}</span></button>)}</div></div>)}</div></div>;
}

function blockToHtml(item) {
  const text = cleanHtml(item.text);
  if (item.type === 'paragraph') return `<p>${text}</p>`;
  if (item.type === 'heading') return `<h${item.size}>${text}</h${item.size}>`;
  if (item.type === 'quote') return `<blockquote>${text}</blockquote>`;
  if (item.type === 'pullquote') return `<aside>${text}</aside>`;
  if (item.type === 'expandable') return `<blockquote expandable>${text}</blockquote>`;
  if (item.type === 'pre') return `<pre><code>${plainText(item.text)}</code></pre>`;
  if (item.type === 'footer') return `<footer>${text}</footer>`;
  if (item.type === 'divider') return '<hr/>';
  if (item.type === 'math') return `<tg-math-block>${escapeHtml(item.expression || '')}</tg-math-block>`;
  if (item.type === 'anchor') return `<a name="${escapeHtml(item.name || '')}"></a>`;
  if (item.type === 'list') return `<${item.ordered ? 'ol' : 'ul'}>${item.items.map((x) => `<li>${cleanHtml(x)}</li>`).join('')}</${item.ordered ? 'ol' : 'ul'}>`;
  if (item.type === 'table') return `<table>${item.rows.map((row) => `<tr>${row.map((cell) => `<${cell.header ? 'th' : 'td'}>${cleanHtml(cell.text)}</${cell.header ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
  if (item.type === 'photo') return `<p>[Photo: ${escapeHtml(item.source || '')}]</p>`;
  if (item.type === 'video') return `<p>[Video: ${escapeHtml(item.source || '')}]</p>`;
  if (item.type === 'map') return `<tg-map latitude="${escapeHtml(item.latitude)}" longitude="${escapeHtml(item.longitude)}"></tg-map>`;
  return '';
}

function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }

function TelegramPreview({ blocks }) {
  return <div className="telegram-preview"><div className="fake-bubble">{blocks.map((item) => <PreviewBlock key={item.id} block={item}/>)}</div><span className="fake-time">now ✓</span></div>;
}

function PreviewBlock({ block }) {
  if (block.type === 'paragraph') return <div className="pv-paragraph" dangerouslySetInnerHTML={{ __html: cleanHtml(block.text) }} />;
  if (block.type === 'heading') return <div className={`pv-heading h${block.size}`} dangerouslySetInnerHTML={{ __html: cleanHtml(block.text) }} />;
  if (block.type === 'quote' || block.type === 'pullquote' || block.type === 'expandable') return <div className={`pv-quote ${block.type}`} dangerouslySetInnerHTML={{ __html: cleanHtml(block.text) }} />;
  if (block.type === 'pre') return <pre className="pv-pre">{plainText(block.text)}</pre>;
  if (block.type === 'footer') return <div className="pv-footer" dangerouslySetInnerHTML={{ __html: cleanHtml(block.text) }} />;
  if (block.type === 'divider') return <hr />;
  if (block.type === 'list') { const Tag = block.ordered ? 'ol' : 'ul'; return <Tag className="pv-list">{block.items.map((x,i)=><li key={i} dangerouslySetInnerHTML={{__html:cleanHtml(x)}}/>)}</Tag>; }
  if (block.type === 'table') return <table className="pv-table"><tbody>{block.rows.map((row,r)=><tr key={r}>{row.map((cell,c)=><td className={cell.header?'header':''} key={c}>{plainText(cell.text)}</td>)}</tr>)}</tbody></table>;
  if (block.type === 'buttons') return <div className={`pv-buttons ${block.align}`}>{block.buttons.map((b,i)=><span className={`pv-button ${b.style}`} key={i}>{b.text}</span>)}</div>;
  if (block.type === 'photo' || block.type === 'video') return <div className="pv-media"><span>{block.type === 'photo' ? 'Photo' : 'Video'}</span><small>{block.source || 'Media will appear here'}</small></div>;
  if (block.type === 'math') return <div className="pv-math">{block.expression || 'Formula'}</div>;
  if (block.type === 'map') return <div className="pv-map"><MapPin size={18}/> {block.latitude && block.longitude ? `${block.latitude}, ${block.longitude}` : 'Map location'}</div>;
  return null;
}

createRoot(document.getElementById('root')).render(<App />);
