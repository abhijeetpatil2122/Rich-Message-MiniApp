import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { init, miniApp, viewport, hapticFeedback } from '@telegram-apps/sdk';
import { Plus, Bold, Italic, Underline, Strikethrough, Code2, Link2, List, ListOrdered, Quote, Heading, Table2, Image, Video, MapPin, Minus, MoreHorizontal, ChevronDown, Trash2, Copy, Send, X, Check, FileText, AlignLeft, AlignCenter, AlignRight, Eye, RotateCcw } from 'lucide-react';
import './styles.css';

const uid = () => `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const newBlock = (type) => {
  const id = uid();
  switch (type) {
    case 'heading': return { id, type, size: 2, html: 'Heading' };
    case 'quote': return { id, type, html: 'Write a quotation…' };
    case 'list': return { id, type, ordered: false, items: ['List item'] };
    case 'pre': return { id, type, html: 'Write code…' };
    case 'table': return { id, type, bordered: true, striped: false, compact: false, rows: [['Column 1', 'Column 2'], ['Write here', 'Write here']] };
    case 'buttons': return { id, type, align: 'left', buttons: [{ text: 'Button', style: 'primary', action: 'url', value: '' }] };
    case 'photo': return { id, type, source: '', caption: '' };
    case 'video': return { id, type, source: '', caption: '' };
    case 'map': return { id, type, latitude: '', longitude: '' };
    case 'divider': return { id, type };
    default: return { id, type: 'paragraph', html: '' };
  }
};
const initial = [{ id: 'p1', type: 'paragraph', html: 'Start writing your Rich Message…' }];

function telegramInit() {
  try {
    init();
    if (miniApp.mount.isAvailable()) miniApp.mount();
    if (miniApp.ready.isAvailable()) miniApp.ready();
    if (viewport.mount.isAvailable()) void viewport.mount().catch(() => {});
  } catch (error) { console.info('Telegram SDK browser fallback', error); }
}
function impact(style = 'light') { try { if (hapticFeedback.impactOccurred.isAvailable()) hapticFeedback.impactOccurred(style); } catch {} }

function App() {
  const [blocks, setBlocks] = useState(() => { try { return JSON.parse(localStorage.getItem('rich-studio-document')) || initial; } catch { return initial; } });
  const [menu, setMenu] = useState(false);
  const [slash, setSlash] = useState(false);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState('');
  const editorRef = useRef(null);
  useEffect(() => { telegramInit(); }, []);
  useEffect(() => { localStorage.setItem('rich-studio-document', JSON.stringify(blocks)); }, [blocks]);
  const update = (id, patch) => setBlocks(current => current.map(b => b.id === id ? { ...b, ...patch } : b));
  const add = type => { const block = newBlock(type); setBlocks(current => [...current, block]); setSelected(block.id); setMenu(false); setSlash(false); impact(); };
  const remove = id => { setBlocks(current => current.filter(b => b.id !== id)); setSelected(null); };
  const duplicate = id => { const index = blocks.findIndex(b => b.id === id); if (index < 0) return; const copy = structuredClone(blocks[index]); copy.id = uid(); setBlocks(current => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]); setSelected(copy.id); };
  const reset = () => { setBlocks(initial); setSelected(null); localStorage.removeItem('rich-studio-document'); };
  const notify = text => { setNotice(text); window.setTimeout(() => setNotice(''), 1800); };
  const format = (command, value = null) => { document.execCommand(command, false, value); editorRef.current?.focus(); impact(); };
  const addLink = () => { const url = window.prompt('Link URL'); if (url) format('createLink', url); };

  return <div className="app">
    <header className="topbar"><div className="title"><strong>Rich Message</strong><span>Editor</span></div><div className="top-actions"><button onClick={() => notify('Draft saved')}><Check size={18}/></button><button onClick={() => notify('Publish will connect to the bot backend')}><Send size={18}/></button></div></header>
    <main className="page">
      <div className="hint">Write your message. Use the toolbar to format text or add a rich block.</div>
      <div className="message-editor" ref={editorRef}>
        {blocks.map((block, index) => <RichBlock key={block.id} block={block} index={index} selected={selected === block.id} onSelect={() => setSelected(block.id)} onUpdate={patch => update(block.id, patch)} onRemove={() => remove(block.id)} onDuplicate={() => duplicate(block.id)} onSlash={() => setSlash(true)} />)}
        <button className="inline-add" onClick={() => setMenu(true)}><Plus size={16}/> Add</button>
      </div>
      {slash && <QuickMenu compact onPick={add} onClose={() => setSlash(false)} />}
      <div className="preview-label"><Eye size={14}/> Live Telegram preview</div><div className="telegram-preview"><Preview blocks={blocks}/></div>
    </main>
    <div className="formatbar">
      <button onMouseDown={e => e.preventDefault()} onClick={() => format('bold')}><Bold/></button><button onMouseDown={e => e.preventDefault()} onClick={() => format('italic')}><Italic/></button><button onMouseDown={e => e.preventDefault()} onClick={() => format('underline')}><Underline/></button><button onMouseDown={e => e.preventDefault()} onClick={() => format('strikeThrough')}><Strikethrough/></button><button onMouseDown={e => e.preventDefault()} onClick={() => format('formatBlock', 'pre')}><Code2/></button><button onMouseDown={e => e.preventDefault()} onClick={addLink}><Link2/></button><span className="bar-divider"/><button onClick={() => format('insertUnorderedList')}><List/></button><button onClick={() => format('insertOrderedList')}><ListOrdered/></button><button onClick={() => add('quote')}><Quote/></button><button className="plus" onClick={() => setMenu(v => !v)}><Plus/></button>
    </div>
    {menu && <QuickMenu onPick={add} onClose={() => setMenu(false)} />}
    <div className="bottom-tools"><button onClick={() => notify('RDM copied to clipboard')}><Copy size={17}/><span>Copy</span></button><button onClick={reset}><RotateCcw size={17}/><span>Reset</span></button><button className="main-action" onClick={() => notify('Publish flow will use sendRichMessage')}><Send size={17}/><span>Publish</span></button></div>
    {notice && <div className="toast"><Check size={15}/>{notice}</div>}
  </div>;
}

function RichBlock({ block, selected, onSelect, onUpdate, onRemove, onDuplicate, onSlash }) {
  return <div className={`rich-block ${selected ? 'selected' : ''}`} onClick={onSelect}>
    {selected && <div className="block-menu"><button onClick={e => { e.stopPropagation(); onDuplicate(); }}><Copy size={13}/></button><button className="danger" onClick={e => { e.stopPropagation(); onRemove(); }}><Trash2 size={13}/></button></div>}
    {block.type === 'paragraph' && <Editable html={block.html} onChange={html => { onUpdate({ html }); if (html.endsWith('/')) onSlash(); }} placeholder="Write something…" />}
    {block.type === 'heading' && <div><div className="mini-control"><Heading size={13}/> H{block.size}<ChevronDown size={12}/></div><Editable className={`heading h${block.size}`} html={block.html} onChange={html => onUpdate({ html })}/></div>}
    {block.type === 'quote' && <div className="quote-block"><Editable html={block.html} onChange={html => onUpdate({ html })}/></div>}
    {block.type === 'pre' && <pre className="code-block" contentEditable suppressContentEditableWarning onInput={e => onUpdate({ html: e.currentTarget.innerHTML })}>{block.html}</pre>}
    {block.type === 'list' && <ListBlock block={block} update={onUpdate}/>} {block.type === 'table' && <TableBlock block={block} update={onUpdate}/>} {block.type === 'buttons' && <ButtonsBlock block={block} update={onUpdate}/>} {(block.type === 'photo' || block.type === 'video') && <MediaBlock block={block} update={onUpdate}/>} {block.type === 'map' && <MapBlock block={block} update={onUpdate}/>} {block.type === 'divider' && <hr/>}
  </div>;
}
function Editable({ html, onChange, className = '', placeholder }) { return <div className={`editable ${className}`} contentEditable suppressContentEditableWarning data-placeholder={placeholder || ''} dangerouslySetInnerHTML={{ __html: html }} onInput={e => onChange(e.currentTarget.innerHTML)} />; }
function ListBlock({ block, update }) { const Tag = block.ordered ? 'ol' : 'ul'; return <Tag className="rich-list">{block.items.map((item,i)=><li key={i} contentEditable suppressContentEditableWarning onInput={e=>{const items=[...block.items];items[i]=e.currentTarget.textContent;update({items});}}>{item}</li>)}<button className="small-add" onClick={()=>update({items:[...block.items,'New item']})}><Plus size={13}/> item</button></Tag>; }
function TableBlock({ block, update }) { const setCell=(r,c,value)=>{const rows=block.rows.map(row=>[...row]);rows[r][c]=value;update({rows});}; return <div className="table-wrap"><div className="table-toolbar"><span><Table2 size={14}/> Table</span><button onClick={()=>update({rows:[...block.rows,block.rows[0].map(()=>'Cell')]})}><Plus size={13}/> Row</button><button onClick={()=>update({rows:block.rows.map(row=>[...row,'Cell'])})}><Plus size={13}/> Column</button></div><table className={`${block.bordered?'bordered ':''}${block.striped?'striped ':''}${block.compact?'compact':''}`}><tbody>{block.rows.map((row,r)=><tr key={r}>{row.map((cell,c)=><td key={c} contentEditable suppressContentEditableWarning onInput={e=>setCell(r,c,e.currentTarget.textContent)}>{cell}</td>)}</tr>)}</tbody></table><div className="table-options"><button className={block.bordered?'active':''} onClick={()=>update({bordered:!block.bordered)}>Bordered</button><button className={block.striped?'active':''} onClick={()=>update({striped:!block.striped})}>Striped</button><button className={block.compact?'active':''} onClick={()=>update({compact:!block.compact})}>Compact</button></div></div>; }
function ButtonsBlock({ block, update }) { const set=(i,patch)=>update({buttons:block.buttons.map((b,n)=>n===i?{...b,...patch}:b)}); return <div className="buttons-block"><div className="button-toolbar"><span>Buttons</span><div><button onClick={()=>update({align:'left'})}><AlignLeft size={13}/></button><button onClick={()=>update({align:'center'})}><AlignCenter size={13}/></button><button onClick={()=>update({align:'right'})}><AlignRight size={13}/></button></div></div><div className={`button-row ${block.align}`}>{block.buttons.map((b,i)=><div className={`rich-button ${b.style}`} key={i}><input value={b.text} onChange={e=>set(i,{text:e.target.value})}/><select value={b.style} onChange={e=>set(i,{style:e.target.value})}><option value="primary">Primary</option><option value="success">Success</option><option value="danger">Danger</option><option value="link">Link</option></select></div>)}</div><button className="small-add" onClick={()=>update({buttons:[...block.buttons,{text:'Button',style:'primary',action:'url',value:''}]})}><Plus size={13}/> button</button></div>; }
function MediaBlock({ block, update }) { const Icon=block.type==='photo'?Image:Video; return <div className="media-block"><div className="media-title"><Icon size={16}/><strong>{block.type==='photo'?'Photo':'Video'}</strong></div><input value={block.source} onChange={e=>update({source:e.target.value})} placeholder="HTTPS URL or Telegram file_id"/><input value={block.caption} onChange={e=>update({caption:e.target.value})} placeholder="Caption (optional)"/><div className="media-note">The bot backend will handle uploads and Telegram file IDs.</div></div>; }
function MapBlock({ block, update }) { return <div className="map-block"><div className="map-head"><MapPin size={16}/><strong>Map</strong></div><div className="map-grid"><input value={block.latitude} onChange={e=>update({latitude:e.target.value})} placeholder="Latitude"/><input value={block.longitude} onChange={e=>update({longitude:e.target.value})} placeholder="Longitude"/></div><button onClick={()=>navigator.geolocation?.getCurrentPosition(p=>update({latitude:p.coords.latitude.toFixed(6),longitude:p.coords.longitude.toFixed(6)}))}><MapPin size={14}/> Use my location</button></div>; }
function QuickMenu({ onPick, onClose, compact=false }) { const items=[['heading','Heading',Heading],['paragraph','Text',FileText],['quote','Quote',Quote],['list','List',List],['table','Table',Table2],['buttons','Buttons',Plus],['photo','Photo',Image],['video','Video',Video],['map','Map',MapPin],['divider','Divider',Minus],['pre','Code',Code2]]; return <div className={`add-sheet ${compact?'compact':''}`}><div className="sheet-backdrop" onClick={onClose}/><div className="sheet"><div className="sheet-grab"/><div className="sheet-head"><strong>{compact?'Quick insert':'Add to message'}</strong><button onClick={onClose}><X size={18}/></button></div><div className="insert-grid">{items.map(([type,label,Icon])=><button key={type} onClick={()=>onPick(type)}><span><Icon size={19}/></span>{label}</button>)}</div></div></div>; }
function Preview({ blocks }) { return <div className="preview-message">{blocks.map(block=>{ if(block.type==='paragraph')return <div key={block.id} className="pv-text" dangerouslySetInnerHTML={{__html:block.html}}/>; if(block.type==='heading')return <div key={block.id} className={`pv-heading h${block.size}`} dangerouslySetInnerHTML={{__html:block.html}}/>; if(block.type==='quote')return <div key={block.id} className="pv-quote" dangerouslySetInnerHTML={{__html:block.html}}/>; if(block.type==='pre')return <pre key={block.id} className="pv-code">{block.html.replace(/<[^>]*>/g,'')}</pre>; if(block.type==='list'){const T=block.ordered?'ol':'ul';return <T key={block.id} className="pv-list">{block.items.map((x,i)=><li key={i}>{x}</li>)}</T>;} if(block.type==='table')return <table key={block.id} className="pv-table"><tbody>{block.rows.map((row,r)=><tr key={r}>{row.map((x,c)=><td className={r===0?'head':''} key={c}>{x}</td>)}</tr>)}</tbody></table>; if(block.type==='buttons')return <div key={block.id} className={`pv-buttons ${block.align}`}>{block.buttons.map((b,i)=><span className={`pv-button ${b.style}`} key={i}>{b.text}</span>)}</div>; if(block.type==='photo'||block.type==='video')return <div key={block.id} className="pv-media">{block.type==='photo'?<Image size={18}/>:<Video size={18}/>}<span>{block.source||`${block.type} media`}</span></div>; if(block.type==='map')return <div key={block.id} className="pv-map"><MapPin size={18}/><span>{block.latitude&&block.longitude?`${block.latitude}, ${block.longitude}`:'Map location'}</span></div>; return <hr key={block.id}/>; })}</div>; }

createRoot(document.getElementById('root')).render(<App/>);
