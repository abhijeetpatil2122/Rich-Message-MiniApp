function plain(value){return typeof value==='string'?value:'';}
function plainStoredText(value){return plain(value).replace(/<[^>]*>/g,'');}
function wrapRichText(text,marks){
  let value=text;
  if(marks?.underline)value={type:'underline',text:value};
  if(marks?.italic)value={type:'italic',text:value};
  if(marks?.bold)value={type:'bold',text:value};
  return value;
}
function richTextLines(value,inline){
  const source=Array.isArray(inline)?inline:[{text:plain(value),marks:{}}];
  const lines=[[]];
  for(const segment of source){
    const parts=String(segment?.text??'').split('\n');
    parts.forEach((part,index)=>{if(part)lines[lines.length-1].push(wrapRichText(part,segment?.marks||{}));if(index<parts.length-1)lines.push([])});
  }
  return lines.map(parts=>({type:'paragraph',text:parts.length===1&&typeof parts[0]==='string'?parts[0]:parts}));
}
function richText(value,inline){
  if(!Array.isArray(inline)||!inline.length)return plainStoredText(value);
  const parts=[];
  for(const segment of inline){
    const text=plain(segment?.text);if(!text)continue;
    parts.push(wrapRichText(text,segment?.marks||{}));
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
case'blockquote':return{type:'blockquote',blocks:richTextLines(b.text,b.inline),...(b.credit?{credit:plainStoredText(b.credit)}:{})};
case'expandable_blockquote':return{type:'expandable_blockquote',text:richText(b.text,b.inline),...(b.credit?{credit:plainStoredText(b.credit)}:{})};
case'pullquote':return{type:'pullquote',text:richText(b.text,b.inline),...(b.credit?{credit:plainStoredText(b.credit)}:{})};
default:throw new Error('Unsupported block type: '+b.type);}}
export function serializeDocument(d){return{version:1,blocks:d.blocks.filter(b=>!(b.type==='paragraph'&&b.structural&&!String(b.text||'').trim())).flatMap(serializeBlock).filter(b=>b.type==='divider'||b.type==='paragraph'||b.type==='blockquote'||b.type==='expandable_blockquote'||b.type==='pullquote'||b.text||b.items?.length)}}
