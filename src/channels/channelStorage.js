const INDEX='rich_channels_index',PREFIX='rich_channel_';
const app=()=>typeof window!=='undefined'?window.Telegram?.WebApp??null:null;
const cloud=()=>app()?.CloudStorage;
const device=()=>app()?.DeviceStorage;
function telegramCall(storage,method,...args){return new Promise((resolve,reject)=>{if(!storage?.[method])return reject(new Error('Storage API unavailable.'));storage[method](...args,(error,value)=>error?reject(new Error(error)):resolve(value));});}
function localGet(key){try{return window.localStorage.getItem(key)}catch{return null}}
function localSet(key,value){try{window.localStorage.setItem(key,value);return true}catch{return false}}
function localRemove(key){try{window.localStorage.removeItem(key);return true}catch{return false}}
async function getItem(key){if(cloud()?.getItem)try{return await telegramCall(cloud(),'getItem',key)}catch{}if(device()?.getItem)try{return await telegramCall(device(),'getItem',key)}catch{}return localGet(key)||'';}
async function setItem(key,value){if(cloud()?.setItem)try{await telegramCall(cloud(),'setItem',key,value);return 'cloud'}catch{}if(device()?.setItem)try{await telegramCall(device(),'setItem',key,value);return 'device'}catch{}if(localSet(key,value))return 'local';throw new Error('Telegram storage is unavailable. Please reopen the Mini App in Telegram and try again.');}
async function removeItem(key){if(cloud()?.removeItem)try{await telegramCall(cloud(),'removeItem',key);return}catch{}if(device()?.removeItem)try{await telegramCall(device(),'removeItem',key);return}catch{}localRemove(key);}
export async function loadChannels(){const raw=await getItem(INDEX),ids=(()=>{try{return JSON.parse(raw)||[]}catch{return[]}})();if(!ids.length)return[];const values={};for(const id of ids){const value=await getItem(PREFIX+id);if(value)values[PREFIX+id]=value;}return ids.map(id=>values[PREFIX+id]).filter(Boolean).map(v=>{try{return JSON.parse(v)}catch{return null}}).filter(Boolean);}
export async function saveChannel(channel){const old=await loadChannels(),ids=old.map(x=>String(x.id));if(!ids.includes(String(channel.id)))ids.push(String(channel.id));await setItem(INDEX,JSON.stringify(ids));await setItem(PREFIX+channel.id,JSON.stringify(channel));return[...old.filter(x=>String(x.id)!==String(channel.id)),channel];}
export async function removeChannel(id){const old=await loadChannels(),ids=old.map(x=>String(x.id)).filter(x=>x!==String(id));await setItem(INDEX,JSON.stringify(ids));await removeItem(PREFIX+id);return old.filter(x=>String(x.id)!==String(id));}
