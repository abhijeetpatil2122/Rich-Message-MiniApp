import React,{useEffect,useLayoutEffect,useRef,useState}from'react';
import{Code2,Heading1,Heading2,Heading3,Heading4,Heading5,Heading6,List,ListChecks,ListOrdered,Minus,Pilcrow,Quote,ChevronsDownUp,Redo2,Undo2,Check,SendHorizontal,Trash2,Plus,MinusCircle,Bold,Italic,Underline,Strikethrough,EyeOff,Subscript,Superscript,Highlighter,Link2,AtSign,SmilePlus,Clock3,Mail,Phone,MousePointerClick,Hash,DollarSign,Terminal,CreditCard,SquareSigma,Anchor,BookOpen}from'lucide-react';
import{createInitialDocument}from'../document/schema.js';import{inlineText,normalizeInline,applyInlineMark,removeInlineMark,inlineHasMarks}from'../document/inline.js';import{changeType,mergePrevious,removeBlock,splitListItem,updateListItem,removeListItem,splitTextBlock,ensureEditableNeighbors,promoteEmptyParagraphToSpacing,updateSpacing}from'../document/operations.js';import{createHistory,record,redo,undo}from'../document/history.js';import{serializeDocument}from'../telegram/serializer.js';import{telegramHaptic}from'../telegram/webApp.js';

function plainText(v){return String(v??'').replace(/<[^>]*>/g,'');}
function contentSelection(node){
  const selection=window.getSelection?.();
  if(!selection||!selection.rangeCount||!node?.contains(selection.anchorNode)||!node.contains(selection.focusNode))return null;
  const range=selection.getRangeAt(0);
  const offset=(container,point)=>{
    const r=document.createRange();
    r.selectNodeContents(node);
    try{r.setEnd(container,point)}catch{return null}
    return r.toString().length;
  };
  const start=offset(range.startContainer,range.startOffset);
  const end=offset(range.endContainer,range.endOffset);
  if(start===null||end===null)return null;
  return start<=end?{start,end}:{start:end,end:start};
}
function selectionOffset(node){
  if(node&&typeof node.selectionStart==='number')return node.selectionStart;
  return contentSelection(node)?.start||0;
}
function setContentSelection(node,start,end=start){
  if(!node)return;
  const range=document.createRange(),selection=window.getSelection?.();
  if(!selection)return;
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
  let pos=0,startPoint=null,endPoint=null,n;
  while((n=walker.nextNode())){
    const next=pos+(n.textContent?.length||0);
    if(startPoint===null&&start>=pos&&start<=next)startPoint=[n,start-pos];
    if(end>=pos&&end<=next){endPoint=[n,end-pos];break}
    pos=next;
  }
  if(!startPoint)startPoint=[node,node.childNodes.length];
  if(!endPoint)endPoint=startPoint;
  range.setStart(startPoint[0],Math.max(0,Math.min(startPoint[0].textContent.length,startPoint[1])));
  range.setEnd(endPoint[0],Math.max(0,Math.min(endPoint[0].textContent.length,endPoint[1])));
  selection.removeAllRanges();selection.addRange(range);
}
function focus(id,offset=0,end=offset){
  const node=document.querySelector('[data-editor-id="'+CSS.escape(id)+'"]');
  if(!node)return;
  node.focus();
  if(typeof node.setSelectionRange==='function'){
    const value=String(node.value||''),a=Math.max(0,Math.min(value.length,offset)),z=Math.max(a,Math.min(value.length,end));
    node.setSelectionRange(a,z);
  }else if(node.isContentEditable)setContentSelection(node,offset,end);
}

