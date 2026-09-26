const RICH_TEXT=new Set(['bold','italic','underline','strikethrough','spoiler','date_time','text_mention','subscript','superscript','marked','code','custom_emoji','mathematical_expression','url','email_address','phone_number','bank_card_number','mention','hashtag','cashtag','bot_command','button','anchor','anchor_link','reference','reference_link']);
const WRAPPED=new Set(['bold','italic','underline','strikethrough','spoiler','date_time','text_mention','subscript','superscript','marked','code','url','email_address','phone_number','bank_card_number','mention','hashtag','cashtag','bot_command','anchor_link','reference','reference_link']);
export function validateDocument(d){
 if(!d||d.version!==1||!Array.isArray(d.blocks)||d.blocks.length>500)throw new Error('Invalid Rich Message document.');
 const rt=(v,n=16)=>{
  if(typeof v==='string')return v;
  if(n<1)throw new Error('Rich text is nested too deeply.');
  if(Array.isArray(v))return v.flatMap(x=>{const r=rt(x,n-1);return Array.isArray(r)?r:[r];});
  if(!v||typeof v!=='object'||!RICH_TEXT.has(v.type))throw new Error('Unsupported inline format.');
  const type=v.type;
  if(WRAPPED.has(type)){
   if(!('text'in v))throw new Error('Rich text is missing text.');
   const out={type,text:rt(v.text,n-1)};
   if(type==='date_time'){if(!Number.isInteger(v.unix_time))throw new Error('Invalid date-time Unix time.');if(v.date_time_format!==undefined&&!/^r|w?[dD]?[tT]?$/.test(v.date_time_format))throw new Error('Invalid date-time format.');out.unix_time=v.unix_time;if(v.date_time_format)out.date_time_format=v.date_time_format;}
   if(type==='url'){if(typeof v.url!=='string'||!/^(https?:\/\/|tg:\/\/)/i.test(v.url))throw new Error('Links must use http(s) or tg:// URLs.');out.url=v.url;}
   if(type==='email_address')out.email_address=String(v.email_address||'');
   if(type==='phone_number')out.phone_number=String(v.phone_number||'');
   if(type==='bank_card_number')out.bank_card_number=String(v.bank_card_number||'');
   if(type==='text_mention'){if(!v.user||typeof v.user!=='object'||!Number.isInteger(v.user.id))throw new Error('Text mentions require a user id.');out.user=v.user;}
   return out;
  }
  if(type==='button'){
   if(!v.button||typeof v.button!=='object')throw new Error('Rich buttons require a button configuration.');
   const b=v.button,style=String(b.style||'primary'),outButton={text:rt(b.text||''),style};
   if(!['danger','success','primary','link'].includes(style))throw new Error('Invalid Rich button style.');
   const actions=['url','callback_data','web_app','login_url','copy_text','disabled'].filter(k=>b[k]!==undefined);
   if(actions.length!==1)throw new Error('Rich button must have exactly one action.');
   const action=actions[0];
   if(style==='link'&&action!=='callback_data')throw new Error('The link style is allowed only for callback buttons.');
   if(action==='url'){if(typeof b.url!=='string'||!b.url)throw new Error('Rich button URL is required.');outButton.url=b.url}
   if(action==='callback_data'){if(typeof b.callback_data!=='string'||!b.callback_data)throw new Error('Callback data is required.');if(new TextEncoder().encode(b.callback_data).length>64)throw new Error('Callback data must be 1-64 bytes.');outButton.callback_data=b.callback_data}
   if(action==='web_app'){if(!b.web_app||typeof b.web_app.url!=='string'||!b.web_app.url)throw new Error('Web App URL is required.');outButton.web_app={url:b.web_app.url}}
   if(action==='login_url'){if(!b.login_url||typeof b.login_url.url!=='string'||!b.login_url.url)throw new Error('Login URL is required.');outButton.login_url={url:b.login_url.url}}
   if(action==='copy_text'){if(!b.copy_text||typeof b.copy_text.text!=='string')throw new Error('Copy text is required.');outButton.copy_text={text:b.copy_text.text}}
   if(action==='disabled')outButton.disabled={};
   return{type,button:outButton};
  }
  if(type==='custom_emoji'){if(!String(v.custom_emoji_id||'')||!String(v.alternative_text||''))throw new Error('Custom emoji requires an id and alternative text.');return{type,custom_emoji_id:String(v.custom_emoji_id),alternative_text:String(v.alternative_text)};}
  return{type,...(v.name?{name:String(v.name)}:{}),...(v.url?{url:String(v.url)}:{}),...(v.username?{username:String(v.username)}:{}),...(v.hashtag?{hashtag:String(v.hashtag)}:{}),...(v.cashtag?{cashtag:String(v.cashtag)}:{}),...(v.bot_command?{bot_command:String(v.bot_command)}:{})};
 };
 const out=d.blocks.filter(b=>!(b.type==='paragraph'&&b.structural&&!String(b.text||'').replace(/<[^>]*>/g,'').trim())).flatMap(b=>{
  if(b.type==='divider')return{type:'divider'};
  if(b.type==='spacing'){if(!Number.isInteger(b.lines)||b.lines<1||b.lines>8)throw new Error('Invalid spacing.');return Array.from({length:b.lines},()=>({type:'paragraph',text:''}));}
  if(b.type==='heading'){if(!Number.isInteger(b.size)||b.size<1||b.size>6)throw new Error('Invalid heading size.');return{type:'heading',text:rt((b.inline??b.text)||''),size:b.size};}
  if(b.type==='pre')return{type:'pre',text:rt((b.inline??b.text)||''),...(b.language?{language:String(b.language)}:{})};
  if(b.type==='paragraph'||b.type==='footer')return{type:b.type,text:rt((b.inline??b.text)||'')};
  if(b.type==='list'){if(!Array.isArray(b.items)||!b.items.length)throw new Error('Invalid list.');return{type:'list',items:b.items.map((i,n)=>{const blocks=Array.isArray(i.blocks)&&i.blocks.length?i.blocks.map(x=>({type:'paragraph',text:rt(x?.text||'')})):[{type:'paragraph',text:rt(i.text||'')}];const o={blocks};const itemType=i.type||null;if(itemType&&['1','a','A','i','I'].includes(itemType)){o.type=itemType;o.value=Number.isInteger(i.value)?i.value:n+1}if(i.has_checkbox===true){o.has_checkbox=true;o.is_checked=!!i.is_checked}return o;})};}
  if(b.type==='blockquote')return{type:'blockquote',blocks:String(b.text||'').split('\\n').map(line=>({type:'paragraph',text:rt(line)})),...(b.credit?{credit:rt(b.credit)}:{})};
  if(b.type==='expandable_blockquote')return{type:'expandable_blockquote',text:rt(b.text||''),...(b.credit?{credit:rt(b.credit)}:{})};
  if(b.type==='pullquote')return{type:'pullquote',text:rt(b.text||''),...(b.credit?{credit:rt(b.credit)}:{})};
  throw new Error('Unsupported block type: '+b.type);
 });
 if(JSON.stringify(out).length>131072)throw new Error('Rich Message is too large.');
 return out;
}
