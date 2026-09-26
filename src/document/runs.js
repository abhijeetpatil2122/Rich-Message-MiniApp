export const MARK_KEYS=new Set(['bold','italic','underline','strikethrough','spoiler','code','marked','subscript','superscript','button']);
export function createRun(text='',marks=[],link=null,meta={}){return{text:String(text||''),marks:(Array.isArray(marks)?marks:[]).filter(m=>MARK_KEYS.has(m)),link:link||null,...meta};}
export function runsText(runs){return(runs||[]).map(r=>String(r?.text||'')).join('');}
export function sliceRuns(runs,start,end){const out=[];let pos=0;for(const run of runs||[]){const text=String(run?.text||''),a=pos,b=pos+text.length;pos=b;const from=Math.max(start,a),to=Math.min(end,b);if(from<to)out.push(createRun(text.slice(from-a,to-a),run.marks,run.link,run.meta||{}));}return out;}
function same(a,b){return a?.link===b?.link&&JSON.stringify(a?.marks||[])===JSON.stringify(b?.marks||[])&&JSON.stringify(a?.meta||{})===JSON.stringify(b?.meta||{});}
export function mergeRuns(...groups){const out=[];for(const run of groups.flat()){if(!run?.text)continue;const last=out[out.length-1];if(last&&same(last,run))last.text+=run.text;else out.push(createRun(run.text,run.marks,run.link,run.meta||{}));}return out;}
function wrap(run,node){let value=node;for(const mark of ['code','superscript','subscript','strikethrough','underline','italic','bold','marked','spoiler'])if((run.marks||[]).includes(mark))value={type:mark,text:value};return run.link?{type:'url',text:value,url:run.link}:value;}
export function runsToRichText(runs){const parts=(runs||[]).filter(r=>r?.text).map(wrap);return parts.length===1?parts[0]:parts;}
