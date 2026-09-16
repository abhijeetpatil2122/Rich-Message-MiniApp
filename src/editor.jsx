import React, { useEffect, useRef, useState } from 'react';
import { init } from '@telegram-apps/sdk';
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, Bold, Braces, Check, CheckSquare, ChevronDown, ChevronRight, Code2, Copy, Eye, FileCode2, FileText, Heading1, ImagePlus, Italic, Link2, List, ListOrdered, MapPin, Minus, MoreHorizontal, Paperclip, Plus, Quote, Redo2, Send, Strikethrough, Table2, Trash2, Underline, Undo2, Video, X } from 'lucide-react';

const STORAGE_KEY = 'rich-message-miniapp-v6';
const uid = () => `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const makeBlock = (type = 'paragraph', extra = {}) => ({ id: uid(), type, text: '', indent: 0, ...extra });
const starter = [makeBlock('paragraph')];

const themeDefaults = {
  bg_color: '#ffffff', secondary_bg_color: '#f1f3f5', text_color: '#111827', hint_color: '#8b96a5',
  link_color: '#3390ec', button_color: '#3390ec', button_text_color: '#ffffff', header_bg_color: '#ffffff',
  bottom_bar_bg_color: '#ffffff', section_bg_color: '#ffffff', section_header_text_color: '#8b96a5',
  section_separator_color: '#e5e7eb', subtitle_text_color: '#8b96a5', destructive_text_color: '#e53935', accent_text_color: '#3390ec'
};

function tg() { return window.Telegram?.WebApp || null; }
function syncTheme() {
  const app = tg(), root = document.documentElement, t = app?.themeParams || {};
  Object.entries(themeDefaults).forEach(([k, v]) => root.style.setProperty(`--tg-${k.replaceAll('_', '-')}`, t[k] || v));
  root.dataset.scheme = app?.colorScheme || 'light';
  root.style.colorScheme = app?.colorScheme || 'light';
  const bg = t.bg_color || themeDefaults.bg_color;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  try { app?.setHeaderColor(t.header_bg_color || bg); app?.setBackgroundColor(bg); app?.setBottomBarColor(t.bottom_bar_bg_color || bg); } catch {}
}
function useTelegram() {
  useEffect(() => {
    try { init(); } catch {}
    const app = tg();
    try { app?.ready(); app?.expand(); } catch {}
    syncTheme();
    if (!app) return;
    const f = () => syncTheme();
    app.onEvent('themeChanged', f);
    return () => app.offEvent('themeChanged', f);
  }, []);
}
function plain(html = '') { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }
function clean(html = '') {
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll('script,style').forEach(n => n.remove());
  d.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => a.name.toLowerCase().startsWith('on') && n.removeAttribute(a.name)));
  return d.innerHTML;
}
function dirFor(html = '') {
  const s = plain(html), rtl = /[\u0590-\u08ff\uFB1D-\uFDFD\uFE70-\uFEFC]/, ltr = /[A-Za-z\u00C0-\u02AF\u0370-\u058F\u0900-\u1FFF\u2C00-\uD7FF\uF900-\uFAFF]/;
  for (const ch of s) { if (rtl.test(ch)) return 'rtl'; if (ltr.test(ch)) return 'ltr'; }
  return 'ltr';
}
function normalizeBlocks(value) {
  if (!Array.isArray(value) || !value.length) return starter;
  return value.map(b => {
    if (!b || typeof b !== 'object') return makeBlock('paragraph');
    if (b.type === 'list') {
      const items = (b.items || ['']).map(x => typeof x === 'string' ? ({ text: x, checked: false }) : ({ text: x?.text || '', checked: !!x?.checked }));
      return { ...b, kind: b.kind || (b.ordered ? 'ordered' : 'bullet'), items, indent: b.indent || 0 };
    }
    if (b.type === 'details') return { ...b, summary: b.summary || 'Details block', content: b.content || b.text || '', open: b.open !== false, credit: undefined };
    if (b.type === 'expandable') return { ...b, credit: b.credit || '', label: b.label || 'More' };
    return { indent: 0, ...b };
  });
}
function loadDraft() { try { return normalizeBlocks(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { return starter; } }

function newBlock(type) {
  const x = {
    paragraph: {}, heading: { size: 2 }, quote: { credit: '' }, pullquote: { credit: '' },
    expandable: { label: 'More', credit: '' }, details: { summary: 'Details block', content: '', open: true },
    pre: { language: '' }, footer: {}, list: { kind: 'bullet', items: [{ text: '', checked: false }] },
    table: { bordered: true, striped: false, compact: false, caption: '', rows: [[{ text: '', header: true }, { text: '', header: true }], [{ text: '', header: false }, { text: '', header: false }]] },
    buttons: { align: 'left', buttons: [{ text: 'Button', style: 'primary', action: 'url', value: '' }] },
    photo: { source: '', caption: '' }, video: { source: '', caption: '' }, map: { latitude: '', longitude: '', zoom: 14 },
    math: { expression: '' }, anchor: { name: '' }, divider: {}
  }[type] || {};
  return makeBlock(type, x);
}

function toInputRichMessage(blocks) {
  return { blocks: blocks.map(b => {
    const text = clean(b.text);
    if (b.type === 'paragraph') return { type: 'paragraph', text };
    if (b.type === 'heading') return { type: 'heading', size: b.size, text };
    if (b.type === 'pre') return { type: 'pre', language: b.language || undefined, text: plain(b.text) };
    if (b.type === 'quote') return { type: 'blockquote', blocks: [{ type: 'paragraph', text }], credit: clean(b.credit) || undefined };
    if (b.type === 'pullquote') return { type: 'pullquote', text, credit: clean(b.credit) || undefined };
    if (b.type === 'expandable') return { type: 'expandable_blockquote', text, credit: clean(b.credit) || undefined };
    if (b.type === 'details') return { type: 'details', summary: clean(b.summary || ''), blocks: [{ type: 'paragraph', text: clean(b.content || '') }], is_open: !!b.open };
    if (b.type === 'footer') return { type: 'footer', text };
    if (b.type === 'divider') return { type: 'divider' };
    if (b.type === 'math') return { type: 'mathematical_expression', expression: b.expression || '' };
    if (b.type === 'anchor') return { type: 'anchor', name: b.name || '' };
    if (b.type === 'list') return { type: 'list', items: b.items.map(x => ({ blocks: [{ type: 'paragraph', text: clean(x.text) }], ...(b.kind === 'task' ? { has_checkbox: true, is_checked: !!x.checked } : {}) })) };
    if (b.type === 'table') return { type: 'table', is_bordered: b.bordered || undefined, is_striped: b.striped || undefined, is_compact: b.compact || undefined, caption: clean(b.caption) || undefined, cells: b.rows.map(r => r.map(c => ({ text: clean(c.text), is_header: c.header || undefined, colspan: c.colspan > 1 ? c.colspan : undefined, rowspan: c.rowspan > 1 ? c.rowspan : undefined, align: c.align !== 'left' ? c.align : undefined, valign: c.valign !== 'top' ? c.valign : undefined }))) };
    if (b.type === 'buttons') return { type: 'buttons', align: b.align, buttons: b.buttons.map(x => ({ text: x.text, style: x.style, ...(x.action === 'url' ? { url: x.value } : x.action === 'web_app' ? { web_app: { url: x.value } } : { callback_data: x.value }) })) };
    if (b.type === 'photo') return { type: 'photo', photo: b.source, caption: b.caption ? { text: clean(b.caption) } : undefined };
    if (b.type === 'video') return { type: 'video', video: b.source, caption: b.caption ? { text: clean(b.caption) } : undefined };
    if (b.type === 'map') return { type: 'map', location: { latitude: Number(b.latitude) || 0, longitude: Number(b.longitude) || 0 }, zoom: Number(b.zoom) || 14 };
    return { type: 'paragraph', text: '' };
  }) };
}

function transformBlock(b, type) {
  if (type === 'paragraph') {
    if (b.type === 'list') return { ...b, type: 'paragraph', text: b.items.map(x => x.text).join('<br>') };
    if (b.type === 'details') return { ...b, type: 'paragraph', text: b.content || b.summary || '' };
    return { ...b, type: 'paragraph' };
  }
  if (type === 'list') return b.type === 'list' ? b : { ...b, type: 'list', kind: 'bullet', items: [{ text: b.text || '', checked: false }] };
  if (type.startsWith('heading:')) return { ...b, type: 'heading', size: Number(type.split(':')[1]) || 2 };
  if (['quote', 'pullquote', 'expandable'].includes(type)) return { ...b, type, credit: b.credit || '', ...(type === 'expandable' ? { label: b.label || 'More' } : {}) };
  if (type === 'details') return { ...b, type: 'details', summary: b.summary || 'Details block', content: b.text || b.content || '', open: true, credit: undefined };
  if (type === 'heading') return { ...b, type: 'heading', size: b.size || 2 };
  if (['pre', 'footer'].includes(type)) return { ...b, type };
  return { ...newBlock(type), id: b.id, text: b.text || '' };
}

export default function App() {
  useTelegram();
  const [blocks, setBlocks] = useState(loadDraft);
  const [selected, setSelected] = useState(() => blocks[0]?.id || null);
  const [history, setHistory] = useState([]), [future, setFuture] = useState([]);
  const [sheet, setSheet] = useState(false), [listMenu, setListMenu] = useState(false), [more, setMore] = useState(false), [preview, setPreview] = useState(false), [notice, setNotice] = useState('');
  const current = blocks.find(b => b.id === selected) || blocks[0];
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks)), [blocks]);
  const toast = m => { setNotice(m); clearTimeout(window.__rmt); window.__rmt = setTimeout(() => setNotice(''), 1600); };
  const commit = next => { setHistory(h => [...h.slice(-39), blocks]); setFuture([]); setBlocks(next); };
  const update = (id, patch, save = false) => save ? commit(blocks.map(b => b.id === id ? { ...b, ...patch } : b)) : setBlocks(all => all.map(b => b.id === id ? { ...b, ...patch } : b));
  const add = type => { const n = newBlock(type), i = Math.max(0, blocks.findIndex(b => b.id === selected)); commit([...blocks.slice(0, i + 1), n, ...blocks.slice(i + 1)]); setSelected(n.id); setSheet(false); setTimeout(() => document.getElementById(`editor-${n.id}`)?.focus(), 40); };
  const remove = id => { if (blocks.length === 1) { commit([newBlock('paragraph')]); setSelected(null); return; } const i = blocks.findIndex(b => b.id === id), next = blocks.filter(b => b.id !== id); commit(next); setSelected(next[Math.max(0, i - 1)]?.id || next[0]?.id); };
  const move = (id, d) => { const i = blocks.findIndex(b => b.id === id), j = i + d; if (i < 0 || j < 0 || j >= blocks.length) return; const n = [...blocks]; [n[i], n[j]] = [n[j], n[i]]; commit(n); };
  const transform = type => current && commit(blocks.map(b => b.id === current.id ? transformBlock(b, type) : b));
  const setListKind = kind => { if (!current) return; if (kind === 'none') { transform('paragraph'); setListMenu(false); return; } if (kind === 'toggle') { commit(blocks.map(b => b.id === current.id ? { ...transformBlock(b, 'details'), summary: b.type === 'list' ? (b.items[0]?.text || 'Toggle block') : 'Toggle block', content: b.type === 'list' ? b.items.map(x => x.text).join('<br>') : b.text || '', open: true } : b)); setListMenu(false); return; } if (current.type !== 'list') { commit(blocks.map(b => b.id === current.id ? { ...b, type: 'list', kind, items: [{ text: b.text || '', checked: false }] } : b)); } else commit(blocks.map(b => b.id === current.id ? { ...b, kind } : b)); setListMenu(false); };
  const indent = () => current && commit(blocks.map(b => b.id === current.id ? { ...b, indent: Math.min(4, (b.indent || 0) + 1) } : b));
  const undo = () => { const p = history.at(-1); if (!p) return; setFuture(f => [blocks, ...f]); setHistory(h => h.slice(0, -1)); setBlocks(p); };
  const redo = () => { const n = future[0]; if (!n) return; setHistory(h => [...h, blocks]); setFuture(f => f.slice(1)); setBlocks(n); };
  const copy = async () => { await navigator.clipboard?.writeText(JSON.stringify({ type: 'rich_message', ...toInputRichMessage(blocks) }, null, 2)); toast('Rich Message JSON copied'); };
  const copyHtml = async () => { await navigator.clipboard?.writeText(blocks.map(blockHtml).join('\n')); toast('HTML copied'); };
  const reset = () => { commit([newBlock('paragraph')]); setSelected(null); setMore(false); toast('Draft reset'); };

  return <div className="app-shell">
    <header className="native-topbar"><button className="nav-icon" onClick={() => toast('Back')}><ArrowLeft/></button><div className="top-spacer"/><div className="top-actions"><button className="nav-icon" disabled={!history.length} onClick={undo}><Undo2/></button><button className="nav-icon" disabled={!future.length} onClick={redo}><Redo2/></button><button className="nav-icon" onClick={() => setMore(!more)}><MoreHorizontal/></button></div></header>
    {more && <div className="more-menu"><button onClick={copy}><Braces/> Copy Rich Message JSON</button><button onClick={copyHtml}><FileCode2/> Copy HTML</button><button onClick={() => setPreview(true)}><Eye/> Preview</button><button onClick={reset}><Trash2/> Reset draft</button></div>}
    {preview ? <main className="preview-page"><div className="preview-head"><button onClick={() => setPreview(false)}><ArrowLeft/> Edit</button><strong>Preview</strong></div><TelegramPreview blocks={blocks}/></main> : <main className="editor-page"><div className="blocks">{blocks.map(b => <EditorBlock key={b.id} block={b} selected={b.id === selected} onSelect={() => setSelected(b.id)} onUpdate={p => update(b.id, p)} onRemove={() => remove(b.id)} onMove={d => move(b.id, d)}/>)}</div><button className="add-inline" onClick={() => setSheet(true)}><Plus/> Add block</button></main>}
    {!preview && current && <FormattingBar block={current} onTransform={transform} onOpenAdd={() => setSheet(true)} onList={() => setListMenu(v => !v)} listOpen={listMenu}/>} 
    {!preview && listMenu && <ListStyleMenu onPick={setListKind} onIndent={indent} current={current}/>} 
    <footer className="bottom-bar"><button className="tool-ghost" onClick={() => toast('AI tools coming next')}><span className="ai-mark">✦</span></button><button className="tool-ghost" onClick={() => toast('Emoji picker')}><span className="emoji-mark">☺</span></button><button className="tool-active" onClick={() => setSheet(true)}>Aa</button><button className="tool-ghost" onClick={() => setListMenu(v => !v)}><List/></button><button className="tool-ghost" onClick={() => add('table')}><Table2/></button><button className="tool-ghost" onClick={() => add('math')}><span className="sigma">Σ</span></button><button className="tool-ghost" onClick={() => add('photo')}><Paperclip/></button><button className="send-button" onClick={() => toast('Ready for sendRichMessage')}><Send/></button></footer>
    {sheet && <BlockSheet onPick={add} onClose={() => setSheet(false)}/>} {notice && <div className="toast"><Check/>{notice}</div>}
  </div>;
}

function IconButton({ children, onClick, disabled, active }) { return <button className={`nav-icon ${active ? 'active' : ''}`} disabled={disabled} onClick={onClick}>{children}</button>; }
function BlockControls({ onRemove, onMove }) { return <div className="block-controls"><button onClick={e => { e.stopPropagation(); onMove(-1); }}>↑</button><button onClick={e => { e.stopPropagation(); onMove(1); }}>↓</button><button className="delete" onClick={e => { e.stopPropagation(); onRemove(); }}><Trash2/></button></div>; }

function EditableText({ id, html, placeholder, onChange, className = '', onFocus }) {
  const ref = useRef(null), last = useRef(html || ''), [dir, setDir] = useState(dirFor(html));
  useEffect(() => { const d = dirFor(html); setDir(d); if (ref.current && last.current !== html && document.activeElement !== ref.current) { ref.current.innerHTML = html || ''; last.current = html || ''; } }, [html]);
  return <div id={`editor-${id}`} ref={ref} className={`editable-text ${className}`} contentEditable suppressContentEditableWarning spellCheck dir={dir} data-placeholder={placeholder} onFocus={onFocus} onInput={e => { const value = e.currentTarget.innerHTML; last.current = value; setDir(dirFor(value)); onChange(value); }}/>
}
function EditorBlock({ block: b, selected, onSelect, onUpdate, onRemove, onMove }) {
  return <section className={`editor-block type-${b.type} ${selected ? 'selected' : ''}`} style={{ paddingLeft: b.indent ? `${b.indent * 24}px` : undefined }} onClick={onSelect}>{selected && <BlockControls onRemove={onRemove} onMove={onMove}/>} 
    {b.type === 'paragraph' && <EditableText id={b.id} html={b.text} placeholder="Write something" onChange={text => onUpdate({ text })}/>} 
    {b.type === 'heading' && <HeadingBlock block={b} onUpdate={onUpdate}/>} {b.type === 'quote' && <QuoteBlock block={b} onUpdate={onUpdate}/>} {b.type === 'pullquote' && <PullQuote block={b} onUpdate={onUpdate}/>} {b.type === 'expandable' && <Expandable block={b} onUpdate={onUpdate}/>} {b.type === 'details' && <DetailsBlock block={b} onUpdate={onUpdate}/>} {b.type === 'pre' && <PreBlock block={b} onUpdate={onUpdate}/>} {b.type === 'footer' && <EditableText id={b.id} html={b.text} placeholder="Footer" onChange={text => onUpdate({ text })}/>} {b.type === 'list' && <ListEditor block={b} onUpdate={onUpdate}/>} {b.type === 'table' && <TableEditor block={b} onUpdate={onUpdate}/>} {b.type === 'buttons' && <ButtonsEditor block={b} onUpdate={onUpdate}/>} {b.type === 'photo' && <MediaEditor block={b} kind="photo" onUpdate={onUpdate}/>} {b.type === 'video' && <MediaEditor block={b} kind="video" onUpdate={onUpdate}/>} {b.type === 'map' && <MapEditor block={b} onUpdate={onUpdate}/>} {b.type === 'math' && <MathEditor block={b} onUpdate={onUpdate}/>} {b.type === 'anchor' && <div className="simple-block"><label>Anchor name</label><input value={b.name} onChange={e => onUpdate({ name: e.target.value })} placeholder="section-name"/></div>} {b.type === 'divider' && <hr className="divider-block"/>}
  </section>;
}
function HeadingBlock({ block: b, onUpdate }) { return <div className="heading-block"><EditableText id={b.id} html={b.text} className={`heading-text h${b.size}`} placeholder="Heading" onChange={text => onUpdate({ text })}/></div>; }
function Credit({ value, onChange }) { return <input className="credit-input" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Add author / credit"/>; }
function QuoteBlock({ block: b, onUpdate }) { return <div className="quote-editor"><div className="quote-line"/><div className="quote-body"><EditableText id={b.id} html={b.text} placeholder="Write a quotation" onChange={text => onUpdate({ text })}/><Credit value={b.credit} onChange={credit => onUpdate({ credit })}/></div></div>; }
function PullQuote({ block: b, onUpdate }) { return <div className="pullquote-editor"><EditableText id={b.id} html={b.text} placeholder="Write a pull quote" onChange={text => onUpdate({ text })}/><Credit value={b.credit} onChange={credit => onUpdate({ credit })}/></div>; }
function Expandable({ block: b, onUpdate }) { return <div className="expandable-editor"><div className="expandable-head"><ChevronDown/><input value={b.label} onChange={e => onUpdate({ label: e.target.value })}/></div><EditableText id={b.id} html={b.text} placeholder="Expandable quotation" onChange={text => onUpdate({ text })}/><Credit value={b.credit} onChange={credit => onUpdate({ credit })}/></div>; }
function DetailsBlock({ block: b, onUpdate }) { return <div className={`details-editor ${b.open ? 'open' : 'closed'}`}><button className="details-head" onClick={e => { e.stopPropagation(); onUpdate({ open: !b.open }); }}><span className="details-chevron">{b.open ? <ChevronDown/> : <ChevronRight/>}</span><input value={b.summary} onChange={e => onUpdate({ summary: e.target.value })} onClick={e => e.stopPropagation()} placeholder="Summary"/></button>{b.open && <div className="details-content"><EditableText id={b.id} html={b.content} placeholder="Details content" onChange={content => onUpdate({ content })}/><div className="details-note">Details support rich content. No credit field — credits belong to quote blocks.</div></div>}</div>; }
function PreBlock({ block: b, onUpdate }) { return <div className="pre-editor"><div className="pre-head"><Code2/><select value={b.language} onChange={e => onUpdate({ language: e.target.value })}><option value="">Plain text</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="json">JSON</option><option value="bash">Bash</option></select></div><EditableText id={b.id} html={b.text} className="code-text" placeholder="Code" onChange={text => onUpdate({ text })}/></div>; }
function ListEditor({ block: b, onUpdate }) { const set = (i, patch) => onUpdate({ items: b.items.map((x, j) => i === j ? { ...x, ...patch } : x) }); const ordered = b.kind === 'ordered'; const task = b.kind === 'task'; return <div className={`list-editor ${b.kind}`}><div className="list-head"><strong>{ordered ? 'Numbered list' : task ? 'Checklist' : 'Bulleted list'}</strong></div>{b.items.map((x, i) => <div className="list-item" key={i}>{task ? <button className={`check-box ${x.checked ? 'checked' : ''}`} onClick={() => set(i, { checked: !x.checked })}>{x.checked && <Check/>}</button> : <span className="list-marker">{ordered ? `${i + 1}.` : '•'}</span>}<EditableText id={`${b.id}-${i}`} html={x.text} placeholder="List item" onChange={text => set(i, { text })}/></div>)}<button className="add-item" onClick={() => onUpdate({ items: [...b.items, { text: '', checked: false }] })}><Plus/> Add item</button></div>; }
function TableEditor({ block: b, onUpdate }) { const cell = (r, c, p) => onUpdate({ rows: b.rows.map((row, ri) => row.map((x, ci) => ri === r && ci === c ? { ...x, ...p } : x)) }); const addRow = () => onUpdate({ rows: [...b.rows, Array.from({ length: b.rows[0]?.length || 2 }, () => ({ text: '', header: false }))] }); const addCol = () => onUpdate({ rows: b.rows.map(r => [...r, { text: '', header: false }]) }); return <div className="table-editor"><div className="table-head"><strong>Table</strong><div><button onClick={addRow}><Plus/> Row</button><button onClick={addCol}><Plus/> Col</button></div></div><div className="table-scroll"><table><tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className={c.header ? 'is-header' : ''}><EditableText id={`${b.id}-${ri}-${ci}`} html={c.text} placeholder="Cell" onChange={text => cell(ri, ci, { text })}/><button className="cell-head" onClick={() => cell(ri, ci, { header: !c.header })}><Heading1/></button></td>)}</tr>)}</tbody></table></div><input className="caption-input" value={b.caption} onChange={e => onUpdate({ caption: e.target.value })} placeholder="Table caption"/><div className="table-options"><Toggle label="Borders" checked={b.bordered} onChange={bordered => onUpdate({ bordered })}/><Toggle label="Striped" checked={b.striped} onChange={striped => onUpdate({ striped })}/><Toggle label="Compact" checked={b.compact} onChange={compact => onUpdate({ compact })}/></div></div>; }
function Toggle({ label, checked, onChange }) { return <button className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span>{label}</span><i/></button>; }
function ButtonsEditor({ block: b, onUpdate }) { const set = (i, p) => onUpdate({ buttons: b.buttons.map((x, j) => i === j ? { ...x, ...p } : x) }); return <div className="buttons-editor"><div className="buttons-head"><strong>Buttons</strong><div><button className={b.align === 'left' ? 'selected' : ''} onClick={() => onUpdate({ align: 'left' })}><AlignLeft/></button><button className={b.align === 'center' ? 'selected' : ''} onClick={() => onUpdate({ align: 'center' })}><AlignCenter/></button><button className={b.align === 'right' ? 'selected' : ''} onClick={() => onUpdate({ align: 'right' })}><AlignRight/></button></div></div><div className={`button-builder-preview ${b.align}`}>{b.buttons.map((x, i) => <button key={i} className={`preview-button ${x.style}`} onClick={e => e.preventDefault()}>{x.text || 'Button'}</button>)}</div>{b.buttons.map((x, i) => <div className="button-builder" key={i}><input value={x.text} onChange={e => set(i, { text: e.target.value })} placeholder="Text"/><select value={x.style} onChange={e => set(i, { style: e.target.value })}><option value="primary">Primary</option><option value="success">Success</option><option value="danger">Danger</option><option value="link">Link</option></select><select value={x.action} onChange={e => set(i, { action: e.target.value })}><option value="url">URL</option><option value="callback">Callback</option><option value="web_app">Web App</option></select><input value={x.value} onChange={e => set(i, { value: e.target.value })} placeholder="Value"/></div>)}<button className="add-item" disabled={b.buttons.length >= 8} onClick={() => onUpdate({ buttons: [...b.buttons, { text: 'Button', style: 'primary', action: 'url', value: '' }] })}><Plus/> Add button</button></div>; }
function MediaEditor({ block: b, kind, onUpdate }) { const Icon = kind === 'photo' ? ImagePlus : Video; return <div className="media-editor"><div className="media-icon"><Icon/></div><div className="media-fields"><strong>{kind === 'photo' ? 'Photo' : 'Video'}</strong><input value={b.source} onChange={e => onUpdate({ source: e.target.value })} placeholder="Telegram file ID or HTTPS URL"/><input value={b.caption} onChange={e => onUpdate({ caption: e.target.value })} placeholder="Caption (optional)"/></div></div>; }
function MapEditor({ block: b, onUpdate }) { const locate = () => navigator.geolocation?.getCurrentPosition(p => onUpdate({ latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })); return <div className="map-editor"><div className="map-icon"><MapPin/></div><div><strong>Map location</strong><div className="map-fields"><input value={b.latitude} onChange={e => onUpdate({ latitude: e.target.value })} placeholder="Latitude"/><input value={b.longitude} onChange={e => onUpdate({ longitude: e.target.value })} placeholder="Longitude"/></div><button onClick={locate}><MapPin/> Use location</button></div></div>; }
function MathEditor({ block: b, onUpdate }) { return <div className="math-editor"><div className="math-symbol">∑</div><div><strong>Formula</strong><input value={b.expression} onChange={e => onUpdate({ expression: e.target.value })} placeholder="LaTeX expression"/></div></div>; }

function FormattingBar({ block: b, onTransform, onOpenAdd, onList, listOpen }) {
  const [state, setState] = useState({ bold: false, italic: false, underline: false, strike: false });
  const saved = useRef(null);
  useEffect(() => { const f = () => setState({ bold: document.queryCommandState?.('bold') || false, italic: document.queryCommandState?.('italic') || false, underline: document.queryCommandState?.('underline') || false, strike: document.queryCommandState?.('strikeThrough') || false }); document.addEventListener('selectionchange', f); f(); return () => document.removeEventListener('selectionchange', f); }, []);
  const save = e => { e.preventDefault(); const s = window.getSelection(); if (s && s.rangeCount) saved.current = s.getRangeAt(0).cloneRange(); };
  const restore = () => { if (!saved.current) return; const s = window.getSelection(); s.removeAllRanges(); s.addRange(saved.current); };
  const exec = cmd => { restore(); document.execCommand(cmd, false); setTimeout(() => window.getSelection()?.anchorNode?.parentElement?.focus?.(), 0); };
  const removeFormatting = () => { restore(); document.execCommand('removeFormat', false); document.execCommand('unlink', false); };
  const link = e => { save(e); const u = window.prompt('Enter URL'); if (u) { restore(); document.execCommand('createLink', false, u); } };
  const active = v => v ? 'active' : '';
  return <div className="formatting-wrap"><div className="formatting-bar"><button onMouseDown={save} onClick={() => exec('bold')} className={active(state.bold)}><Bold/></button><button onMouseDown={save} onClick={() => exec('italic')} className={active(state.italic)}><Italic/></button><button onMouseDown={save} onClick={() => exec('underline')} className={active(state.underline)}><Underline/></button><button onMouseDown={save} onClick={() => exec('strikeThrough')} className={active(state.strike)}><Strikethrough/></button><button onMouseDown={save} onClick={link}><Link2/></button><button onMouseDown={save} onClick={removeFormatting}><span className="clear-format">Tx</span></button><span className="format-divider"/><button onMouseDown={e => e.preventDefault()} onClick={onList} className={listOpen ? 'active' : ''}><List/></button><button onMouseDown={e => e.preventDefault()} onClick={() => onTransform('quote')}><Quote/></button><button onMouseDown={e => e.preventDefault()} onClick={onOpenAdd}><Plus/></button></div><div className="format-select"><select value={b.type === 'heading' ? `heading:${b.size}` : b.type === 'paragraph' ? 'paragraph' : b.type} onChange={e => onTransform(e.target.value)}><option value="paragraph">Normal text</option>{[1,2,3,4,5,6].map(n => <option key={n} value={`heading:${n}`}>Heading {n}</option>)}<option value="quote">Block quote</option><option value="pullquote">Pull quote</option><option value="expandable">Expandable quote</option><option value="details">Details</option><option value="pre">Code</option><option value="list">List</option></select><ChevronDown/></div></div>;
}
function ListStyleMenu({ onPick, onIndent, current }) { const kind = current?.type === 'list' ? current.kind : 'none'; return <div className="list-style-menu"><button className={kind === 'none' ? 'chosen' : ''} onClick={() => onPick('none')}><span>None</span>{kind === 'none' && <Check/>}</button><button className={kind === 'bullet' ? 'chosen' : ''} onClick={() => onPick('bullet')}><List/><span>Bulleted list</span></button><button className={kind === 'ordered' ? 'chosen' : ''} onClick={() => onPick('ordered')}><ListOrdered/><span>Numbered list</span></button><button className={kind === 'task' ? 'chosen' : ''} onClick={() => onPick('task')}><CheckSquare/><span>Checklist</span></button><button className={current?.type === 'details' ? 'chosen' : ''} onClick={() => onPick('toggle')}><ChevronDown/><span>Toggle block</span></button><div className="menu-separator"/><button onClick={onIndent}><span className="indent-icon">→|</span><span>Indent</span></button></div>; }
function BlockSheet({ onPick, onClose }) { const groups = [{ title: 'Text', items: [['paragraph','Normal text',FileText],['heading','Heading',Heading1],['quote','Block quote',Quote],['pullquote','Pull quote',Quote],['expandable','Expandable quote',ChevronDown],['details','Toggle / Details',ChevronDown],['pre','Code',Code2],['footer','Footer',FileText],['divider','Divider',Minus]] }, { title: 'Content', items: [['list','List',List],['table','Table',Table2],['buttons','Buttons',Plus],['math','Formula',Braces],['anchor','Anchor',Link2]] }, { title: 'Media', items: [['photo','Photo',ImagePlus],['video','Video',Video],['map','Map',MapPin]] }]; return <div className="sheet-layer"><div className="sheet-dim" onClick={onClose}/><div className="block-sheet"><div className="sheet-handle"/><div className="sheet-title"><strong>Insert block</strong><button onClick={onClose}><X/></button></div>{groups.map(g => <div className="sheet-group" key={g.title}><span>{g.title}</span><div className="sheet-grid">{g.items.map(([type,label,Icon]) => <button key={type} onClick={() => onPick(type)}><Icon/><span>{label}</span></button>)}</div></div>)}</div></div>; }

function blockHtml(b) { const t = clean(b.text), c = b.credit ? `<cite>${clean(b.credit)}</cite>` : ''; if (b.type === 'paragraph') return `<p>${t}</p>`; if (b.type === 'heading') return `<h${b.size}>${t}</h${b.size}>`; if (b.type === 'quote') return `<blockquote>${t}${c}</blockquote>`; if (b.type === 'pullquote') return `<aside>${t}${c}</aside>`; if (b.type === 'expandable') return `<blockquote expandable>${t}${c}</blockquote>`; if (b.type === 'details') return `<details${b.open ? ' open' : ''}><summary>${clean(b.summary)}</summary>${b.content || ''}</details>`; if (b.type === 'pre') return `<pre><code>${plain(b.text)}</code></pre>`; if (b.type === 'footer') return `<footer>${t}</footer>`; if (b.type === 'divider') return '<hr/>'; if (b.type === 'list') return `<${b.kind === 'ordered' ? 'ol' : 'ul'}>${b.items.map(x => `<li>${clean(x.text)}</li>`).join('')}</${b.kind === 'ordered' ? 'ol' : 'ul'}>`; if (b.type === 'table') return `<table>${b.rows.map(r => `<tr>${r.map(x => `<${x.header ? 'th' : 'td'}>${clean(x.text)}</${x.header ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`; if (b.type === 'buttons') return `<tg-button-row align="${b.align}">${b.buttons.map(x => `<tg-button type="${x.action === 'url' ? 'url' : x.action}" style="${x.style}">${clean(x.text)}</tg-button>`).join('')}</tg-button-row>`; return ''; }
function TelegramPreview({ blocks }) { return <div className="telegram-preview"><div className="fake-bubble">{blocks.map(b => <PreviewBlock key={b.id} block={b}/>)}</div><span className="fake-time">now ✓</span></div>; }
function PreviewBlock({ block: b }) { const d = dirFor(b.text); if (b.type === 'paragraph') return <div className="pv-paragraph" dir={d} dangerouslySetInnerHTML={{ __html: clean(b.text) }}/>; if (b.type === 'heading') return <div className={`pv-heading h${b.size}`} dir={d} dangerouslySetInnerHTML={{ __html: clean(b.text) }}/>; if (b.type === 'quote') return <div className="pv-quote" dir={d}><div dangerouslySetInnerHTML={{ __html: clean(b.text) }}/>{b.credit && <cite>{b.credit}</cite>}</div>; if (b.type === 'pullquote') return <div className="pv-quote pullquote" dir={d}><div dangerouslySetInnerHTML={{ __html: clean(b.text) }}/>{b.credit && <cite>{b.credit}</cite>}</div>; if (b.type === 'expandable') return <details className="pv-details"><summary>{b.label || 'More'}</summary><div dangerouslySetInnerHTML={{ __html: clean(b.text) }}/>{b.credit && <cite>{b.credit}</cite>}</details>; if (b.type === 'details') return <details className="pv-details" open={b.open}><summary>{b.summary}</summary><div dangerouslySetInnerHTML={{ __html: clean(b.content) }}/></details>; if (b.type === 'pre') return <pre className="pv-pre">{plain(b.text)}</pre>; if (b.type === 'footer') return <div className="pv-footer" dangerouslySetInnerHTML={{ __html: clean(b.text) }}/>; if (b.type === 'divider') return <hr/>; if (b.type === 'list') { const ordered = b.kind === 'ordered'; return ordered ? <ol className="pv-list">{b.items.map((x,i) => <li key={i} dangerouslySetInnerHTML={{ __html: clean(x.text) }}/>)}</ol> : <ul className="pv-list">{b.items.map((x,i) => <li key={i} className={b.kind === 'task' && x.checked ? 'checked' : ''}>{b.kind === 'task' && <span className="pv-check">{x.checked ? '✓' : ''}</span>}<span dangerouslySetInnerHTML={{ __html: clean(x.text) }}/></li>)}</ul>; } if (b.type === 'table') return <table className="pv-table"><tbody>{b.rows.map((r,i) => <tr key={i}>{r.map((x,j) => <td className={x.header ? 'header' : ''} key={j}>{plain(x.text)}</td>)}</tr>)}</tbody></table>; if (b.type === 'buttons') return <div className={`pv-buttons ${b.align}`}>{b.buttons.map((x,i) => <span className={`pv-button ${x.style}`} key={i}>{x.text}</span>)}</div>; if (b.type === 'photo' || b.type === 'video') return <div className="pv-media">{b.type === 'photo' ? <ImagePlus/> : <Video/>}<span>{b.source || 'Media'}</span></div>; if (b.type === 'map') return <div className="pv-map"><MapPin/>{b.latitude && b.longitude ? `${b.latitude}, ${b.longitude}` : 'Map location'}</div>; if (b.type === 'math') return <div className="pv-math">{b.expression || 'Formula'}</div>; return null; }
