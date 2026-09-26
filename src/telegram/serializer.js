function plain(value){return typeof value==='string'?value:'';}
function plainStoredText(value){let s=plain(value);for(let i=0;i<3;i++){const box=document.createElement('div');box.innerHTML=s;const next=box.textContent||'';if(next===s)break;s=next}return s.replace(/<\/?(?:div|p|br|span|font|b|i|u|strong|em)[^>]*>/gi,'')}
function children(node){return [...node.childNodes].flatMap(richFromNode);}
function richFromNode(node){
  if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||'';
  if(node.nodeType!==Node.ELEMENT_NODE)return '';
  const el=node,type=el.dataset?.rich,text=()=>children(el);
  if(type==='spoiler'||type==='marked'||type==='subscript'||type==='superscript')return{type,text:text()};
  if(type==='custom_emoji')return{type:'custom_emoji',custom_emoji_id:el.dataset.id||'',alternative_text:el.textContent||'🙂'};
  if(type==='date_time')return{type:'date_time',text:text(),unix_time:Number(el.dataset.unix)||0,...(el.dataset.format?{date_time_format:el.dataset.format}:{})};
  if(type==='email_address'||type==='phone_number'||type==='bank_card_number')return{type,text:text(),[type==='email_address'?'email_address':type==='phone_number'?'phone_number':'bank_card_number']:el.dataset.value||el.textContent||''};
  if(type==='mention')return{type,text:text(),username:el.dataset.value||el.textContent||''};
  if(type==='hashtag')return{type,text:text(),hashtag:el.dataset.value||el.textContent||''};
  if(type==='cashtag')return{type,text:text(),cashtag:el.dataset.value||el.textContent||''};
  if(type==='bot_command')return{type,text:text(),bot_command:el.dataset.value||el.textContent||''};
  if(type==='button'){const a=el.dataset.buttonAction||'url',v=el.dataset.buttonValue||'',button={text:el.textContent||'',style:el.dataset.buttonStyle||'primary'};if(a==='url')button.url=v;else if(a==='callback_data')button.callback_data=v;else if(a==='web_app')button.web_app={url:v};else if(a==='login_url')button.login_url={url:v};else if(a==='copy_text')button.copy_text={text:v};else button.disabled={};return{type:'button',button}};
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
function richFromMarks(value,marks){const s=plainStoredText(value);if(!Array.isArray(marks)||!marks.length)return s;const list=marks.filter(m=>m&&Number(m.end)>Number(m.start)).map(m=>({...m,start:Math.max(0,Math.min(s.length,Number(m.start))),end:Math.max(0,Math.min(s.length,Number(m.end)))})).filter(m=>m.end>m.start);if(!list.length)return s;const points=new Set([0,s.length]);list.forEach(m=>{points.add(m.start);points.add(m.end)});const sorted=[...points].sort((a,b)=>a-b),out=[];for(let i=0;i<sorted.length-1;i++){const start=sorted[i],end=sorted[i+1],chunk=s.slice(start,end);if(!chunk)continue;const active=list.filter(m=>m.start<=start&&m.end>=end).sort((a,b)=>a.start-b.start||b.end-a.end);let node=chunk;for(let j=active.length-1;j>=0;j--){const m=active[j],type=m.type;if(type==='button')node={type:'button',button:{text:node,style:m.style||'primary',...(m.action==='url'?{url:m.value||''}:m.action==='callback_data'?{callback_data:m.value||''}:m.action==='web_app'?{web_app:{url:m.value||''}}:m.action==='login_url'?{login_url:{url:m.value||''}}:m.action==='copy_text'?{copy_text:{text:m.value||''}}:{disabled:{}})}}else if(type==='url')node={type,text:node,url:m.value||''};else if(type==='email_address')node={type,text:node,email_address:m.value||''};else if(type==='phone_number')node={type,text:node,phone_number:m.value||''};else if(type==='bank_card_number')node={type,text:node,bank_card_number:m.value||''};else if(type==='mention')node={type,text:node,username:m.value||''};else if(type==='hashtag')node={type,text:node,hashtag:m.value||''};else if(type==='cashtag')node={type,text:node,cashtag:m.value||''};else if(type==='bot_command')node={type,text:node,bot_command:m.value||''};else node={type,text:node}}out.push(node)}return out.length===1?out[0]:out}
function rich(value){const raw=plain(value);if(typeof document==='undefined')return raw;const box=document.createElement('div');box.innerHTML=raw;const parts=[...box.childNodes].flatMap(richFromNode);return parts.length===1?parts[0]:parts;}
function blockRichText(b){return plainStoredText(b.text)}
export function serializeBlock(b){switch(b.type){
case'paragraph':case'footer':return{type:b.type,text:plainStoredText(b.text)};
case'heading':return{type:'heading',text:plainStoredText(b.text),size:b.size};
case'pre':return{type:'pre',text:plainStoredText(b.text),...(b.language?{language:b.language}:{})};
case'divider':return{type:'divider'};
case'spacing':return Array.from({length:Math.max(1,Math.min(8,Number(b.lines)||1))},()=>({type:'paragraph',text:''}));
case'list':return{type:'list',items:b.items.filter(i=>plainStoredText(i.text).trim()).map((i,n)=>{const o={blocks:[{type:'paragraph',text:plainStoredText(i.text)}]};if(b.style==='number'){o.type='1';o.value=n+1;}if(b.style==='checklist'){o.has_checkbox=true;o.is_checked=!!i.checked;}return o;})};
case'blockquote':return{type:'blockquote',blocks:String(b.text||'').split('\n').map(line=>({type:'paragraph',text:rich(line)})),...(b.credit?{credit:rich(b.credit)}:{})};
case'expandable_blockquote':return{type:'expandable_blockquote',text:plainStoredText(b.text),...(b.credit?{credit:rich(b.credit)}:{})};
case'pullquote':return{type:'pullquote',text:plainStoredText(b.text),...(b.credit?{credit:rich(b.credit)}:{})};
default:throw new Error('Unsupported block type: '+b.type);}}
export function serializeDocument(d){return{version:1,blocks:d.blocks.filter(b=>!(b.type==='paragraph'&&b.structural&&!String(b.text||'').replace(/<[^>]*>/g,'').trim())).flatMap(serializeBlock).filter(b=>b.type==='divider'||b.type==='paragraph'||b.text||b.items?.length)}}
