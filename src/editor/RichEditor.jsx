import React,{useEffect,useLayoutEffect,useRef,useState}from'react';
import{Code2,Heading1,Heading2,Heading3,Heading4,Heading5,Heading6,List,ListChecks,ListOrdered,Minus,Pilcrow,Quote,ChevronsDownUp,Redo2,Undo2,Check,SendHorizontal,Trash2,Plus,MinusCircle,Bold,Italic,Underline,Strikethrough,EyeOff,Subscript,Superscript,Highlighter,Link2,AtSign,SmilePlus,Clock3,Mail,Phone,MousePointerClick,Hash,DollarSign,Terminal,CreditCard,SquareSigma,Anchor,BookOpen}from'lucide-react';
import{createInitialDocument}from'../document/schema.js';import{inlineText,normalizeInline,applyInlineMark,removeInlineMark,inlineHasMarks,sliceInline}from'../document/inline.js';import{changeType,mergePrevious,removeBlock,splitListItem,updateListItem,removeListItem,splitTextBlock,ensureEditableNeighbors,promoteEmptyParagraphToSpacing,updateSpacing}from'../document/operations.js';import{createHistory,record,redo,undo}from'../document/history.js';import{serializeDocument}from'../telegram/serializer.js';import{telegramHaptic}from'../telegram/webApp.js';

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
  const ref=useRef(null),renderKey=JSON.stringify(inline||[]),lastRender=useRef('');
  useLayoutEffect(()=>{
    const node=ref.current;if(!node)return;
    if(lastRender.current!==renderKey){
      const saved=contentSelection(node);
      renderInline(node,inline);
      lastRender.current=renderKey;
      if(saved)requestAnimationFrame(()=>{if(ref.current)setContentSelection(ref.current,saved.start,saved.end)});
    }
  },[renderKey,inline]);
  const handleInput=(node)=>{
    let next=readInline(node);
    const nextText=inlineText(next);
    const nextInline=inlineHasMarks(next)?next:undefined;
    lastRender.current=JSON.stringify(nextInline||[]);
    onChange?.(nextText,nextInline,node);
  };
  return <div className="rich-input-shell">
    <div ref={ref} data-editor-id={id} className={'editable plain-input rich-input '+className} contentEditable suppressContentEditableWarning data-placeholder={placeholder} data-placeholder-visible={text?'false':'true'} spellCheck={true}
      onFocus={()=>onSelect?.(ref.current)}
      onSelect={()=>onInlineSelect?.(ref.current)}
      onBeforeInput={e=>{
        if(e.isComposing)return;
        const range=contentSelection(e.currentTarget);
        if(!range)return;
        if(e.inputType==='insertText'||e.inputType==='insertReplacementText'||e.inputType==='insertFromPaste'){
          const data=String(e.data??'');
          if(!data)return;
          // Remember the range only for normal text insertion; the browser owns
          // paragraph/line-break insertion so mobile contenteditable caret behavior
          // remains native.
        }
      }}
      onKeyDown={e=>onKeyDown?.(e,e.currentTarget)}
      onInput={e=>handleInput(e.currentTarget)}/>
    {!String(text??'').length&&<span className={'editor-placeholder rich-input-placeholder quote-placeholder '+(className.includes('pullquote-text')?'pullquote-text':className.includes('expandable-blockquote-text')?'expandable-blockquote-text':'blockquote-text')} aria-hidden="true">{placeholder}</span>}
  </div>;
}
function block(b){const canDelete=active===b.id;const del=<button type="button" className="block-delete" aria-label={`Delete ${b.type}`} onMouseDown={e=>e.preventDefault()} onClick={e=>{e.stopPropagation();deleteBlock(b.id)}}><Trash2 size={16}/></button>;if(b.type==='divider')return <div key={b.id} className="editor-block divider-editor-block" onClick={()=>setActive(b.id)}>{canDelete&&del}<div className="divider-block"/></div>;if(b.type==='pre')return <div key={b.id} className="editor-block pre-editor-block" onFocus={()=>setActive(b.id)}>{canDelete&&del}<div className="pre-wrap"><textarea data-editor-id={b.id} value={b.text} placeholder="Code…" onFocus={()=>setActive(b.id)} onChange={e=>commit({...doc,blocks:doc.blocks.map(x=>x.id===b.id?{...x,text:e.target.value}:x)})}/><select value={b.language} onChange={e=>commit({...doc,blocks:doc.blocks.map(x=>x.id===b.id?{...x,language:e.target.value}:x)})}><option value="">Plain text</option>{['javascript','typescript','python','html','css','json','bash','sql','java','c','cpp','csharp','go','rust','php','kotlin','swift','xml','yaml','markdown'].map(x=><option key={x} value={x}>{x}</option>)}</select></div></div>;if(b.type==='list')return <div className="editor-block list-editor-block" key={b.id} onFocus={()=>setActive(b.id)}>{canDelete&&del}<div className="list-block">{b.items.map((i,n)=><div className="list-item" key={i.id}><span className="marker">{b.style==='number'?n+1+'.':b.style==='checklist'?<input type="checkbox" checked={!!i.checked} onChange={e=>commit(updateListItem(doc,b.id,i.id,{checked:e.target.checked}))}/>: '•'}</span><PlainInput id={i.id} text={i.text} placeholder="List item" className="list-editable" singleLine onSelect={()=>setActive(b.id)} onBeforeInput={(e,n)=>listBeforeInput(b,i,n,e,n)} onChange={(t)=>commit(updateListItem(doc,b.id,i.id,{text:String(t||'').replace(/[\\r\\n]/g,'')}),null,{coalesce:true})} onKeyDown={(e,n)=>listKey(b,i,n,e,n)}/></div>)}</div></div>;
const common={id:b.id,text:b.text||'',placeholder:b.structural?'Write something…':b.type==='heading'?'Heading '+b.size:b.type==='footer'?'Footer':b.type==='blockquote'?'Blockquote':b.type==='expandable_blockquote'?'Expandable Blockquote':b.type==='pullquote'?'Pull Quote':'Write something…',className:b.type==='heading'?'heading h-'+b.size:b.type==='footer'?'footer':''};
const textInput=()=>b.inline?<RichInput {...common} inline={b.inline} onSelect={()=>setActive(b.id)} onInlineSelect={node=>captureInlineSelection(b.id,node)} onChange={(text,inline)=>textChange(b.id,text,inline)} onKeyDown={(e,node)=>key(b,e,node)}/>:<PlainInput {...common} onSelect={()=>setActive(b.id)} onInlineSelect={node=>captureInlineSelection(b.id,node)} onChange={(text)=>textChange(b.id,text)} onKeyDown={(e,node)=>key(b,e,node)}/>;if(b.type==='spacing')return <div key={b.id} className={'editor-block spacing-editor-block '+(active===b.id?'active':'')} onClick={()=>setActive(b.id)}>{canDelete&&del}<div className="spacing-control" onClick={e=>e.stopPropagation()}><button type="button" aria-label="Decrease spacing" disabled={b.lines<=1} onClick={()=>commit(updateSpacing(doc,b.id,b.lines-1))}><MinusCircle size={18}/></button><span>{b.lines} {b.lines===1?'line':'lines'}</span><button type="button" aria-label="Increase spacing" disabled={b.lines>=8} onClick={()=>commit(updateSpacing(doc,b.id,b.lines+1))}><Plus size={18}/></button></div></div>;if(b.type==='blockquote'||b.type==='expandable_blockquote'||b.type==='pullquote')return <div key={b.id} className={'editor-block text-editor-block '+(b.type==='blockquote'?'blockquote-editor-block ':b.type==='expandable_blockquote'?'expandable-blockquote-editor-block ':'pullquote-editor-block ')+(active===b.id?'active':'')} onFocus={()=>setActive(b.id)}>{canDelete&&del}<RichInput {...common} preserveNewlines inline={b.inline||[{text:b.text||'',marks:{}}]} className={'quote-editable '+(b.type==='pullquote'?'pullquote-text':b.type==='expandable_blockquote'?'expandable-blockquote-text':'blockquote-text')} onSelect={()=>setActive(b.id)} onInlineSelect={node=>captureInlineSelection(b.id,node)} onChange={(text,inline)=>textChange(b.id,text,inline)} onKeyDown={(e,node)=>{if(e.key==='Backspace'&&selectionOffset(node)===0){e.preventDefault();quoteKey(b,e,node);return}key(b,e,node)}}/><div className={'quote-credit-wrap '+(b.type==='pullquote'?'pullquote-credit':b.type==='expandable_blockquote'?'expandable-blockquote-credit':'blockquote-credit')}><div className="quote-credit-field">{!String(b.credit||'').length&&<span className="quote-credit-placeholder" aria-hidden="true">Credit (optional)</span>}<Editable id={b.id+'-credit'} text={b.credit||''} placeholder="" className="quote-credit" onChange={t=>updateCredit(b.id,t)} onKeyDown={creditKey}/></div></div></div>;
return <div key={b.id} className={'editor-block text-editor-block '+(b.type==='heading'?'heading-editor-block ':b.type==='footer'?'footer-editor-block ':'')+(active===b.id?'active':'')} onFocus={()=>setActive(b.id)}>{canDelete&&del}{textInput()}</div>}
function menu(){const activeBlock=doc.blocks.find(b=>b.id===active)||doc.blocks[0];return <div className="format-menu" role="menu">{menuItems.map((item,i)=>item.divider?<div className="format-divider" key={'d'+i}/>:<button type="button" key={item.type+(item.size||'')} className={activeBlock?.type===item.type&&(!item.size||activeBlock?.size===item.size)?'selected':''} role="menuitem" onMouseDown={e=>e.preventDefault()} onClick={()=>type(item.type,{size:item.size})}><item.Icon size={19}/><span>{item.label}</span>{activeBlock?.type===item.type&&(!item.size||activeBlock?.size===item.size)&&<Check size={17} className="menu-check"/>}</button>)}</div>}
function inlineMenu(){return <div className="inline-menu" role="menu">{inlineMenuItems.map((item,i)=>item.divider?<div className="format-divider" key={'id'+i}/>:<button type="button" key={item.type} className={'inline-menu-item '+(item.soon?'soon-item':'')} disabled={!!item.soon} role="menuitem" aria-disabled={item.soon||undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(item.soon)return;if(item.type==='bold')applyBold();else if(item.type==='italic')applyItalic();else if(item.type==='regular')clearRegular();else if(item.type==='underline')applyUnderline();else telegramHaptic('light')}}><item.Icon size={18}/><span>{item.label}</span>{item.soon&&<small className="soon-badge">Soon</small>}</button>)}</div>}
return <div className="editor-shell"><div className="topbar"><button className="icon-button history-button" disabled={!history.current.past.length} onClick={()=>{const n=undo(history.current,doc);if(n){setDoc(n);telegramHaptic('light')}}} aria-label="Undo"><Undo2 size={19}/></button><button className="icon-button history-button" disabled={!history.current.future.length} onClick={()=>{const n=redo(history.current,doc);if(n){setDoc(n);telegramHaptic('light')}}} aria-label="Redo"><Redo2 size={19}/></button></div><main className="document-area">{doc.blocks.map(block)}</main><div className="composer-bar"><div className="format-wrap inline-format-wrap"><button type="button" className={'tool-button inline-format-button '+(inlineOpen?'active':'')} disabled={!inlineSelection} onClick={()=>{if(!inlineSelection)return;setInlineOpen(x=>!x);setOpen(false);telegramHaptic('light')}} aria-label="Inline formatting" aria-expanded={inlineOpen} title={inlineSelection?'Inline formatting':'Select text to format'}><span className="bold-glyph">B</span></button>{inlineOpen&&inlineSelection&&inlineMenu()}</div><div className="format-wrap"><button className={'tool-button format-button '+(open?'active':'')} onClick={()=>{setOpen(x=>!x);setInlineOpen(false);telegramHaptic('light')}} aria-label="Block type" aria-expanded={open}><span className="heading-glyph">H</span></button>{open&&menu()}</div><button className={'send-composer-button '+(hasContent?'visible':'')} onClick={()=>{if(!hasContent)return;telegramHaptic('light');onSend?.(doc)}} aria-label="Send rich message" aria-hidden={!hasContent} tabIndex={hasContent?0:-1} disabled={!hasContent}><SendHorizontal size={20}/></button></div></div>}
// Quote blocks intentionally keep native Enter behavior; DOM parsing preserves multiline rich text.
export {serializeDocument};
