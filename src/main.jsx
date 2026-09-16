import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDown, ArrowUp, Bold, Check, ChevronLeft, ChevronRight, Code2, Copy,
  Eye, FileText, Image as ImageIcon, Italic, Link2, List, MapPin, Menu,
  Minus, MoreHorizontal, Plus, Quote, Send, Settings2, Table2, Trash2,
  Underline, Video, WandSparkles, X, Zap
} from 'lucide-react';
import './styles.css';

const uid = () => `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const blockCatalog = [
  ['paragraph', 'Text', FileText], ['heading', 'Heading', Zap], ['pre', 'Code', Code2],
  ['quote', 'Quote', Quote], ['list', 'List', List], ['table', 'Table', Table2],
  ['buttons', 'Buttons', Plus], ['photo', 'Photo', ImageIcon], ['video', 'Video', Video],
  ['map', 'Map', MapPin], ['divider', 'Divider', Minus], ['footer', 'Footer', FileText]
];

function makeBlock(type) {
  const id = uid();
  const base = { id, type };
  switch (type) {
    case 'heading': return { ...base, size: 2, text: 'New heading' };
    case 'paragraph': return { ...base, text: 'Write something here…' };
    case 'pre': return { ...base, text: 'const message = "Hello Telegram";', language: 'javascript' };
    case 'quote': return { ...base, text: 'A block quotation' };
    case 'list': return { ...base, ordered: false, items: ['First item', 'Second item'] };
    case 'table': return { ...base, bordered: true, striped: false, compact: false, caption: '', rows: [['Feature', 'Value'], ['Rich text', 'Ready'], ['Tables', 'Ready']] };
    case 'buttons': return { ...base, align: 'left', buttons: [{ text: 'Open', style: 'primary', action: 'url', value: 'https://t.me/' }] };
    case 'photo': return { ...base, source: '', caption: '' };
    case 'video': return { ...base, source: '', caption: '' };
    case 'map': return { ...base, latitude: 19.9975, longitude: 73.7898, zoom: 12, width: 600, height: 320 };
    case 'divider': return base;
    case 'footer': return { ...base, text: 'Footer text' };
    default: return { ...base, text: '' };
  }
}

const initialDocument = [
  { id: 'welcome', type: 'heading', size: 1, text: 'Rich Message Studio' },
  { id: 'intro', type: 'paragraph', text: 'Create Telegram Rich Messages visually. Add blocks, format text, build tables and buttons, then preview the exact document structure.' },
  { id: 'actions', type: 'buttons', align: 'left', buttons: [{ text: 'Open Telegram', style: 'primary', action: 'url', value: 'https://t.me/' }] }
];

function tg() { return window.Telegram?.WebApp; }

function App() {
  const [blocks, setBlocks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rms-draft')) || initialDocument; } catch { return initialDocument; }
  });
  const [selectedId, setSelectedId] = useState(blocks[0]?.id);
  const [panel, setPanel] = useState('editor');
  const [showPreview, setShowPreview] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const app = tg();
    if (app) {
      app.ready();
      app.expand();
      app.setHeaderColor?.('#ffffff');
      app.setBackgroundColor?.('#f5f7fb');
      app.enableClosingConfirmation?.();
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('rms-draft', JSON.stringify(blocks));
  }, [blocks]);

  const selected = useMemo(() => blocks.find(b => b.id === selectedId) || blocks[0], [blocks, selectedId]);

  function update(id, patch) { setBlocks(cur => cur.map(b => b.id === id ? { ...b, ...patch } : b)); }
  function add(type) {
    const block = makeBlock(type);
    setBlocks(cur => [...cur, block]);
    setSelectedId(block.id);
    setShowAdd(false);
    setPanel('editor');
  }
  function remove(id) {
    setBlocks(cur => cur.filter(b => b.id !== id));
    const next = blocks.findIndex(b => b.id === id);
    setSelectedId(blocks[next + 1]?.id || blocks[next - 1]?.id || undefined);
  }
  function duplicate(id) {
    const index = blocks.findIndex(b => b.id === id);
    const copy = JSON.parse(JSON.stringify(blocks[index]));
    copy.id = uid();
    setBlocks(cur => [...cur.slice(0, index + 1), copy, ...cur.slice(index + 1)]);
    setSelectedId(copy.id);
  }
  function move(id, delta) {
    setBlocks(cur => {
      const index = cur.findIndex(b => b.id === id); const target = index + delta;
      if (index < 0 || target < 0 || target >= cur.length) return cur;
      const next = [...cur]; [next[index], next[target]] = [next[target], next[index]]; return next;
    });
  }
  function save() {
    localStorage.setItem('rms-draft', JSON.stringify(blocks));
    setNotice('Draft saved on this device');
    setTimeout(() => setNotice(''), 1800);
  }
  function exportJson() {
    navigator.clipboard?.writeText(JSON.stringify({ type: 'rich_document', version: 1, blocks }, null, 2));
    setNotice('RDM copied to clipboard'); setTimeout(() => setNotice(''), 1800);
  }

  return <div className="app">
    <header className="appbar">
      <div className="brand"><div className="brand-icon"><WandSparkles size={17}/></div><div><strong>Rich Studio</strong><small>Telegram Rich Messages</small></div></div>
      <div className="appbar-actions"><button className="app-icon" onClick={() => setPanel('settings')}><Settings2 size={18}/></button><button className="app-icon" onClick={() => setShowPreview(true)}><Eye size={18}/></button></div>
    </header>

    <main className="main">
      <section className="editor-section">
        <div className="page-title"><div><span className="kicker">COMPOSER</span><h1>Build your message</h1></div><span className="draft"><i/>Saved locally</span></div>
        <div className="canvas-card">
          <div className="document-head"><span>MESSAGE</span><button onClick={() => setShowAdd(true)}><Plus size={15}/> Add block</button></div>
          <div className="blocks">
            {blocks.length === 0 && <div className="empty"><WandSparkles size={25}/><strong>Your message is empty</strong><span>Add your first block below.</span><button onClick={() => setShowAdd(true)}>Add block</button></div>}
            {blocks.map((block, index) => <BlockCard key={block.id} block={block} index={index} selected={selectedId === block.id} onSelect={() => { setSelectedId(block.id); setPanel('editor'); }} onMove={move} onDuplicate={duplicate} onDelete={remove} />)}
          </div>
          <button className="add-full" onClick={() => setShowAdd(true)}><Plus size={17}/> Add block</button>
        </div>
      </section>

      <section className="inspector-section">
        {panel === 'settings' ? <SettingsPanel onExport={exportJson} onReset={() => { setBlocks(initialDocument); setSelectedId(initialDocument[0].id); setPanel('editor'); }} /> : <Inspector block={selected} update={update} onDelete={remove} />}
      </section>

      <section className="preview-section">
        <div className="section-bar"><div><span className="kicker">LIVE PREVIEW</span><h2>Telegram message</h2></div><button className="text-button" onClick={() => setShowPreview(true)}><Eye size={15}/> Full preview</button></div>
        <TelegramPreview blocks={blocks}/>
      </section>
    </main>

    <nav className="bottom-nav">
      <button className={panel === 'editor' ? 'active' : ''} onClick={() => setPanel('editor')}><Menu size={19}/><span>Edit</span></button>
      <button onClick={() => setShowPreview(true)}><Eye size={19}/><span>Preview</span></button>
      <button onClick={save}><Check size={19}/><span>Save</span></button>
      <button className="publish" onClick={() => setNotice('Publishing will be connected to your bot backend next')}><Send size={18}/><span>Publish</span></button>
    </nav>

    {showAdd && <AddSheet onClose={() => setShowAdd(false)} onAdd={add}/>} 
    {showPreview && <PreviewSheet blocks={blocks} onClose={() => setShowPreview(false)} onSave={save} onShare={() => setNotice('Inline sharing will use the bot inline flow')}/>} 
    {notice && <div className="toast"><Check size={15}/>{notice}</div>}
  </div>;
}

function BlockCard({ block, index, selected, onSelect, onMove, onDuplicate, onDelete }) {
  const summary = block.type === 'table' ? `${block.rows.length} rows · ${block.rows[0]?.length || 0} columns` : block.type === 'buttons' ? `${block.buttons.length} button${block.buttons.length === 1 ? '' : 's'}` : block.type === 'map' ? `${block.latitude}, ${block.longitude}` : block.text || (block.source ? block.source : 'Configure this block');
  return <div className={`block ${selected ? 'selected' : ''}`} onClick={onSelect}>
    <div className="block-number">{index + 1}</div><div className="block-content"><div className="block-label">{block.type.replace('_', ' ')}</div><div className="block-summary">{summary}</div></div>
    <div className="block-tools" onClick={e => e.stopPropagation()}><button disabled={index === 0} onClick={() => onMove(block.id, -1)}><ArrowUp size={14}/></button><button disabled={false} onClick={() => onMove(block.id, 1)}><ArrowDown size={14}/></button><button onClick={() => onDuplicate(block.id)}><Copy size={14}/></button><button className="danger-icon" onClick={() => onDelete(block.id)}><Trash2 size={14}/></button></div>
  </div>;
}

function Inspector({ block, update, onDelete }) {
  if (!block) return <div className="inspector-card empty-inspector"><Settings2 size={20}/><strong>Select a block</strong><span>Choose a block to edit its properties.</span></div>;
  return <div className="inspector-card"><div className="inspector-head"><div><span className="kicker">BLOCK SETTINGS</span><h3>{block.type.replace('_', ' ')}</h3></div><button onClick={() => onDelete(block.id)}><Trash2 size={16}/></button></div>{editorFor(block, update)}</div>;
}

function Field({ label, children, hint }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function TextEditor({ value, onChange, placeholder }) { return <div className="text-editor"><div className="format-toolbar"><button><Bold size={15}/></button><button><Italic size={15}/></button><button><Underline size={15}/></button><button><Link2 size={15}/></button></div><textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/></div>; }

function editorFor(b, update) {
  if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'quote' || b.type === 'footer') return <>
    <Field label="Content"><TextEditor value={b.text} onChange={text => update(b.id, { text })}/></Field>
    {b.type === 'heading' && <Field label="Heading size"><div className="segmented">{[1,2,3,4,5,6].map(n => <button className={b.size === n ? 'on' : ''} key={n} onClick={() => update(b.id, { size: n })}>H{n}</button>)}</div></Field>}
  </>;
  if (b.type === 'pre') return <><Field label="Code"><textarea className="large-input mono" value={b.text} onChange={e => update(b.id, { text: e.target.value })}/></Field><Field label="Language"><input value={b.language} onChange={e => update(b.id, { language: e.target.value })}/></Field></>;
  if (b.type === 'list') return <ListEditor block={b} update={update}/>;
  if (b.type === 'table') return <TableEditor block={b} update={update}/>;
  if (b.type === 'buttons') return <ButtonEditor block={b} update={update}/>;
  if (b.type === 'photo' || b.type === 'video') return <MediaEditor block={b} update={update}/>;
  if (b.type === 'map') return <MapEditor block={b} update={update}/>;
  return <div className="helper"><strong>Divider</strong><span>A visual separator between rich message blocks.</span></div>;
}

function ListEditor({ block, update }) { return <><Field label="List type"><div className="segmented"><button className={!block.ordered ? 'on' : ''} onClick={() => update(block.id,{ordered:false})}>Bulleted</button><button className={block.ordered ? 'on' : ''} onClick={() => update(block.id,{ordered:true})}>Numbered</button></div></Field><div className="items-editor">{block.items.map((item,i)=><div className="row-input" key={i}><input value={item} onChange={e => {const items=[...block.items];items[i]=e.target.value;update(block.id,{items})}}/><button onClick={()=>update(block.id,{items:block.items.filter((_,x)=>x!==i)})}><X size={14}/></button></div>)}<button className="outline-add" onClick={()=>update(block.id,{items:[...block.items,'New item']})}><Plus size={14}/> Add item</button></div></>; }

function TableEditor({ block, update }) { const rows=block.rows; const setRows=r=>update(block.id,{rows:r}); return <><div className="switch-row"><span>Header row</span><button className="switch on"><i/></button></div><div className="switch-row"><span>Bordered</span><button className={`switch ${block.bordered?'on':''}`} onClick={()=>update(block.id,{bordered:!block.bordered})}><i/></button></div><div className="switch-row"><span>Striped</span><button className={`switch ${block.striped?'on':''}`} onClick={()=>update(block.id,{striped:!block.striped})}><i/></button></div><div className="switch-row"><span>Compact</span><button className={`switch ${block.compact?'on':''}`} onClick={()=>update(block.id,{compact:!block.compact})}><i/></button></div><div className="table-editor">{rows.map((row,r)=><div className="table-edit-row" key={r}>{row.map((cell,c)=><input key={c} value={cell} onChange={e=>{const next=rows.map(x=>[...x]);next[r][c]=e.target.value;setRows(next)}}/>)}<button onClick={()=>setRows(rows.filter((_,x)=>x!==r))}><X size={13}/></button></div>)}</div><div className="table-actions"><button onClick={()=>setRows(rows.map(r=>[...r,'Cell']))}><Plus size={14}/> Column</button><button onClick={()=>setRows([...rows,rows[0].map(()=> 'Cell')])}><Plus size={14}/> Row</button></div></>; }

function ButtonEditor({ block, update }) { return <><Field label="Row alignment"><div className="segmented"><button className={block.align==='left'?'on':''} onClick={()=>update(block.id,{align:'left'})}>Left</button><button className={block.align==='center'?'on':''} onClick={()=>update(block.id,{align:'center'})}>Center</button><button className={block.align==='right'?'on':''} onClick={()=>update(block.id,{align:'right'})}>Right</button></div></Field><div className="button-list">{block.buttons.map((btn,i)=><div className="button-editor" key={i}><input value={btn.text} placeholder="Button text" onChange={e=>{const x=[...block.buttons];x[i]={...x[i],text:e.target.value};update(block.id,{buttons:x})}}/><select value={btn.style} onChange={e=>{const x=[...block.buttons];x[i]={...x[i],style:e.target.value};update(block.id,{buttons:x})}}><option>primary</option><option>success</option><option>danger</option><option>link</option></select><select value={btn.action} onChange={e=>{const x=[...block.buttons];x[i]={...x[i],action:e.target.value};update(block.id,{buttons:x})}}><option value="url">URL</option><option value="callback_data">Callback</option><option value="copy_text">Copy text</option><option value="web_app">Web App</option><option value="disabled">Disabled</option></select><input value={btn.value} placeholder="Action value" onChange={e=>{const x=[...block.buttons];x[i]={...x[i],value:e.target.value};update(block.id,{buttons:x})}}/><button onClick={()=>update(block.id,{buttons:block.buttons.filter((_,x)=>x!==i)})}><X size={14}/></button></div>)}<button className="outline-add" disabled={block.buttons.length>=8} onClick={()=>update(block.id,{buttons:[...block.buttons,{text:'New button',style:'primary',action:'url',value:'https://t.me/'}]})}><Plus size={14}/> Add button</button></div></>; }

function MediaEditor({ block, update }) { return <><div className="media-source"><div className="source-icon">{block.type==='photo'?<ImageIcon size={20}/>:<Video size={20}/>}</div><div><strong>{block.type==='photo'?'Photo':'Video'} source</strong><small>Use a Telegram file_id or HTTPS URL. Upload pipeline connects to the bot backend.</small></div></div><Field label="Telegram file ID or HTTPS URL"><input value={block.source} onChange={e=>update(block.id,{source:e.target.value})} placeholder="AgAC... or https://..."/></Field><Field label="Caption"><textarea value={block.caption} onChange={e=>update(block.id,{caption:e.target.value})}/></Field></>; }

function MapEditor({ block, update }) { return <><div className="location-card"><MapPin size={20}/><div><strong>Location</strong><small>In Telegram, this will become an InputRichBlockMap.</small></div><button onClick={()=>{navigator.geolocation?.getCurrentPosition(p=>update(block.id,{latitude:Number(p.coords.latitude.toFixed(6)),longitude:Number(p.coords.longitude.toFixed(6))}))}}>Use my location</button></div><div className="two-fields"><Field label="Latitude"><input type="number" value={block.latitude} onChange={e=>update(block.id,{latitude:Number(e.target.value)})}/></Field><Field label="Longitude"><input type="number" value={block.longitude} onChange={e=>update(block.id,{longitude:Number(e.target.value)})}/></Field></div><div className="two-fields"><Field label="Zoom"><input type="number" min="0" max="24" value={block.zoom} onChange={e=>update(block.id,{zoom:Number(e.target.value)})}/></Field><Field label="Width"><input type="number" value={block.width} onChange={e=>update(block.id,{width:Number(e.target.value)})}/></Field></div></>; }

function SettingsPanel({onExport,onReset}) { return <div className="inspector-card"><div className="inspector-head"><div><span className="kicker">APP SETTINGS</span><h3>Document</h3></div><Settings2 size={18}/></div><div className="settings-list"><div><strong>Rich Message model</strong><span>RDM v1 · blocks → InputRichMessage</span></div><div><strong>Telegram limits</strong><span>32,768 chars · 500 blocks · 16 nesting levels · 50 media · 20 table columns</span></div><div><strong>Storage</strong><span>Local draft for this first standalone build</span></div></div><button className="outline-wide" onClick={onExport}><Copy size={15}/> Copy RDM JSON</button><button className="outline-wide danger-wide" onClick={onReset}><Trash2 size={15}/> Reset document</button></div>; }

function TelegramPreview({blocks}) { return <div className="telegram-card"><div className="chat-head"><div className="avatar">R</div><div><strong>Rich Studio</strong><span>preview</span></div><MoreHorizontal size={17}/></div><div className="chat-bg"><div className="bubble">{blocks.map(b=><PreviewBlock key={b.id} block={b}/>)}<span className="time">09:41 ✓✓</span></div></div></div>; }

function PreviewBlock({block}) { if(block.type==='heading') return <div className={`p-heading p-h${block.size}`}>{block.text}</div>; if(block.type==='paragraph') return <p className="p-text">{block.text}</p>; if(block.type==='pre') return <pre>{block.text}</pre>; if(block.type==='quote') return <blockquote>{block.text}</blockquote>; if(block.type==='footer') return <div className="p-footer">{block.text}</div>; if(block.type==='divider') return <hr/>; if(block.type==='list') return block.ordered?<ol>{block.items.map((x,i)=><li key={i}>{x}</li>)}</ol>:<ul>{block.items.map((x,i)=><li key={i}>{x}</li>)}</ul>; if(block.type==='table') return <div className={`p-table ${block.striped?'striped':''} ${block.bordered?'bordered':''}`}>{block.caption&&<small>{block.caption}</small>}{block.rows.map((r,i)=><div className="p-tr" key={i}>{r.map((c,j)=><span className={i===0?'th':''} key={j}>{c}</span>)}</div>)}</div>; if(block.type==='buttons') return <div className={`p-buttons ${block.align}`}>{block.buttons.map((x,i)=><span className={`p-btn ${x.style}`} key={i}>{x.text}</span>)}</div>; if(block.type==='photo') return block.source?.startsWith('http')?<img className="p-media" src={block.source} alt=""/>:<div className="media-empty"><ImageIcon size={18}/><span>{block.source?'Telegram photo':'Add photo source'}</span></div>; if(block.type==='video') return <div className="media-empty"><Video size={18}/><span>{block.source?'Video ready':'Add video source'}</span></div>; if(block.type==='map') return <div className="map-preview"><MapPin size={18}/><span>{block.latitude}, {block.longitude}</span></div>; return null; }

function AddSheet({onClose,onAdd}) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="sheet" onMouseDown={e=>e.stopPropagation()}><div className="sheet-handle"/><div className="sheet-head"><div><span className="kicker">INSERT</span><h2>Add block</h2></div><button onClick={onClose}><X size={19}/></button></div><div className="catalog">{blockCatalog.map(([type,label,Icon])=><button key={type} onClick={()=>onAdd(type)}><span className="catalog-icon"><Icon size={19}/></span><span>{label}</span><ChevronRight size={15}/></button>)}</div></div></div>; }

function PreviewSheet({blocks,onClose,onSave,onShare}) { return <div className="modal-backdrop preview-modal"><div className="full-preview"><div className="sheet-head"><div><span className="kicker">PREVIEW</span><h2>Telegram Rich Message</h2></div><button onClick={onClose}><X size={19}/></button></div><TelegramPreview blocks={blocks}/><div className="preview-footer"><button onClick={onSave}>Save draft</button><button className="primary-wide" onClick={onShare}><Send size={16}/> Share inline</button></div></div></div>; }

createRoot(document.getElementById('root')).render(<App/>);
