import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { init } from '@telegram-apps/sdk';
import { AlignCenter, AlignLeft, AlignRight, Bold, Braces, Check, ChevronDown, Code2, Copy, Eye, FileCode2, FileText, Heading1, ImagePlus, Italic, Link2, List, ListOrdered, MapPin, Minus, MoreHorizontal, Plus, Quote, Redo2, Send, Strikethrough, Table2, Trash2, Underline, Undo2, Video, X } from 'lucide-react';
import './editor.css';

const STORAGE_KEY = 'rich-message-miniapp-v4';
const uid = () => `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const makeBlock = (type = 'paragraph', extra = {}) => ({ id: uid(), type, text: '', ...extra });
const starter = [makeBlock('paragraph')];

function tg() { return window.Telegram?.WebApp || null; }
function telegramTheme() {
  const app = tg();
  const root = document.documentElement;
  const defaults = {
    bg_color:'#ffffff', secondary_bg_color:'#f1f3f5', text_color:'#111827', hint_color:'#8b96a5',
    link_color:'#3390ec', button_color:'#3390ec', button_text_color:'#ffffff', header_bg_color:'#ffffff',
    bottom_bar_bg_color:'#ffffff', section_bg_color:'#ffffff', section_header_text_color:'#8b96a5',
    section_separator_color:'#e5e7eb', subtitle_text_color:'#8b96a5', destructive_text_color:'#e53935', accent_text_color:'#3390ec'
  };
  const t = app?.themeParams || {};
  Object.entries(defaults).forEach(([key, value]) => root.style.setProperty(`--tg-${key.replaceAll('_','-')}`, t[key] || value));
  root.dataset.scheme = app?.colorScheme || 'light';
  root.style.colorScheme = app?.colorScheme || 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg_color || defaults.bg_color);
}
function useTelegram() {
  useEffect(() => {
    try { init(); } catch {}
    const app = tg();
    try { app?.ready(); app?.expand(); } catch {}
    telegramTheme();
    if (!app) return undefined;
    const changed = () => telegramTheme();
    app.onEvent('themeChanged', changed);
    return () => app.offEvent('themeChanged', changed);
  }, []);
}
function loadDraft() {
  try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(v) && v.length ? v : starter; } catch { return starter; }
}
function plain(html = '') { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }
function clean(html = '') {
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll('script,style').forEach((n) => n.remove());
  d.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => a.name.toLowerCase().startsWith('on') && n.removeAttribute(a.name)));
  return d.innerHTML;
}
function directionFor(html = '') {
  const s = plain(html);
  const rtl = /[\u0590-\u08ff\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  const ltr = /[A-Za-z\u00C0-\u02AF\u0370-\u058F\u0900-\u1FFF\u2C00-\uD7FF\uF900-\uFAFF]/;
  for (const ch of s) { if (rtl.test(ch)) return 'rtl'; if (ltr.test(ch)) return 'ltr'; }
  return 'ltr';
}
function newBlock(type) {
  const x = {
    paragraph:{}, heading:{size:2}, quote:{credit:''}, pullquote:{credit:''}, expandable:{label:'More',credit:''}, pre:{language:''}, footer:{},
    list:{ordered:false,items:['']}, table:{bordered:true,striped:false,compact:false,caption:'',rows:[[{text:'',header:true},{text:'',header:true}],[{text:'',header:false},{text:'',header:false}]]},
    buttons:{align:'left',buttons:[{text:'Button',style:'primary',action:'url',value:''}]}, photo:{source:'',caption:''}, video:{source:'',caption:''}, map:{latitude:'',longitude:'',zoom:14}, math:{expression:''}, anchor:{name:''}, divider:{}
  }[type] || {};
  return makeBlock(type, x);
}
function toInputRichMessage(blocks) {
  return { blocks: blocks.map((b) => {
    const text = clean(b.text);
    if (b.type === 'paragraph') return {type:'paragraph',text};
    if (b.type === 'heading') return {type:'heading',size:b.size,text};
    if (b.type === 'pre') return {type:'pre',language:b.language || undefined,text:plain(b.text)};
    if (b.type === 'quote') return {type:'blockquote',blocks:[{type:'paragraph',text}],credit:clean(b.credit || '') || undefined};
    if (b.type === 'pullquote') return {type:'pullquote',text,credit:clean(b.credit || '') || undefined};
    if (b.type === 'expandable') return {type:'expandable_blockquote',text,credit:clean(b.credit || '') || undefined};
    if (b.type === 'footer') return {type:'footer',text};
    if (b.type === 'divider') return {type:'divider'};
    if (b.type === 'math') return {type:'mathematical_expression',expression:b.expression || ''};
    if (b.type === 'anchor') return {type:'anchor',name:b.name || ''};
    if (b.type === 'list') return {type:'list',items:b.items.map((x) => ({blocks:[{type:'paragraph',text:clean(x)}]}))};
    if (b.type === 'table') return {type:'table',is_bordered:b.bordered || undefined,is_striped:b.striped || undefined,is_compact:b.compact || undefined,caption:clean(b.caption || '') || undefined,cells:b.rows.map((r)=>r.map((c)=>({text:clean(c.text),is_header:c.header||undefined,colspan:c.colspan>1?c.colspan:undefined,rowspan:c.rowspan>1?c.rowspan:undefined,align:c.align !== 'left'?c.align:undefined,valign:c.valign !== 'top'?c.valign:undefined})))};
    if (b.type === 'buttons') return {type:'buttons',align:b.align,buttons:b.buttons.map((x)=>({text:x.text,style:x.style,...(x.action==='url'?{url:x.value}:{callback_data:x.value})}))};
    if (b.type === 'photo') return {type:'photo',photo:b.source,caption:b.caption?{text:clean(b.caption)}:undefined};
    if (b.type === 'video') return {type:'video',video:b.source,caption:b.caption?{text:clean(b.caption)}:undefined};
    if (b.type === 'map') return {type:'map',location:{latitude:Number(b.latitude)||0,longitude:Number(b.longitude)||0},zoom:Number(b.zoom)||14};
    return {type:'paragraph',text:''};
  })};
}
function transformBlock(b, type) {
  if (type === 'paragraph') {
    if (b.type === 'list') return {...b,type:'paragraph',text:b.items?.[0] || ''};
    return {...b,type:'paragraph'};
  }
  if (type === 'list') {
    if (b.type === 'list') return b;
    return {...b,type:'list',ordered:false,items:[b.text || '']};
  }
  if (type === 'heading') return {...b,type:'heading',size:b.size || 2};
  if (type === 'quote') return {...b,type:'quote',credit:b.credit || ''};
  if (type === 'pullquote') return {...b,type:'pullquote',credit:b.credit || ''};
  if (type === 'expandable') return {...b,type:'expandable',label:b.label || 'More',credit:b.credit || ''};
  if (type === 'pre') return {...b,type:'pre',language:b.language || ''};
  return {...newBlock(type),text:b.text || '',id:b.id};
}

function App() {
  useTelegram();
  const [blocks,setBlocks] = useState(loadDraft);
  const [selected,setSelected] = useState(() => blocks[0]?.id || null);
  const [history,setHistory] = useState([]), [future,setFuture] = useState([]);
  const [sheet,setSheet] = useState(false), [more,setMore] = useState(false), [preview,setPreview] = useState(false), [slash,setSlash] = useState(false), [notice,setNotice] = useState('');
  useEffect(()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(blocks)),[blocks]);
  const current = blocks.find((b)=>b.id===selected) || blocks[0];
  const toast=(m)=>{setNotice(m);clearTimeout(window.__rmt);window.__rmt=setTimeout(()=>setNotice(''),1600)};
  const commit=(next)=>{setHistory((h)=>[...h.slice(-29),blocks]);setFuture([]);setBlocks(next)};
  const update=(id,patch)=>setBlocks((all)=>all.map((b)=>b.id===id?{...b,...patch}:b));
  const add=(type)=>{const n=newBlock(type);const i=Math.max(0,blocks.findIndex((b)=>b.id===selected));commit([...blocks.slice(0,i+1),n,...blocks.slice(i+1)]);setSelected(n.id);setSheet(false);setSlash(false);setTimeout(()=>document.getElementById(`editor-${n.id}`)?.focus(),40)};
  const slashAdd=(type)=>{const currentIndex=blocks.findIndex((b)=>b.id===selected);const b=blocks[currentIndex];const cleanedText=(b?.text||'').replace(/\/$/,'');if(b) setBlocks((all)=>all.map((x)=>x.id===b.id?{...x,text:cleanedText}:x));setTimeout(()=>add(type),0)};
  const remove=(id)=>{if(blocks.length===1){commit([newBlock('paragraph')]);setSelected(null);return}const i=blocks.findIndex((b)=>b.id===id);const next=blocks.filter((b)=>b.id!==id);commit(next);setSelected(next[Math.max(0,i-1)]?.id||next[0]?.id)};
  const move=(id,d)=>{const i=blocks.findIndex((b)=>b.id===id),j=i+d;if(i<0||j<0||j>=blocks.length)return;const next=[...blocks];[next[i],next[j]]=[next[j],next[i]];commit(next)};
  const transform=(type)=>{if(!current)return;commit(blocks.map((b)=>b.id===current.id?transformBlock(b,type):b))};
  const undo=()=>{const p=history.at(-1);if(!p)return;setFuture((f)=>[blocks,...f]);setHistory((h)=>h.slice(0,-1));setBlocks(p)};
  const redo=()=>{const n=future[0];if(!n)return;setHistory((h)=>[...h,blocks]);setFuture((f)=>f.slice(1));setBlocks(n)};
  const copy=async()=>{await navigator.clipboard?.writeText(JSON.stringify({type:'rich_message',...toInputRichMessage(blocks)},null,2));toast('Rich Message JSON copied')};
  const copyHtml=async()=>{await navigator.clipboard?.writeText(blocks.map(blockHtml).join('\n'));toast('HTML copied')};
  const reset=()=>{commit([newBlock('paragraph')]);setSelected(null);setMore(false);toast('Draft reset')};
  return <div className="app-shell">
    <header className="app-header"><div className="header-title"><strong>Rich Message</strong><span>Editor</span></div><div className="header-actions"><IconButton disabled={!history.length} onClick={undo}><Undo2/></IconButton><IconButton disabled={!future.length} onClick={redo}><Redo2/></IconButton><IconButton active={preview} onClick={()=>setPreview(!preview)}><Eye/></IconButton></div></header>
    {preview?<main className="preview-page"><div className="preview-top"><strong>Preview</strong><button onClick={()=>setPreview(false)}><X size={17}/> Edit</button></div><TelegramPreview blocks={blocks}/></main>:<main className="editor-page"><div className="document-card"><div className="document-head"><div><span className="eyebrow">RICH MESSAGE</span><h1>New message</h1></div><button className="more-button" onClick={()=>setMore(!more)}><MoreHorizontal/></button></div>{more&&<div className="more-menu"><button onClick={copy}><Braces/> Copy Rich Message JSON</button><button onClick={copyHtml}><FileCode2/> Copy HTML</button><button onClick={reset}><Trash2/> Reset draft</button></div>}<div className="blocks">{blocks.map((b,i)=><EditorBlock key={b.id} block={b} index={i} selected={b.id===selected} onSelect={()=>setSelected(b.id)} onUpdate={(p)=>update(b.id,p)} onRemove={()=>remove(b.id)} onMove={(d)=>move(b.id,d)} onSlash={()=>setSlash(true)}/>)}</div><button className="add-inline" onClick={()=>setSheet(true)}><Plus size={18}/> Add block</button></div></main>}
    {!preview&&current&&<FormattingBar block={current} onUpdate={(p)=>update(current.id,p)} onTransform={transform} onOpenAdd={()=>setSheet(true)}/>}<footer className="bottom-bar"><button onClick={()=>toast(`${JSON.stringify(toInputRichMessage(blocks)).length} bytes`)}><FileText/><span>Info</span></button><button onClick={copy}><Copy/><span>Copy</span></button><button className="publish" onClick={()=>toast('Ready for sendRichMessage')}><Send/><span>Publish</span></button></footer>
    {sheet&&<BlockSheet onPick={add} onClose={()=>setSheet(false)}/>} {slash&&<BlockSheet slash onPick={slashAdd} onClose={()=>setSlash(false)}/>} {notice&&<div className="toast"><Check size={15}/>{notice}</div>}
  </div>;
}
function IconButton({children,onClick,disabled,active}){return <button className={`icon-button ${active?'active':''}`} disabled={disabled} onClick={onClick}>{children}</button>}
function BlockControls({onRemove,onMove}){return <div className="block-controls"><button onClick={(e)=>{e.stopPropagation();onMove(-1)}}>↑</button><button onClick={(e)=>{e.stopPropagation();onMove(1)}}>↓</button><button className="delete" onClick={(e)=>{e.stopPropagation();onRemove()}}><Trash2 size={14}/></button></div>}
function EditableText({id,html,placeholder,onChange,onSlash,className=''}){const ref=useRef(null),last=useRef(html||'');const [dir,setDir]=useState(directionFor(html));useEffect(()=>{const nextDir=directionFor(html);setDir(nextDir);if(ref.current&&last.current!==html&&document.activeElement!==ref.current){ref.current.innerHTML=html||'';last.current=html||''}},[html]);return <div id={`editor-${id}`} ref={ref} className={`editable-text ${className}`} contentEditable suppressContentEditableWarning spellCheck dir={dir} data-placeholder={placeholder} onInput={(e)=>{const value=e.currentTarget.innerHTML;last.current=value;setDir(directionFor(value));onChange(value);if(plain(value).endsWith('/'))onSlash?.()}} onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey&&className.includes('single-line')){e.preventDefault();}}} />}
function EditorBlock({block,selected,onSelect,onUpdate,onRemove,onMove,onSlash}){return <section className={`editor-block type-${block.type} ${selected?'selected':''}`} onClick={onSelect}>{selected&&<BlockControls onRemove={onRemove} onMove={onMove}/>} {block.type==='paragraph'&&<EditableText id={block.id} html={block.text} placeholder="Write your message…" onChange={(text)=>onUpdate({text})} onSlash={onSlash}/>} {block.type==='heading'&&<HeadingBlock block={block} onUpdate={onUpdate}/>} {block.type==='quote'&&<QuoteBlock block={block} onUpdate={onUpdate}/>} {block.type==='pullquote'&&<PullQuote block={block} onUpdate={onUpdate}/>} {block.type==='expandable'&&<Expandable block={block} onUpdate={onUpdate}/>} {block.type==='pre'&&<PreBlock block={block} onUpdate={onUpdate}/>} {block.type==='footer'&&<EditableText id={block.id} html={block.text} placeholder="Footer…" onChange={(text)=>onUpdate({text})}/>} {block.type==='list'&&<ListEditor block={block} onUpdate={onUpdate}/>} {block.type==='table'&&<TableEditor block={block} onUpdate={onUpdate}/>} {block.type==='buttons'&&<ButtonsEditor block={block} onUpdate={onUpdate}/>} {block.type==='photo'&&<MediaEditor block={block} kind="photo" onUpdate={onUpdate}/>} {block.type==='video'&&<MediaEditor block={block} kind="video" onUpdate={onUpdate}/>} {block.type==='map'&&<MapEditor block={block} onUpdate={onUpdate}/>} {block.type==='math'&&<MathEditor block={block} onUpdate={onUpdate}/>} {block.type==='anchor'&&<div className="simple-block"><label>Anchor name</label><input value={block.name} onChange={(e)=>onUpdate({name:e.target.value})} placeholder="section-name"/></div>} {block.type==='divider'&&<hr className="divider-block"/>}</section>}
function HeadingBlock({block,onUpdate}){return <div className="heading-block"><div className="block-style-row"><select value={block.size} onChange={(e)=>onUpdate({size:Number(e.target.value)})}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>Heading {n}</option>)}</select><span>Section heading</span></div><EditableText id={block.id} html={block.text} className={`heading-text h${block.size}`} placeholder="Heading…" onChange={(text)=>onUpdate({text})}/></div>}
function Credit({value,onChange}){return <input className="credit-input" value={value||''} onChange={(e)=>onChange(e.target.value)} placeholder="Credit (optional)"/>}
function QuoteBlock({block,onUpdate}){return <div className="quote-editor"><div className="quote-mark">❞</div><div className="quote-body"><EditableText id={block.id} html={block.text} placeholder="Write a quotation…" onChange={(text)=>onUpdate({text})}/><Credit value={block.credit} onChange={(credit)=>onUpdate({credit})}/></div></div>}
function PullQuote({block,onUpdate}){return <div className="pullquote-editor"><EditableText id={block.id} html={block.text} placeholder="Write a pull quote…" onChange={(text)=>onUpdate({text})}/><Credit value={block.credit} onChange={(credit)=>onUpdate({credit})}/></div>}
function Expandable({block,onUpdate}){return <div className="expandable-editor"><div className="expandable-title"><ChevronDown/><input value={block.label} onChange={(e)=>onUpdate({label:e.target.value})}/></div><EditableText id={block.id} html={block.text} placeholder="Expandable content…" onChange={(text)=>onUpdate({text})}/><Credit value={block.credit} onChange={(credit)=>onUpdate({credit})}/></div>}
function PreBlock({block,onUpdate}){return <div className="pre-editor"><div className="pre-head"><Code2/><select value={block.language} onChange={(e)=>onUpdate({language:e.target.value})}><option value="">Plain text</option><option>javascript</option><option>typescript</option><option>python</option><option>json</option><option>bash</option></select></div><EditableText id={block.id} html={block.text} className="code-text" placeholder="Code…" onChange={(text)=>onUpdate({text})}/></div>}
function ListEditor({block,onUpdate}){const Tag=block.ordered?'ol':'ul';const set=(i,text)=>onUpdate({items:block.items.map((x,j)=>i===j?text:x)});return <div className="list-editor"><div className="list-head"><button className={!block.ordered?'selected':''} onClick={()=>onUpdate({ordered:false})}><List/></button><button className={block.ordered?'selected':''} onClick={()=>onUpdate({ordered:true})}><ListOrdered/></button><span>{block.ordered?'Numbered list':'Bulleted list'}</span></div><Tag>{block.items.map((x,i)=><li key={i}><EditableText id={`${block.id}-${i}`} html={x} placeholder="List item…" onChange={(t)=>set(i,t)}/></li>)}</Tag><button className="add-item" onClick={()=>onUpdate({items:[...block.items,'']})}><Plus/> Add item</button></div>}
function TableEditor({block,onUpdate}){const cell=(r,c,p)=>onUpdate({rows:block.rows.map((row,ri)=>row.map((x,ci)=>ri===r&&ci===c?{...x,...p}:x))});const addRow=()=>onUpdate({rows:[...block.rows,Array.from({length:block.rows[0]?.length||2},()=>({text:'',header:false}))]});const addCol=()=>onUpdate({rows:block.rows.map(r=>[...r,{text:'',header:false}])});const delRow=()=>block.rows.length>1&&onUpdate({rows:block.rows.slice(0,-1)});const delCol=()=>block.rows[0]?.length>1&&onUpdate({rows:block.rows.map(r=>r.slice(0,-1))});return <div className="table-editor"><div className="table-head"><strong><Table2/> Table</strong><div><button onClick={addRow}><Plus/> Row</button><button onClick={addCol}><Plus/> Column</button><button onClick={delRow}>− Row</button><button onClick={delCol}>− Column</button></div></div><div className="table-scroll"><table className={`${block.bordered?'bordered':''} ${block.striped?'striped':''} ${block.compact?'compact':''}`}><tbody>{block.rows.map((r,ri)=><tr key={ri}>{r.map((c,ci)=><td key={ci} className={c.header?'is-header':''}><EditableText id={`${block.id}-${ri}-${ci}`} html={c.text} placeholder="Cell" onChange={(text)=>cell(ri,ci,{text})}/><button className="cell-head" onClick={()=>cell(ri,ci,{header:!c.header})}><Heading1 size={11}/></button></td>)}</tr>)}</tbody></table></div><input className="caption-input" value={block.caption||''} onChange={(e)=>onUpdate({caption:e.target.value})} placeholder="Table caption (optional)"/><div className="table-options"><Toggle label="Borders" checked={block.bordered} onChange={(bordered)=>onUpdate({bordered})}/><Toggle label="Striped" checked={block.striped} onChange={(striped)=>onUpdate({striped})}/><Toggle label="Compact" checked={block.compact} onChange={(compact)=>onUpdate({compact})}/></div></div>}
function Toggle({label,checked,onChange}){return <button className={`toggle ${checked?'on':''}`} onClick={()=>onChange(!checked)}><span>{label}</span><i/></button>}
function ButtonsEditor({block,onUpdate}){const set=(i,p)=>onUpdate({buttons:block.buttons.map((b,j)=>i===j?{...b,...p}:b)});return <div className="buttons-editor"><div className="buttons-head"><strong>Buttons</strong><div><button className={block.align==='left'?'selected':''} onClick={()=>onUpdate({align:'left'})}><AlignLeft/></button><button className={block.align==='center'?'selected':''} onClick={()=>onUpdate({align:'center'})}><AlignCenter/></button><button className={block.align==='right'?'selected':''} onClick={()=>onUpdate({align:'right'})}><AlignRight/></button></div></div>{block.buttons.map((b,i)=><div className="button-row-editor" key={i}><input value={b.text} onChange={(e)=>set(i,{text:e.target.value})} placeholder="Button text"/><select value={b.style} onChange={(e)=>set(i,{style:e.target.value})}><option value="primary">Primary</option><option value="success">Success</option><option value="danger">Danger</option><option value="link">Link</option></select><select value={b.action} onChange={(e)=>set(i,{action:e.target.value})}><option value="url">URL</option><option value="callback">Callback</option></select><input value={b.value} onChange={(e)=>set(i,{value:e.target.value})} placeholder="Value"/></div>)}<button className="add-item" disabled={block.buttons.length>=8} onClick={()=>onUpdate({buttons:[...block.buttons,{text:'Button',style:'primary',action:'url',value:''}]})}><Plus/> Add button</button></div>}
function MediaEditor({block,kind,onUpdate}){const Icon=kind==='photo'?ImagePlus:Video;return <div className="media-editor"><Icon/><div><strong>{kind==='photo'?'Photo':'Video'}</strong><input value={block.source} onChange={(e)=>onUpdate({source:e.target.value})} placeholder="Telegram file ID or HTTPS URL"/><input value={block.caption} onChange={(e)=>onUpdate({caption:e.target.value})} placeholder="Caption (optional)"/></div></div>}
function MapEditor({block,onUpdate}){const locate=()=>navigator.geolocation?.getCurrentPosition((p)=>onUpdate({latitude:p.coords.latitude.toFixed(6),longitude:p.coords.longitude.toFixed(6)}));return <div className="map-editor"><MapPin/><div><strong>Map location</strong><div className="map-fields"><input value={block.latitude} onChange={(e)=>onUpdate({latitude:e.target.value})} placeholder="Latitude"/><input value={block.longitude} onChange={(e)=>onUpdate({longitude:e.target.value})} placeholder="Longitude"/></div><button onClick={locate}><MapPin/> Use my location</button></div></div>}
function MathEditor({block,onUpdate}){return <div className="math-editor"><span>∑</span><div><strong>Formula</strong><input value={block.expression} onChange={(e)=>onUpdate({expression:e.target.value})} placeholder="LaTeX expression"/></div></div>}
function FormattingBar({block,onUpdate,onTransform,onOpenAdd}){const exec=(cmd,val=null)=>document.execCommand(cmd,false,val);const link=()=>{const u=window.prompt('Enter URL');if(u)exec('createLink',u)};const value=block.type==='heading'?`h${block.size}`:block.type==='paragraph'?'paragraph':block.type;return <div className="formatting-wrap"><div className="formatting-bar"><button onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('bold')}><Bold/></button><button onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('italic')}><Italic/></button><button onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('underline')}><Underline/></button><button onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('strikeThrough')}><Strikethrough/></button><button onMouseDown={(e)=>e.preventDefault()} onClick={link}><Link2/></button><span/><button onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('insertUnorderedList')}><List/></button><button onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('insertOrderedList')}><ListOrdered/></button><button onMouseDown={(e)=>e.preventDefault()} onClick={()=>onTransform('quote')}><Quote/></button><button className="add-button" onClick={onOpenAdd}><Plus/></button></div><div className="format-select"><select value={value} onChange={(e)=>onTransform(e.target.value)}><option value="paragraph">Normal text</option>{[1,2,3,4,5,6].map((n)=><option key={n} value={`heading:${n}`}>Heading {n}</option>)}<option value="quote">Block quote</option><option value="pullquote">Pull quote</option><option value="expandable">Expandable quote</option><option value="pre">Code</option><option value="list">List</option></select><ChevronDown/></div></div>}
function BlockSheet({onPick,onClose,slash=false}){const groups=[{title:'Text',items:[['paragraph','Normal text',FileText],['heading','Heading',Heading1],['quote','Block quote',Quote],['pullquote','Pull quote',Quote],['expandable','Expandable quote',ChevronDown],['pre','Code',Code2],['footer','Footer',FileText],['divider','Divider',Minus]]},{title:'Content',items:[['list','List',List],['table','Table',Table2],['buttons','Buttons',Plus],['math','Formula',Braces],['anchor','Anchor',Link2]]},{title:'Media',items:[['photo','Photo',ImagePlus],['video','Video',Video],['map','Map',MapPin]]}];return <div className="sheet-layer"><div className="sheet-dim" onClick={onClose}/><div className="block-sheet"><div className="sheet-handle"/><div className="sheet-title"><strong>{slash?'Insert block':'Add block'}</strong><button onClick={onClose}><X/></button></div>{groups.map(g=><div className="sheet-group" key={g.title}><span>{g.title}</span><div className="sheet-grid">{g.items.map(([type,label,Icon])=><button key={type} onClick={()=>onPick(type)}><Icon/><span>{label}</span></button>)}</div></div>)}</div></div>}
function blockHtml(b){const t=clean(b.text);if(b.type==='paragraph')return `<p>${t}</p>`;if(b.type==='heading')return `<h${b.size}>${t}</h${b.size}>`;if(b.type==='quote')return `<blockquote>${t}${b.credit?`<cite>${clean(b.credit)}</cite>`:''}</blockquote>`;if(b.type==='pullquote')return `<aside>${t}${b.credit?`<cite>${clean(b.credit)}</cite>`:''}</aside>`;if(b.type==='expandable')return `<blockquote expandable>${t}${b.credit?`<cite>${clean(b.credit)}</cite>`:''}</blockquote>`;if(b.type==='pre')return `<pre><code${b.language?` class="language-${b.language}"`:''}>${plain(b.text)}</code></pre>`;if(b.type==='footer')return `<footer>${t}</footer>`;if(b.type==='divider')return '<hr/>';if(b.type==='list')return `<${b.ordered?'ol':'ul'}>${b.items.map(x=>`<li>${clean(x)}</li>`).join('')}</${b.ordered?'ol':'ul'}>`;if(b.type==='table')return `<table>${b.rows.map(r=>`<tr>${r.map(c=>`<${c.header?'th':'td'}>${clean(c.text)}</${c.header?'th':'td'}>`).join('')}</tr>`).join('')}</table>`;if(b.type==='math')return `<tg-math-block>${String(b.expression||'').replaceAll('&','&amp;').replaceAll('<','&lt;')}</tg-math-block>`;return ''}
function TelegramPreview({blocks}){return <div className="telegram-preview"><div className="fake-bubble">{blocks.map(b=><PreviewBlock key={b.id} block={b}/>)}</div><span className="fake-time">now ✓</span></div>}
function PreviewBlock({block:b}){const d=directionFor(b.text);if(b.type==='paragraph')return <div className="pv-text" dir={d} dangerouslySetInnerHTML={{__html:clean(b.text)}}/>;if(b.type==='heading')return <div className={`pv-heading h${b.size}`} dir={d} dangerouslySetInnerHTML={{__html:clean(b.text)}}/>;if(b.type==='quote')return <div className="pv-quote" dir={d}><span>❞</span><div dangerouslySetInnerHTML={{__html:clean(b.text)}}/>{b.credit&&<cite>{b.credit}</cite>}</div>;if(b.type==='pullquote')return <div className="pv-pull" dir={d} dangerouslySetInnerHTML={{__html:`${clean(b.text)}${b.credit?`<cite>${clean(b.credit)}</cite>`:''}`}}/>;if(b.type==='expandable')return <details className="pv-details" open><summary>{b.label||'More'}</summary><div dangerouslySetInnerHTML={{__html:clean(b.text)}}/>{b.credit&&<cite>{b.credit}</cite>}</details>;if(b.type==='pre')return <pre className="pv-pre">{plain(b.text)}</pre>;if(b.type==='footer')return <div className="pv-footer" dangerouslySetInnerHTML={{__html:clean(b.text)}}/>;if(b.type==='divider')return <hr/>;if(b.type==='list'){const T=b.ordered?'ol':'ul';return <T className="pv-list">{b.items.map((x,i)=><li key={i} dangerouslySetInnerHTML={{__html:clean(x)}}/>)}</T>}if(b.type==='table')return <table className={`pv-table ${b.bordered?'bordered':''} ${b.striped?'striped':''} ${b.compact?'compact':''}`}><tbody>{b.rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td className={c.header?'head':''} key={j}>{plain(c.text)}</td>)}</tr>)}</tbody></table>;if(b.type==='buttons')return <div className={`pv-buttons ${b.align}`}>{b.buttons.map((x,i)=><span key={i} className={`pv-button ${x.style}`}>{x.text}</span>)}</div>;if(b.type==='photo'||b.type==='video')return <div className="pv-media">{b.type==='photo'?<ImagePlus/>:<Video/>}<span>{b.source||'Media'}</span></div>;if(b.type==='map')return <div className="pv-map"><MapPin/>{b.latitude&&b.longitude?`${b.latitude}, ${b.longitude}`:'Map location'}</div>;if(b.type==='math')return <div className="pv-math">{b.expression||'Formula'}</div>;return null}
createRoot(document.getElementById('root')).render(<App/>);
