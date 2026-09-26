function plain(value){return typeof value==='string'?value:'';}
function plainStoredText(value){return plain(value).replace(/<[^>]*>/g,'');}
function richText(value,inline){
  if(!Array.isArray(inline)||!inline.length)return plainStoredText(value);
  const parts=[];
  for(const segment of inline){
    const text=plain(segment?.text);
    if(!text)continue;
    parts.push(segment?.marks?.bold?{type:'bold',text}:text);
  }
  if(!parts.length)return '';
  if(parts.length===1&&typeof parts[0]==='string')return parts[0];
  return parts;
}
export function serializeBlock(b){switch(b.type){
case'paragraph':case'footer':return{type:b.type,text:richText(b.text,b.inline)};
case'heading':return{type:'heading',text:richText(b.text,b.inline),size:b.size};
case'pre':return{type:'pre',text:richText(b.text,b.inline),...(b.language?{language:b.language}:{})};
case'divider':return{type:'divider'};
case'spacing':return Array.from({length:Math.max(1,Math.min(8,Number(b.lines)||1))},()=>({type:'paragraph',text:''}));
case'list':return{type:'list',items:(b.items||[]).filter(i=>plainStoredText(i.text).trim()).map((i,n)=>{const o={blocks:[{type:'paragraph',text:plainStoredText(i.text)}]};if(b.style==='number'){o.type='1';o.value=n+1;}if(b.style==='checklist'){o.has_checkbox=true;o.is_checked=!!i.checked;}return o;})};
case'blockquote':return{type:'blockquote',blocks:String(b.text||'').split('\n').map(line=>({type:'paragraph',text:plainStoredText(line)})),...(b.credit?{credit:plainStoredText(b.credit)}:{})};
case'expandable_blockquote':return{type:'expandable_blockquote',text:plainStoredText(b.text),...(b.credit?{credit:plainStoredText(b.credit)}:{})};
case'pullquote':return{type:'pullquote',text:plainStoredText(b.text),...(b.credit?{credit:plainStoredText(b.credit)}:{})};
default:throw new Error('Unsupported block type: '+b.type);}}
export function serializeDocument(d){return{version:1,blocks:d.blocks.filter(b=>!(b.type==='paragraph'&&b.structural&&!String(b.text||'').trim())).flatMap(serializeBlock).filter(b=>b.type==='divider'||b.type==='paragraph'||b.text||b.items?.length)}}
