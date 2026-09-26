const MARKS=Object.freeze(['bold','italic']);

function cleanSegment(segment){
  const text=String(segment?.text??'');
  const marks={};
  if(segment?.marks?.bold===true)marks.bold=true;
  if(segment?.marks?.italic===true)marks.italic=true;
  return{text,marks};
}

export function normalizeInline(inline,text=''){
  const source=Array.isArray(inline)&&inline.length?inline:[{text:String(text??''),marks:{}}];
  const out=[];
  for(const raw of source){
    const segment=cleanSegment(raw);
    if(!segment.text)continue;
    const prev=out[out.length-1];
    if(prev&&MARKS.every(mark=>!!prev.marks[mark]===!!segment.marks[mark]))prev.text+=segment.text;
    else out.push(segment);
  }
  return out;
}

export function inlineText(inline,text=''){
  if(!Array.isArray(inline)||!inline.length)return String(text??'');
  return inline.map(x=>String(x?.text??'')).join('');
}

export function inlineHasMarks(inline){
  return Array.isArray(inline)&&inline.some(x=>MARKS.some(mark=>x?.marks?.[mark]===true));
}

export function removeInlineMark(inline,text,start,end,mark){
  const value=inlineText(inline,text),a=Math.max(0,Math.min(value.length,Number(start)||0)),z=Math.max(a,Math.min(value.length,Number(end)||0));
  if(a===z)return normalizeInline(inline,value);
  const source=normalizeInline(inline,value),out=[];let cursor=0;
  for(const seg of source){
    const segStart=cursor,segEnd=cursor+seg.text.length,cuts=[segStart];
    if(a>segStart&&a<segEnd)cuts.push(a);
    if(z>segStart&&z<segEnd)cuts.push(z);
    cuts.push(segEnd);
    for(let n=0;n<cuts.length-1;n++){
      const from=cuts[n],to=cuts[n+1];if(to<=from)continue;
      const marks={...seg.marks};if(to>a&&from<z)delete marks[mark];
      out.push({text:value.slice(from,to),marks});
    }
    cursor=segEnd;
  }
  return normalizeInline(out,value);
}

export function sliceInline(inline,text,start,end){
  const value=inlineText(inline,text),a=Math.max(0,Math.min(value.length,Number(start)||0)),z=Math.max(a,Math.min(value.length,Number(end)||0));
  if(a===z)return[];
  const source=normalizeInline(inline,value),out=[];let cursor=0;
  for(const segment of source){
    const segStart=cursor,segEnd=cursor+segment.text.length,from=Math.max(a,segStart),to=Math.min(z,segEnd);
    if(to>from)out.push({text:value.slice(from,to),marks:{...segment.marks}});
    cursor=segEnd;
  }
  return normalizeInline(out,'');
}

export function concatInline(first,firstText,second,secondText){
  return normalizeInline([...normalizeInline(first,firstText),...normalizeInline(second,secondText)],inlineText(first,firstText)+inlineText(second,secondText));
}

export function applyInlineMark(inline,text,start,end,mark='bold'){
  const value=inlineText(inline,text);
  const a=Math.max(0,Math.min(value.length,Number(start)||0));
  const z=Math.max(a,Math.min(value.length,Number(end)||0));
  if(a===z)return{inline:normalizeInline(inline,value),changed:false};
  const source=normalizeInline(inline,value);
  let cursor=0;
  const selected=source.filter(seg=>{
    const next=cursor+seg.text.length;
    const hit=next>a&&cursor<z;
    cursor=next;
    return hit;
  });
  const turnOff=selected.length>0&&selected.every(seg=>seg.marks?.[mark]===true);
  const out=[];
  cursor=0;
  for(const seg of source){
    const segStart=cursor,segEnd=cursor+seg.text.length;
    const cuts=[segStart];
    if(a>segStart&&a<segEnd)cuts.push(a);
    if(z>segStart&&z<segEnd)cuts.push(z);
    cuts.push(segEnd);
    for(let i=0;i<cuts.length-1;i++){
      const from=cuts[i],to=cuts[i+1];
      if(to<=from)continue;
      const marks={...seg.marks};
      if(from<a||from>=z)marks[mark]=!!marks[mark];
      else marks[mark]=!turnOff;
      out.push({text:value.slice(from,to),marks});
    }
    cursor=segEnd;
  }
  const normalized=normalizeInline(out,value);
  return{inline:normalized,changed:true};
}
