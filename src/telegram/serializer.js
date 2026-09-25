function plain(value){return typeof value==='string'?value:'';}
function children(node){return [...node.childNodes].flatMap(richFromNode);}
function richFromNode(node){
  if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||'';
  if(node.nodeType!==Node.ELEMENT_NODE)return '';
  const el=node,type=el.dataset?.rich,text=()=>children(el);
  if(type==='spoiler'||type==='marked'||type==='subscript'||type==='superscript')return{type,text:text()};
  if(type==='custom_emoji')return{type:'custom_emoji',custom_emoji_id:el.dataset.id||'',alternative_text:el.textContent||'🙂'};
  if(type==='mathematical_expression')return{type:'mathematical_expression',expression:el.dataset.expression||el.textContent||''};
  if(type==='date_time')return{type:'date_time',text:text(),unix_time:Number(el.dataset.unix)||0,...(el.dataset.format?{date_time_format:el.dataset.format}:{})};
  if(type==='email_address'||type==='phone_number'||type==='bank_card_number')return{type,text:text(),[type==='email_address'?'email_address':type==='phone_number'?'phone_number':'bank_card_number']:el.dataset.value||el.textContent||''};
  if(type==='mention'||type==='hashtag'||type==='cashtag'||type==='bot_command')return{type,text:text()};
  const tag=el.tagName.toLowerCase(),t=text();
  if(tag==='strong'||tag==='b')return{type:'bold',text:t};
  if(tag==='em'||tag==='i')return{type:'italic',text:t};
  if(tag==='u'||tag==='ins')return{type:'underline',text:t};
  if(tag==='s'||tag==='strike'||tag==='del')return{type:'strikethrough',text:t};
  if(tag==='code')return{type:'code',text:t};
  if(tag==='sub')return{type:'subscript',text:t};
  if(tag==='sup')return{type:'superscript',text:t};
  if(tag==='mark')return{type:'marked',text:t};
  if(tag==='a'){const href=el.getAttribute('href')||'';if(href.startsWith('mailto:'))return{type:'email_address',text:t,email_address:href.slice(7)};if(href.startsWith('tel:'))return{type:'phone_number',text:t,phone_number:href.slice(4)};return{type:'url',text:t,url:href};}
  return t;
}
function rich(value){const raw=plain(value);if(typeof document==='undefined')return raw;const box=document.createElement('div');box.innerHTML=raw;const parts=[...box.childNodes].flatMap(richFromNode);return parts.length===1?parts[0]:parts;}
export function serializeBlock(b){switch(b.type){
case'paragraph':case'footer':return{type:b.type,text:rich(b.text)};
case'heading':return{type:'heading',text:rich(b.text),size:b.size};
case'pre':return{type:'pre',text:rich(b.text),...(b.language?{language:b.language}:{})};
case'divider':return{type:'divider'};
case'spacing':return Array.from({length:Math.max(1,Math.min(8,Number(b.lines)||1))},()=>({type:'paragraph',text:''}));
case'list':return{type:'list',items:b.items.filter(i=>String(i.text||'').replace(/<[^>]*>/g,'').trim()).map((i,n)=>{const o={blocks:[{type:'paragraph',text:rich(i.text)}]};if(b.style==='number'){o.type='1';o.value=n+1;}if(b.style==='checklist'){o.has_checkbox=true;o.is_checked=!!i.checked;}return o;})};
case'blockquote':return{type:'blockquote',blocks:String(b.text||'').split('\\n').map(line=>({type:'paragraph',text:rich(line)})),...(b.credit?{credit:rich(b.credit)}:{})};
case'expandable_blockquote':return{type:'expandable_blockquote',text:rich(b.text),...(b.credit?{credit:rich(b.credit)}:{})};
case'pullquote':return{type:'pullquote',text:rich(b.text),...(b.credit?{credit:rich(b.credit)}:{})};
default:throw new Error('Unsupported block type: '+b.type);}}
export function serializeDocument(d){return d.blocks.filter(b=>!(b.type==='paragraph'&&b.structural&&!String(b.text||'').replace(/<[^>]*>/g,'').trim())).flatMap(serializeBlock).filter(b=>b.type==='divider'||b.type==='paragraph'||b.text||b.items?.length);}