function PlainInput({id,text,placeholder,className='',singleLine=false,onChange,onSelect,onKeyDown,onInlineSelect}){const ref=useRef(null);const props={ref,['data-editor-id']:id,type:'text',className:'editable plain-input '+className,value:String(text??''),placeholder,spellCheck:true,autoCapitalize:'sentences',enterKeyHint:'enter',onFocus:()=>onSelect?.(ref.current),onSelect:e=>{onSelect?.(ref.current);onInlineSelect?.(ref.current)},onChange:e=>onChange?.(e.currentTarget.value,e.currentTarget),onKeyDown:e=>onKeyDown?.(e,e.currentTarget)};return <div className="plain-input-shell">{singleLine?<input {...props}/>:<textarea {...props} rows={1}/>}</div>}
function renderInline(node,inline){
  node.innerHTML='';
  for(const segment of normalizeInline(inline,'')){
    if(!segment.text)continue;
    let current=document.createTextNode(segment.text);
    if(segment.marks?.italic){const em=document.createElement('em');em.appendChild(current);current=em}
    if(segment.marks?.underline){const u=document.createElement('u');u.appendChild(current);current=u}
    if(segment.marks?.bold){const strong=document.createElement('strong');strong.appendChild(current);current=strong}
    node.appendChild(current);
  }
}
function readInline(node){
  const out=[];
  const push=(text,marks)=>{if(text)out.push({text,marks:{...marks}})};
  const walk=(current,marks={})=>{
    current.childNodes.forEach((child,index)=>{
      if(child.nodeType===Node.TEXT_NODE){
        push(child.textContent||'',marks);
        return;
      }
      if(child.nodeType!==Node.ELEMENT_NODE)return;
      const tag=child.tagName;
      if(tag==='BR'){
        push('\n',marks);
        return;
      }
      const next={...marks};
      if(tag==='STRONG'||tag==='B')next.bold=true;
      if(tag==='EM'||tag==='I')next.italic=true;
      if(tag==='U')next.underline=true;
      if(tag==='DIV'||tag==='P'){
        if(index>0)push('\n',marks);
        walk(child,next);
        return;
      }
      walk(child,next);
    });
  };
  walk(node,{});
  return normalizeInline(out,node.textContent||'');
}
function collapseRichSelection(node,offset){
  const selection=window.getSelection?.();if(!selection)return;
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let pos=0,n;
  while((n=walker.nextNode())){const next=pos+n.textContent.length;if(offset<=next){
    const range=document.createRange();range.setStart(n,Math.max(0,offset-pos));range.collapse(true);
    selection.removeAllRanges();selection.addRange(range);node.focus();return;
  }pos=next}
  const range=document.createRange();range.selectNodeContents(node);range.collapse(false);
  selection.removeAllRanges();selection.addRange(range);node.focus();
}
function RichInput({id,text,inline,placeholder,className='',preserveNewlines=false,onChange,onSelect,onKeyDown,onInlineSelect}){
  const ref=useRef(null),renderKey=JSON.stringify(inline||[]),lastRender=useRef(''),pendingInput=useRef(null);
  useLayoutEffect(()=>{
    const node=ref.current;if(!node)return;
    if(lastRender.current!==renderKey){
      const saved=contentSelection(node);renderInline(node,inline);lastRender.current=renderKey;
      if(saved)requestAnimationFrame(()=>setContentSelection(node,saved.start,saved.end));
    }
  },[renderKey,inline]);
  const handleInput=(node)=>{
    let next=readInline(node),pending=pendingInput.current;
    if(pending){
      const insertedLength=pending.data.length;
      const replacementLength=pending.end-pending.start;
      const nextLength=inlineText(next).length;
      const expectedLength=inlineText(inline||[]).length-replacementLength+insertedLength;
      const delta=Math.max(0,nextLength-expectedLength);
      const insertedEnd=Math.max(pending.start,Math.min(nextLength,pending.start+insertedLength+delta));
      next=removeInlineMark(next,inlineText(next),pending.start,insertedEnd,'bold');
      next=removeInlineMark(next,inlineText(next),pending.start,insertedEnd,'italic');
      next=removeInlineMark(next,inlineText(next),pending.start,insertedEnd,'underline');
    }
    pendingInput.current=null;
    const nextText=inlineText(next),nextInline=inlineHasMarks(next)?next:undefined;
    lastRender.current=JSON.stringify(nextInline||[]);
    onChange?.(nextText,nextInline,node);
  };
  return <div className="rich-input-shell">
    <div ref={ref} data-editor-id={id} className={'editable plain-input rich-input '+className} contentEditable suppressContentEditableWarning data-placeholder={placeholder} data-placeholder-visible={text?'false':'true'} spellCheck={true}
      onFocus={()=>onSelect?.(ref.current)}
      onSelect={()=>onInlineSelect?.(ref.current)}
      onBeforeInput={e=>{
        if(e.isComposing)return;
        const range=contentSelection(e.currentTarget);if(!range)return;
        if(e.inputType==='insertText'||e.inputType==='insertReplacementText'||e.inputType==='insertFromPaste')
          pendingInput.current={start:range.start,end:range.end,data:String(e.data??'')};
        else pendingInput.current=null;
      }}
      onKeyDown={e=>{
        if(preserveNewlines&&e.key==='Enter'&&!e.isComposing){
          e.preventDefault();
          const node=e.currentTarget,selection=window.getSelection?.();
          if(selection?.rangeCount&&node.contains(selection.anchorNode)&&node.contains(selection.focusNode)){
            const range=selection.getRangeAt(0);
            range.deleteContents();
            const br=document.createTextNode('\n');
            range.insertNode(br);
            range.setStartAfter(br);range.collapse(true);
            selection.removeAllRanges();selection.addRange(range);
            pendingInput.current=null;
            handleInput(node);
            const caret=contentSelection(node);
            if(caret){
              requestAnimationFrame(()=>{
                if(ref.current) setContentSelection(ref.current,caret.start,caret.start);
              });
            }
          }
          return;
        }
        onKeyDown?.(e,e.currentTarget)
      }}
      onInput={e=>handleInput(e.currentTarget)}/>
    {!String(text??'').length&&<span className={'editor-placeholder rich-input-placeholder '+(className.includes('pullquote-text')?'pullquote-text':className.includes('expandable-blockquote-text')?'expandable-blockquote-text':'blockquote-text')} aria-hidden="true">{placeholder}</span>}
  </div>;
}
function Editable({id,text,placeholder='',className='',onChange,onKeyDown}){const ref=useRef(null);useEffect(()=>{const node=ref.current;if(!node)return;const value=String(text??'');if(node.textContent!==value)node.textContent=value},[text]);return <div ref={ref} data-editor-id={id} className={'editable '+className} contentEditable suppressContentEditableWarning data-placeholder={placeholder} data-placeholder-visible={text?'false':'true'} onInput={e=>onChange?.(e.currentTarget.textContent||'')} onKeyDown={e=>onKeyDown?.(e,e.currentTarget)}/>}

