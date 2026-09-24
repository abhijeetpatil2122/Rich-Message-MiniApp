import React,{useEffect,useState}from'react';
import RichEditor from'../editor/RichEditor.jsx';import ProfilePage from'../profile/ProfilePage.jsx';
import {configureTelegramNavigation,getTelegramUser,initTelegramWebApp,setTelegramNavigation,telegramHaptic,telegramImpact,telegramPopup}from'../telegram/webApp.js';
import{loadChannels}from'../channels/channelStorage.js';import{postTelegram}from'../telegram/api.js';import{SendHorizontal,UserRound,X}from'lucide-react';

function Avatar({user}){const[fallback,setFallback]=useState(false);return user?.photo_url&&!fallback?<img src={user.photo_url} className="user-avatar" alt="" onError={()=>setFallback(true)}/>:<span className="user-avatar fallback"><UserRound size={19}/></span>;}

function SendSheet({document,onClose,user}){
  const[channels,setChannels]=useState([]),[busy,setBusy]=useState(false),[closing,setClosing]=useState(false);
  useEffect(()=>{loadChannels().then(setChannels).catch(()=>{});const onKey=e=>{if(e.key==='Escape')close()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  function close(){if(closing)return;setClosing(true);telegramImpact('light')}
  function finishClose(){if(closing)onClose()}
  async function send(target){
    if(busy)return;
    setBusy(true);telegramImpact('light');
    try{await postTelegram('sendRichMessage',{document,target});telegramHaptic('success');close()}
    catch(e){telegramHaptic('error');await telegramPopup({title:'Could not send',message:e?.message||'The message could not be sent.',buttons:[{id:'close',type:'close'}]})}
    finally{setBusy(false)}
  }
  return <div className={'sheet-backdrop '+(closing?'closing':'')} onClick={close}>
    <section className="send-sheet" role="dialog" aria-modal="true" aria-labelledby="send-sheet-title" onClick={e=>e.stopPropagation()} onAnimationEnd={finishClose}>
      <div className="sheet-header"><div className="sheet-handle"/><button className="sheet-close" onClick={close} aria-label="Close"><X size={20}/></button></div>
      <h2 id="send-sheet-title">Send Rich Message</h2>
      <div className="send-targets">
        <div className="send-target-row">
          <Avatar user={user}/>
          <div className="send-target-copy"><b>Test in Private Chat</b><small>Send to yourself first</small></div>
          <button className="send-target-button" disabled={busy} onClick={()=>send({type:'private'})} aria-label="Send to private chat"><SendHorizontal size={18}/></button>
        </div>
        {channels.map(c=><div className="send-target-row" key={String(c.id)}>
          <span className="channel-mini-icon">{(c.title||'C')[0]}</span>
          <div className="send-target-copy"><b>{c.title||c.username||c.id}</b><small>{c.username?'@'+c.username:c.id}</small></div>
          <button className="send-target-button" disabled={busy} onClick={()=>send({type:'channel',chat_id:c.id})} aria-label={'Send to '+(c.title||c.username||c.id)}><SendHorizontal size={18}/></button>
        </div>)}
      </div>
      {!channels.length&&<p className="hint send-empty-hint">No saved channels yet. Add one from your profile.</p>}
    </section>
  </div>
}

export default function App(){const[page,setPage]=useState('editor'),[sendDoc,setSendDoc]=useState(null),user=getTelegramUser();useEffect(()=>{initTelegramWebApp();return configureTelegramNavigation({onBack:()=>setPage('editor'),onSettings:()=>setPage('profile')})},[]);useEffect(()=>{setTelegramNavigation({showBack:page==='profile',showSettings:page==='editor'})},[page]);if(page==='profile')return <ProfilePage/>;return <div className="app"><RichEditor onSend={setSendDoc}/><button className="profile-button" onClick={()=>setPage('profile')} aria-label="Open profile"><Avatar user={user}/></button>{sendDoc&&<SendSheet document={sendDoc} user={user} onClose={()=>setSendDoc(null)}/>}</div>}
