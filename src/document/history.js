export function createHistory(){return{past:[],future:[],lastInputAt:0};}
export function record(h,current,{coalesce=false,windowMs=650}={}){const now=Date.now();if(!coalesce||now-h.lastInputAt>windowMs)h.past.push(structuredClone(current));h.lastInputAt=now;h.future=[];}
export function undo(h,current){if(!h.past.length)return null;const p=h.past.pop();h.future.push(structuredClone(current));h.lastInputAt=0;return structuredClone(p);}
export function redo(h,current){if(!h.future.length)return null;const n=h.future.pop();h.past.push(structuredClone(current));h.lastInputAt=0;return structuredClone(n);}
