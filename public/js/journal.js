/* SADEN — « Journal » (§29, §30): audit log with filters (entity, action, user, period). */

function journalQuery(){
  const f=state.jf||{},p=new URLSearchParams();
  for(const k of ['entity','action','user_id','entity_id','from','to'])if(f[k])p.set(k,f[k]);
  return 'audit?'+p.toString();
}
async function loadJournal(){state.journal=await api(journalQuery());}

function tplJournal(){
  const Lx=L(),J=state.journal;
  if(!state.jf)state.jf={entity:'',action:'',user_id:'',entity_id:'',from:'',to:''};
  const f=state.jf;
  if(!J){if(!state._jReq){state._jReq=1;loadJournal().then(()=>{state._jReq=0;render();}).catch(e=>{state._jReq=0;toast(e.message,'err');});}return `<div style="${CARD};padding:24px"><span class="spin"></span></div>`;}
  const apply=()=>{state.journal=null;render();};
  const users=(state.users||[]);
  const short=v=>{if(v==null)return '';const t=typeof v==='object'?Object.entries(v).map(([k,x])=>k+'='+(typeof x==='object'?JSON.stringify(x):x)).join(', '):String(v);return t.length>160?t.slice(0,160)+'…':t;};
  return `<div style="${CARD};padding:var(--pad);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px;align-items:end">
      ${field(Lx.entity,select('j-ent','jf','entity',[['',Lx.any],...J.entities.map(e=>[e,e])]))}
      ${field(Lx.actionLbl,input('j-act','jf','action','placeholder="order.status, scan., cash…"'))}
      ${field(Lx.userLbl,select('j-usr','jf','user_id',[['',Lx.any],...users.map(u=>[u.id,(u.role==='shop'?u.shop_name:u.name)+' · '+u.role])]))}
      ${field(Lx.entityId,input('j-eid','jf','entity_id','placeholder="id"'))}
      ${field(Lx.from,`<input type="date" class="fld" ${onInput(e=>{state.jf={...state.jf,from:e.target.value};},'j-from')} value="${esc(f.from)}">`)}
      ${field(Lx.to,`<input type="date" class="fld" ${onInput(e=>{state.jf={...state.jf,to:e.target.value};},'j-to')} value="${esc(f.to)}">`)}
      <button ${on(apply)} style="${BTN_PRIMARY};min-height:42px">${esc(Lx.apply)}</button>
    </div>
    <div style="${CARD};overflow:hidden">
      <div style="padding:var(--pad)"><b>${esc(Lx.journal)}</b> <span style="color:var(--mute);font-size:12px">· ${J.rows.length} ${esc(Lx.entries)}</span></div>
      <div style="overflow-x:auto"><div style="min-width:860px">
        <div style="display:grid;grid-template-columns:120px 150px 170px 140px minmax(0,1fr) 100px;gap:10px;padding:8px var(--pad);font-size:11.5px;text-transform:uppercase;color:var(--mute);background:var(--surface2)"><span>${esc(Lx.date)}</span><span>${esc(Lx.userLbl)}</span><span>${esc(Lx.actionLbl)}</span><span>${esc(Lx.entity)}</span><span>${esc(Lx.beforeAfter)}</span><span>IP</span></div>
        ${J.rows.length?each(J.rows,r=>`<div style="display:grid;grid-template-columns:120px 150px 170px 140px minmax(0,1fr) 100px;gap:10px;padding:8px var(--pad);border-top:1px solid var(--line);font-size:12.5px;align-items:start">
          <span style="font-family:var(--mono);color:var(--mute)">${dm(r.created_at)} ${hm(r.created_at)}</span>
          <span>${esc(r.user_name||'Système')}${r.user_role?`<br><span style="color:var(--mute);font-size:11px">${esc(r.user_role)}</span>`:''}</span>
          <b style="font-weight:600">${esc(r.action)}</b>
          <span ${r.entity==='order'&&r.entity_id?on(()=>selectOrder(+r.entity_id)):''} style="${r.entity==='order'?'color:var(--of);cursor:pointer':''}">${esc(r.entity||'')} ${esc(r.order_ref||('#'+(r.entity_id||'')))}</span>
          <span style="color:var(--mute);overflow-wrap:anywhere">${r.before?`<span style="text-decoration:line-through">${esc(short(r.before))}</span><br>`:''}${esc(short(r.after))}</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--mute);overflow-wrap:anywhere">${esc(r.ip||'')}</span></div>`):empty()}
      </div></div>
    </div>`;
}

Object.assign(K,{journal:['Journal','السجل'],entity:['Objet','الكيان'],actionLbl:['Action','العملية'],userLbl:['Utilisateur','المستخدم'],entityId:['Identifiant','المعرف'],entries:['entrées','سجلات'],beforeAfter:['Avant → après','قبل ← بعد']});