const inlineMenuItems=[
 {type:'regular',label:'Regular',Icon:Pilcrow},
 {type:'bold',label:'Bold',Icon:Bold},
 {type:'italic',label:'Italic',Icon:Italic},
 {type:'underline',label:'Underline',Icon:Underline},
 {type:'strikethrough',label:'Strikethrough',Icon:Strikethrough},
 {type:'spoiler',label:'Spoiler',Icon:EyeOff},
 {type:'code',label:'Monospace',Icon:Code2},
 {divider:true},
 {type:'subscript',label:'Subscript',Icon:Subscript},
 {type:'superscript',label:'Superscript',Icon:Superscript},
 {type:'marked',label:'Marked',Icon:Highlighter},
 {divider:true},
 {type:'url',label:'Link',Icon:Link2},
 {type:'mention',label:'Mention',Icon:AtSign},
 {type:'custom_emoji',label:'Custom Emoji',Icon:SmilePlus,soon:true},
 {type:'date_time',label:'Date & Time',Icon:Clock3},
 {type:'email',label:'Email',Icon:Mail},
 {type:'phone',label:'Phone',Icon:Phone},
 {type:'button',label:'Rich Button',Icon:MousePointerClick},
 {divider:true},
 {type:'hashtag',label:'Hashtag',Icon:Hash,soon:true},
 {type:'cashtag',label:'Cashtag',Icon:DollarSign,soon:true},
 {type:'bot_command',label:'Bot Command',Icon:Terminal,soon:true},
 {type:'bank_card',label:'Bank Card',Icon:CreditCard,soon:true},
 {divider:true},
 {type:'math',label:'Mathematical Expression',Icon:SquareSigma,soon:true},
 {type:'reference',label:'Reference',Icon:BookOpen,soon:true},
 {type:'anchor',label:'Anchor',Icon:Anchor,soon:true}
];

