/* SADEN — §25 in-app notifications: bell with unread counter in the top bar. */

async function loadNotifs(){try{state.notifs=await api('notifications');}catch{}}
async function openNotif(n){
  state.notifOpen=false;
  if(!n.read_at)api('notifications/read',{method:'POST',body:{ids:[n.id]}}).then(loadNotifs).then(render).catch(()=>{});
  if(!n.order_id)return render();
  if(isStaff())selectOrder(n.order_id);
  else if(role()==='driver'){state.curId=n.order_id;state.lv='detail';await refresh(true);}
  else render();
}
function tplBell(){
  const r=role();if(!r||r==='client')return '';
  const Lx=L(),N=state.notifs||{items:[],unread:0};
  const readAll=()=>api('notifications/read',{method:'POST',body:{}}).then(loadNotifs).then(render).catch(()=>{});
  return `<div class="nbox" style="position:relative">
    <button ${on(()=>{state.notifOpen=!state.notifOpen;render();if(state.notifOpen)loadNotifs().then(render);})} aria-label="${esc(Lx.notifications)}" style="${css({...seg(false),border:'1px solid oklch(1 0 0 / .18)',position:'relative'})}">🔔${N.unread?`<span style="position:absolute;top:-6px;inset-inline-end:-6px;background:var(--orange);color:var(--onOrange);font-size:10.5px;font-weight:800;min-width:18px;height:18px;border-radius:999px;display:flex;align-items:center;justify-content:center;padding:0 4px">${N.unread>99?'99+':N.unread}</span>`:''}</button>
    ${when(state.notifOpen,()=>`<div style="position:absolute;top:calc(100% + 8px);inset-inline-end:0;width:min(360px,92vw);z-index:1200;${CARD};color:var(--ink);box-shadow:0 14px 34px oklch(0 0 0 / .28);overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line)"><b>${esc(Lx.notifications)}</b>${when(N.unread,()=>`<button ${on(readAll)} style="background:none;border:none;color:var(--of);font-weight:600;cursor:pointer;font-size:12px">${esc(Lx.markAllRead)}</button>`)}</div>
      <div style="max-height:60vh;overflow:auto">${N.items.length?each(N.items,n=>`<div ${on(()=>openNotif(n))} style="padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer;display:flex;gap:10px;background:${n.read_at?'transparent':'var(--ib)'}">
        <span style="width:8px;height:8px;margin-top:6px;border-radius:50%;flex-shrink:0;background:${n.read_at?'transparent':'var(--orange)'}"></span>
        <span style="display:flex;flex-direction:column;gap:2px;min-width:0"><b style="font-weight:${n.read_at?500:700};font-size:13px">${esc(n.title)}</b>${when(n.body,()=>`<span style="font-size:12px;color:var(--mute)">${esc(n.body)}</span>`)}<span style="font-size:11px;color:var(--mute)">${esc(ago(n.created_at))}</span></span></div>`)
        :`<div style="padding:16px;color:var(--mute);font-size:13px">${esc(Lx.noNotif)}</div>`}</div>
    </div>`)}
  </div>`;
}
document.addEventListener('click',e=>{if(state.notifOpen&&!e.target.closest('.nbox')){state.notifOpen=false;render();}});
Object.assign(K,{notifications:['Notifications','الإشعارات'],markAllRead:['Tout marquer comme lu','تعليم الكل كمقروء'],noNotif:['Aucune notification.','لا توجد إشعارات.']});