const menuItems=[
 {type:'paragraph',label:'Paragraph',Icon:Pilcrow},
 {type:'heading',size:1,label:'Heading 1',Icon:Heading1},
 {type:'heading',size:2,label:'Heading 2',Icon:Heading2},
 {type:'heading',size:3,label:'Heading 3',Icon:Heading3},
 {type:'heading',size:4,label:'Heading 4',Icon:Heading4},
 {type:'heading',size:5,label:'Heading 5',Icon:Heading5},
 {type:'heading',size:6,label:'Heading 6',Icon:Heading6},
 {divider:true},
 {type:'pre',label:'Code block',Icon:Code2},
 {type:'footer',label:'Footer',Icon:Pilcrow},
 {type:'blockquote',label:'Blockquote',Icon:Quote},
 {type:'expandable_blockquote',label:'Expandable blockquote',Icon:ChevronsDownUp},
 {type:'pullquote',label:'Pullquote',Icon:Quote},
 {divider:true},
 {type:'list-bullet',label:'Bulleted list',Icon:List},
 {type:'list-number',label:'Numbered list',Icon:ListOrdered},
 {type:'list-checklist',label:'Checklist',Icon:ListChecks},
 {type:'divider',label:'Divider',Icon:Minus}
];

export default function RichEditor({onSend}){const[doc,setDoc]=useState(createInitialDocument),[active,setActive]=useState(null),[open,setOpen]=useState(false),[inlineOpen,setInlineOpen]=useState(false),[inlineSelection,setInlineSelection]=useState(null),history=useRef(createHistory()),pendingFocus=useRef(null);
const hasContent=doc.blocks.some(b=>{if(b.type==='list')return b.items?.some(i=>String(i.text||'').trim());if(b.type==='divider')return true;return String(b.text||'').trim()});
useLayoutEffect(()=>{if(!pendingFocus.current)return;const target=pendingFocus.current;pendingFocus.current=null;requestAnimationFrame(()=>{const node=document.querySelector('[data-editor-id="'+CSS.escape(target.id)+'"]');if(!node)return;node.focus();if(typeof node.setSelectionRange==='function'){const value=String(node.value||'');const start=Math.max(0,Math.min(value.length,target.start??target.offset??0));const end=Math.max(start,Math.min(value.length,target.end??target.offset??start));node.setSelectionRange(start,end)}else focus(target.id,target.offset||target.start||0)})},[doc]);
function commit(next,focusTarget=null,opts={}){const blocks=[];next.blocks.forEach((b,i)=>{blocks.push(b);if(b.type==='spacing'&&next.blocks[i+1]?.type!=='paragraph')blocks.push({id:crypto.randomUUID(),type:'paragraph',text:'',structural:true})});const normalized=blocks.length===next.blocks.length?next:{...next,blocks};record(history.current,doc,opts);if(focusTarget)pendingFocus.current={id:focusTarget.id,start:focusTarget.start??focusTarget.offset??0,end:focusTarget.end??focusTarget.start??focusTarget.offset??0};setDoc(normalized)}
function captureInlineSelection(blockId,node){
  if(!node)return;
  const range=typeof node.selectionStart==='number'
    ? {start:Math.min(node.selectionStart,node.selectionEnd??node.selectionStart),end:Math.max(node.selectionStart,node.selectionEnd??node.selectionStart)}
    : contentSelection(node);
  if(!range){setInlineSelection(null);return}
  setInlineSelection(range.end>range.start?{blockId,...range}:null);
}
function textChange(id,text,inline){
  commit({...doc,blocks:doc.blocks.map(b=>{
    if(b.id!==id)return b;
    const nextText=Array.isArray(inline)?inlineText(inline):String(text??'');
    const next={...b,text:nextText};
    if(Array.isArray(inline)&&inline.length)next.inline=inline;else delete next.inline;
    return next;
  })},null,{coalesce:true});
}
function applyInlineFormatting(mark){
  if(!inlineSelection)return;
  const block=doc.blocks.find(b=>b.id===inlineSelection.blockId);
  if(!block||!['paragraph','heading','footer','blockquote','expandable_blockquote','pullquote'].includes(block.type))return;
  const result=applyInlineMark(block.inline,block.text||'',inlineSelection.start,inlineSelection.end,mark);
  const patch={...block,text:inlineText(result.inline,block.text||'')};
  if(inlineHasMarks(result.inline))patch.inline=result.inline;else delete patch.inline;
  commit({...doc,blocks:doc.blocks.map(b=>b.id===block.id?patch:b)},null,{coalesce:false});
  setInlineOpen(false);setInlineSelection(null);
  requestAnimationFrame(()=>{const node=document.querySelector('[data-editor-id="'+CSS.escape(block.id)+'"]');if(node)collapseRichSelection(node,inlineSelection.end)});
  telegramHaptic('light');
}
function applyBold(){applyInlineFormatting('bold')}
function applyItalic(){applyInlineFormatting('italic')}
function applyUnderline(){applyInlineFormatting('underline')}
function clearRegular(){
  if(!inlineSelection)return;
  const block=doc.blocks.find(b=>b.id===inlineSelection.blockId);
  if(!block||!['paragraph','heading','footer','blockquote','expandable_blockquote','pullquote'].includes(block.type))return;
  const value=block.text||'';
  let cleaned=removeInlineMark(block.inline,value,inlineSelection.start,inlineSelection.end,'bold');
  cleaned=removeInlineMark(cleaned,value,inlineSelection.start,inlineSelection.end,'italic');
  cleaned=removeInlineMark(cleaned,value,inlineSelection.start,inlineSelection.end,'underline');
  const patch={...block,text:inlineText(cleaned,value)};
  if(inlineHasMarks(cleaned))patch.inline=cleaned;else delete patch.inline;
  commit({...doc,blocks:doc.blocks.map(b=>b.id===block.id?patch:b)},null,{coalesce:false});
  setInlineOpen(false);setInlineSelection(null);
  requestAnimationFrame(()=>{const node=document.querySelector('[data-editor-id="'+CSS.escape(block.id)+'"]');if(node)collapseRichSelection(node,inlineSelection.end)});
  telegramHaptic('light');
}
function key(block,e,node){const off=selectionOffset(node);setActive(block.id);if(e.key==='Enter'){if(block.type==='blockquote'||block.type==='expandable_blockquote'||block.type==='pullquote')return;e.preventDefault();if(block.type==='paragraph'&&!String(block.text||'').trim()){const r=promoteEmptyParagraphToSpacing(doc,block.id);if(r.nextId){commit(r.doc,{id:r.nextId});setActive(r.nextId);telegramHaptic('light')}return}const r=splitTextBlock(doc,block.id,off);if(r.nextId)commit(r.doc,{id:r.nextId});return}if(e.key==='Backspace'&&off===0){e.preventDefault();if(block.structural){const i=doc.blocks.findIndex(x=>x.id===block.id),prev=doc.blocks[i-1];if(prev?.intentionalEmpty){commit(removeBlock(doc,prev.id),{id:block.id});telegramHaptic('light');return}}const r=mergePrevious(doc,block.id);if(r.doc!==doc)commit(r.doc,{id:r.focusId,offset:r.offset})}}
function listEnter(block,item,index,node){if(!item.text&&index===block.items.length-1){commit(removeBlock(doc,block.id));return}const off=selectionOffset(node);const r=splitListItem(doc,block.id,item.id,off);if(r.nextItemId)commit(r.doc,{id:r.nextItemId})}
function listBeforeInput(block,item,index,e,node){if(e.inputType!=='insertParagraph'&&e.inputType!=='insertLineBreak')return;if(e.cancelable){e.preventDefault();listEnter(block,item,index,node)}}
function listKey(block,item,index,e,node){const off=selectionOffset(node);if(e.key==='Enter'){e.preventDefault();listEnter(block,item,index,node)}else if(e.key==='Backspace'&&off===0&&!item.text&&block.items.length>1){e.preventDefault();commit(removeListItem(doc,block.id,item.id))}}
function deleteBlock(id){const index=doc.blocks.findIndex(b=>b.id===id);if(index<0)return;const next=removeBlock(doc,id);const target=next.blocks[index]||next.blocks[index-1]||next.blocks[0];commit(next);setActive(target?.id||null);telegramHaptic('light')}
function type(kind,o={}){const id=active||doc.blocks[0].id;const t=kind.startsWith('list-')?'list':kind;const style=kind==='list-number'?'number':kind==='list-checklist'?'checklist':'bullet';let next=changeType(doc,id,t,t==='list'?{style}:o);if(t!=='heading'&&t!=='paragraph')next=ensureEditableNeighbors(next,id);commit(next,{id});setOpen(false);telegramHaptic('light')}
function updateCredit(id,credit){commit({...doc,blocks:doc.blocks.map(b=>b.id===id?{...b,credit}:b)},null,{coalesce:true})}
function quoteKey(block,e,node){if(e.key!=='Backspace'||selectionOffset(node)!==0)return;e.preventDefault();const r=mergePrevious(doc,block.id);if(r.doc!==doc)commit(r.doc,{id:r.focusId,offset:r.offset})}
function resizeQuote(node){if(!node)return;node.style.height='auto';node.style.height=Math.max(27,node.scrollHeight)+'px'}
function creditKey(e){if(e.key==='Enter')e.preventDefault()}
function block(b){const canDelete=active===b.id;const del=<button type="button" className="block-delete" aria-label={`Delete ${b.type}`} onMouseDown={e=>e.preventDefault()} onClick={e=>{e.stopPropagation();deleteBlock(b.id)}}><Trash2 size={16}/></button>;if(b.type==='divider')return <div key={b.id} className="editor-block divider-editor-block" onClick={()=>setActive(b.id)}>{canDelete&&del}<div className="divider-block"/></div>;if(b.type==='pre')return <div key={b.id} className="editor-block pre-editor-block" onFocus={()=>setActive(b.id)}>{canDelete&&del}<div className="pre-wrap"><textarea data-editor-id={b.id} value={b.text} placeholder="Code…" onFocus={()=>setActive(b.id)} onChange={e=>commit({...doc,blocks:doc.blocks.map(x=>x.id===b.id?{...x,text:e.target.value}:x)})}/><select value={b.language} onChange={e=>commit({...doc,blocks:doc.blocks.map(x=>x.id===b.id?{...x,language:e.target.value}:x)})}><option value="">Plain text</option>{['javascript','typescript','python','html','css','json','bash','sql','java','c','cpp','csharp','go','rust','php','kotlin','swift','xml','yaml','markdown'].map(x=><option key={x} value={x}>{x}</option>)}</select></div></div>;if(b.type==='list')return <div className="editor-block list-editor-block" key={b.id} onFocus={()=>setActive(b.id)}>{canDelete&&del}<div className="list-block">{b.items.map((i,n)=><div className="list-item" key={i.id}><span className="marker">{b.style==='number'?n+1+'.':b.style==='checklist'?<input type="checkbox" checked={!!i.checked} onChange={e=>commit(updateListItem(doc,b.id,i.id,{checked:e.target.checked}))}/>: '•'}</span><PlainInput id={i.id} text={i.text} placeholder="List item" className="list-editable" singleLine onSelect={()=>setActive(b.id)} onBeforeInput={(e,n)=>listBeforeInput(b,i,n,e,n)} onChange={(t)=>commit(updateListItem(doc,b.id,i.id,{text:String(t||'').replace(/[\\r\\n]/g,'')}),null,{coalesce:true})} onKeyDown={(e,n)=>listKey(b,i,n,e,n)}/></div>)}</div></div>;
const common={id:b.id,text:b.text||'',placeholder:b.structural?'Write something…':b.type==='heading'?'Heading '+b.size:b.type==='footer'?'Footer':b.type==='blockquote'?'Blockquote':b.type==='expandable_blockquote'?'Expandable Blockquote':b.type==='pullquote'?'Pull Quote':'Write something…',className:b.type==='heading'?'heading h-'+b.size:b.type==='footer'?'footer':''};
const textInput=()=>b.inline?<RichInput {...common} inline={b.inline} onSelect={()=>setActive(b.id)} onInlineSelect={node=>captureInlineSelection(b.id,node)} onChange={(text,inline)=>textChange(b.id,text,inline)} onKeyDown={(e,node)=>key(b,e,node)}/>:<PlainInput {...common} onSelect={()=>setActive(b.id)} onInlineSelect={node=>captureInlineSelection(b.id,node)} onChange={(text)=>textChange(b.id,text)} onKeyDown={(e,node)=>key(b,e,node)}/>;if(b.type==='spacing')return <div key={b.id} className={'editor-block spacing-editor-block '+(active===b.id?'active':'')} onClick={()=>setActive(b.id)}>{canDelete&&del}<div className="spacing-control" onClick={e=>e.stopPropagation()}><button type="button" aria-label="Decrease spacing" disabled={b.lines<=1} onClick={()=>commit(updateSpacing(doc,b.id,b.lines-1))}><MinusCircle size={18}/></button><span>{b.lines} {b.lines===1?'line':'lines'}</span><button type="button" aria-label="Increase spacing" disabled={b.lines>=8} onClick={()=>commit(updateSpacing(doc,b.id,b.lines+1))}><Plus size={18}/></button></div></div>;if(b.type==='blockquote'||b.type==='expandable_blockquote'||b.type==='pullquote')return <div key={b.id} className={'editor-block text-editor-block '+(b.type==='blockquote'?'blockquote-editor-block ':b.type==='expandable_blockquote'?'expandable-blockquote-editor-block ':'pullquote-editor-block ')+(active===b.id?'active':'')} onFocus={()=>setActive(b.id)}>{canDelete&&del}<RichInput {...common} preserveNewlines inline={b.inline||[{text:b.text||'',marks:{}}]} className={'quote-editable '+(b.type==='pullquote'?'pullquote-text':b.type==='expandable_blockquote'?'expandable-blockquote-text':'blockquote-text')} onSelect={()=>setActive(b.id)} onInlineSelect={node=>captureInlineSelection(b.id,node)} onChange={(text,inline)=>textChange(b.id,text,inline)} onKeyDown={(e,node)=>{if(e.key==='Backspace'&&selectionOffset(node)===0){e.preventDefault();quoteKey(b,e,node);return}key(b,e,node)}}/><div className={'quote-credit-wrap '+(b.type==='pullquote'?'pullquote-credit':b.type==='expandable_blockquote'?'expandable-blockquote-credit':'blockquote-credit')}><div className="quote-credit-field">{!String(b.credit||'').length&&<span className="quote-credit-placeholder" aria-hidden="true">Credit (optional)</span>}<Editable id={b.id+'-credit'} text={b.credit||''} placeholder="" className="quote-credit" onChange={t=>updateCredit(b.id,t)} onKeyDown={creditKey}/></div></div></div>;
return <div key={b.id} className={'editor-block text-editor-block '+(b.type==='heading'?'heading-editor-block ':b.type==='footer'?'footer-editor-block ':'')+(active===b.id?'active':'')} onFocus={()=>setActive(b.id)}>{canDelete&&del}{textInput()}</div>}
function menu(){const activeBlock=doc.blocks.find(b=>b.id===active)||doc.blocks[0];return <div className="format-menu" role="menu">{menuItems.map((item,i)=>item.divider?<div className="format-divider" key={'d'+i}/>:<button type="button" key={item.type+(item.size||'')} className={activeBlock?.type===item.type&&(!item.size||activeBlock?.size===item.size)?'selected':''} role="menuitem" onMouseDown={e=>e.preventDefault()} onClick={()=>type(item.type,{size:item.size})}><item.Icon size={19}/><span>{item.label}</span>{activeBlock?.type===item.type&&(!item.size||activeBlock?.size===item.size)&&<Check size={17} className="menu-check"/>}</button>)}</div>}
function inlineMenu(){return <div className="inline-menu" role="menu">{inlineMenuItems.map((item,i)=>item.divider?<div className="format-divider" key={'id'+i}/>:<button type="button" key={item.type} className={'inline-menu-item '+(item.soon?'soon-item':'')} disabled={!!item.soon} role="menuitem" aria-disabled={item.soon||undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(item.soon)return;if(item.type==='bold')applyBold();else if(item.type==='italic')applyItalic();else if(item.type==='regular')clearRegular();else if(item.type==='underline')applyUnderline();else telegramHaptic('light')}}><item.Icon size={18}/><span>{item.label}</span>{item.soon&&<small className="soon-badge">Soon</small>}</button>)}</div>}
return <div className="editor-shell"><div className="topbar"><button className="icon-button history-button" disabled={!history.current.past.length} onClick={()=>{const n=undo(history.current,doc);if(n){setDoc(n);telegramHaptic('light')}}} aria-label="Undo"><Undo2 size={19}/></button><button className="icon-button history-button" disabled={!history.current.future.length} onClick={()=>{const n=redo(history.current,doc);if(n){setDoc(n);telegramHaptic('light')}}} aria-label="Redo"><Redo2 size={19}/></button></div><main className="document-area">{doc.blocks.map(block)}</main><div className="composer-bar"><div className="format-wrap inline-format-wrap"><button type="button" className={'tool-button inline-format-button '+(inlineOpen?'active':'')} disabled={!inlineSelection} onClick={()=>{if(!inlineSelection)return;setInlineOpen(x=>!x);setOpen(false);telegramHaptic('light')}} aria-label="Inline formatting" aria-expanded={inlineOpen} title={inlineSelection?'Inline formatting':'Select text to format'}><span className="bold-glyph">B</span></button>{inlineOpen&&inlineSelection&&inlineMenu()}</div><div className="format-wrap"><button className={'tool-button format-button '+(open?'active':'')} onClick={()=>{setOpen(x=>!x);setInlineOpen(false);telegramHaptic('light')}} aria-label="Block type" aria-expanded={open}><span className="heading-glyph">H</span></button>{open&&menu()}</div><button className={'send-composer-button '+(hasContent?'visible':'')} onClick={()=>{if(!hasContent)return;telegramHaptic('light');onSend?.(doc)}} aria-label="Send rich message" aria-hidden={!hasContent} tabIndex={hasContent?0:-1} disabled={!hasContent}><SendHorizontal size={20}/></button></div></div>}
// Quote blocks intentionally keep native Enter behavior; DOM parsing preserves multiline rich text.
export {serializeDocument};
