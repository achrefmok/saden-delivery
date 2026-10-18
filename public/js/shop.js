/* SADEN — shipper space (« espace boutique »): home (essentials, detailed follow-up, quick tracking), create (form +
   Excel import), waiting parcels, history (shared parcel list), claims wizard, exchanges, returns, payments, pickup
   requests (selection / scan), statistics, settings (profile, print format, users). Replaces the single shop page. */

const SHOP_PAGES=[['home',['Accueil','الرئيسية'],'⌂'],['create',['Créer des colis','إنشاء طرود'],'＋'],['waiting',['Colis en attente','طرود في الانتظار'],'⏳'],
  ['history',['Historique','السجل'],'☰'],['claims',['Réclamations','الشكاوى'],'!'],['exchanges',['Échanges','التبديلات'],'⇄'],['returns',['Retours','المرتجعات'],'↩'],
  ['payments',['Paiements','الدفعات'],'💵'],['pickups',['Expéditions','الإرساليات'],'🚚'],['stats',['Statistiques','الإحصائيات'],'▤'],['settings',['Paramètres','الإعدادات'],'⚙']];
const shopApi=(p,o)=>api(p,o);
async function loadShopPage(){
  const pg=state.shopPage||'home';
  const get={home:()=>shopApi('shop/dashboard'),claims:()=>shopApi('shop/claims'),exchanges:()=>Promise.all([shopApi('shop/manifests?type=exchange'),shopApi('parcels?kind=pickup&size=200')]),
    returns:()=>shopApi('shop/manifests?type=restitution'),payments:()=>shopApi('shop/manifests?type=settlement'),pickups:()=>Promise.all([shopApi('shop/manifests?type=pickup'),shopApi('parcels?status=attente&kind=delivery&size=200')]),
    waiting:()=>shopApi('parcels?status=attente&kind=delivery&size=200'),stats:()=>shopApi('shop/stats?'+shopStatsQuery()),settings:()=>Promise.all([shopApi('shop/profile'),shopApi('shop/users')])}[pg];
  if(!get)return;
  const d=await get();
  if((state.shopPage||'home')===pg)state.sp={pg,d};
}
function goShop(p){state.shopPage=p;state.sp=null;state.shopSel=[];if(p==='history'){state.pl=null;state.pTab='list';}render();loadShopPage().then(render).catch(e=>toast(e.message,'err'));scrollTo(0,0);}

tplShop=function(){
  const Lx=L(),s=state.shop,pg=state.shopPage||'home';
  if(!s)return `<div style="padding:40px;text-align:center;color:var(--mute)"><span class="spin"></span></div>`;
  const me=s.me,sp=state.sp&&state.sp.pg===pg?state.sp:null;
  if(!sp&&!['create','history'].includes(pg)&&state._spReq!==pg){state._spReq=pg;loadShopPage().catch(e=>toast(e.message,'err')).finally(()=>{state._spReq=null;render();});}
  const nav=`<nav class="no-print" style="display:flex;gap:4px;overflow-x:auto;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--line)" data-shopnav>${each(SHOP_PAGES,([k,l,ic])=>`<button ${on(()=>goShop(k))} data-shoppage="${k}" style="${css({display:'flex',alignItems:'center',gap:6,padding:'8px 12px',borderRadius:999,border:'none',whiteSpace:'nowrap',cursor:'pointer',fontWeight:600,background:pg===k?'var(--navy)':'transparent',color:pg===k?'oklch(0.98 0.005 262)':'var(--mute)'})}"><span aria-hidden="true">${ic}</span>${esc(l[li()])}</button>`)}</nav>`;
  const title=SHOP_PAGES.find(x=>x[0]===pg)[1][li()];
  const head=`<div class="hdr" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:16px 24px;background:var(--hdr);color:var(--hdrInk);border-bottom:1px solid var(--line)">
      <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;opacity:.8">${esc(me.shop_name)}${me.parent_id?' · '+esc(me.name):''}</span><b style="font-family:var(--disp);font-size:24px">${esc(title)}</b></div>
      ${pg!=='create'?`<button ${on(()=>goShop('create'))} style="${BTN_PRIMARY};padding:9px 16px">＋ ${esc(Lx.createParcel)}</button>`:''}</div>`;
  const loading=`<div style="${CARD};padding:24px"><span class="spin"></span></div>`;
  const body=pg==='create'?tplShopCreate():pg==='history'?tplParcels():!sp?loading:({home:tplShopHome,waiting:tplShopWaiting,claims:tplShopClaims,exchanges:tplShopExchanges,returns:tplShopReturns,payments:tplShopPayments,pickups:tplShopPickupsPage,stats:tplShopStats,settings:tplShopSettings}[pg])(sp.d);
  return `<div style="display:flex;flex-direction:column;flex:1;min-width:0">${nav}${head}<div class="pg" style="padding:20px 24px;display:flex;flex-direction:column;gap:var(--gap)">${body}</div>${tplShopModal()}</div>`;
};

/* ---------------------------------------------------------------- home */
function tplShopHome(d){
  const Lx=L(),u=Lx.tnd,me=state.shop.me;
  const big=(t,n,amt,pct,tone)=>`<div style="${CARD};padding:var(--pad);border-inline-start:4px solid var(--${tone});display:flex;flex-direction:column;gap:4px;min-width:0">
    <span style="font-size:12.5px;color:var(--mute)">${esc(t)}</span><b style="font-family:var(--disp);font-size:28px">${n}</b>
    <span style="font-size:12.5px">${amt!=null?esc(fmt(amt,u)):''}${pct!=null?` <span style="${css(badge('n'))}">${String(pct).replace('.',',')} %</span>`:''}</span></div>`;
  const small=(t,n,amt,go)=>`<button ${on(go)} style="${CARD};padding:12px;display:flex;flex-direction:column;gap:2px;text-align:start;cursor:pointer;color:var(--ink);min-width:0"><span style="font-size:12px;color:var(--mute)">${esc(t)}</span><b style="font-size:20px">${n}</b><span style="font-size:12px">${amt!=null?esc(fmt(amt,u)):''}</span></button>`;
  const track=()=>{const v=(state.shopTrack||'').trim();if(!v)return;shopApi('parcels?refs='+encodeURIComponent(v)).then(r=>{if(!r.rows.length)return toast(Lx.parcelNotFound,'err');openShopOrder(r.rows[0].id);}).catch(e=>toast(e.message,'err'));};
  const hist=f=>()=>{state.pf=f;goShop('history');};
  return `<div style="${CARD};padding:var(--pad);display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
      <div><b style="font-size:18px">${esc(Lx.hello)} ${esc(me.shop_name)}</b><div style="color:var(--mute)">${esc(Lx.helloSub)}</div></div>
      <form data-form="strack" onsubmit="return false" style="display:flex;gap:6px;flex-wrap:wrap"><input class="fld" ${onInput(e=>{state.shopTrack=e.target.value;},'shop-track')} value="${esc(state.shopTrack||'')}" placeholder="${esc(Lx.trackCode)}" style="font-family:var(--mono);min-width:200px">
        <button ${on(track)} style="${BTN_PRIMARY};padding:9px 14px">${esc(Lx.trackBtn2)}</button></form></div>
    <b>${esc(Lx.essentials)}</b>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:var(--gap)" data-shop-essentials>
      ${big(Lx.cDelivered,d.delivered_n,d.delivered_cod,d.delivered_pct,'gf')}${big(Lx.cReturned,d.returned_n,d.returned_cod,d.returned_pct,'wf')}${big(Lx.cWithUs,d.with_us_n,d.with_us_cod,null,'if')}
    </div>
    <b>${esc(Lx.detailedFollow)}</b>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px">
      ${small(Lx.cOut,d.out_n,d.out_cod,hist({status:'livraison'}))}${small(Lx.cStock,d.stock_n,d.stock_cod,hist({in_stock:'1'}))}${small(Lx.cPrepReturn,d.ret_n,d.ret_cod,hist({status:'retour_agence'}))}
      ${small(Lx.cSettled,d.settled_n,d.settled_amount,hist({settled:'1'}))}${small(Lx.cWaiting,d.waiting_n,null,()=>goShop('waiting'))}
    </div>${tplShopPickups()}`;
}

/* ---------------------------------------------------------------- create + Excel import */
const IMPORT_COLS=[['nom','Nom complet *'],['telephone','Téléphone *'],['telephone2','Téléphone 2'],['adresse','Adresse *'],['gouvernorat','Gouvernorat'],['ville','Ville *'],['zone','Zone / délégation'],
  ['montant','Contre-remboursement *'],['reference','Référence'],['description','Description'],['pieces','Pièces'],['echange','Échange (oui / non)']];
async function downloadImportTemplate(){
  try{await loadLib('xlsx');const g=G(),c=g.cities[0];
    const ws=XLSX.utils.aoa_to_sheet([IMPORT_COLS.map(x=>x[1]),['Salma Khemiri','22 123 456','','Rue de la République 12',g.governorates?.[0]?.name||'',c?.name||'Gafsa',g.zones.find(z=>z.city_id===c?.id)?.name||'',45,'CMD-1001','2 chemises','1','non']]);
    ws['!cols']=IMPORT_COLS.map(()=>({wch:20}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Colis');
    const ref=XLSX.utils.aoa_to_sheet([['Ville','Zones'],...g.cities.map(x=>[x.name,g.zones.filter(z=>z.city_id===x.id).map(z=>z.name).join(', ')])]);XLSX.utils.book_append_sheet(wb,ref,'Villes et zones');
    XLSX.writeFile(wb,'modele-import-colis.xlsx');
  }catch(e){toast(e.message,'err');}
}
async function importExcel(e){
  const Lx=L(),f=e.target.files?.[0];if(!f)return;
  try{
    await loadLib('xlsx');
    const wb=XLSX.read(await f.arrayBuffer());const raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
    const norm=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const head=raw[0].map(norm),key=k=>head.findIndex(h=>h.startsWith(norm(IMPORT_COLS.find(c=>c[0]===k)[1]).slice(0,7)));
    const idx=Object.fromEntries(IMPORT_COLS.map(([k])=>[k,key(k)]));
    const rows=raw.slice(1).filter(r=>r.some(v=>String(v).trim())).map(r=>Object.fromEntries(IMPORT_COLS.map(([k])=>[k,idx[k]>=0?r[idx[k]]:''])));
    if(!rows.length)return toast(Lx.emptyFile,'err');
    state.busy=true;render();
    const res=await api('shop/orders/import',{method:'POST',body:{rows}});
    state.importReport=res;toast(Lx.importDone+' : '+res.created.length+' / '+rows.length);
  }catch(x){toast(x.message,'err');}
  finally{state.busy=false;e.target.value='';render();}
}
function tplShopCreate(){
  const Lx=L(),rep=state.importReport;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:var(--gap);align-items:start">
    <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:12px">${tplOrderForm('form',false)}
      ${when(state.shopSent,`<div style="padding:10px;border-radius:var(--r);background:var(--gb);color:var(--gf);font-weight:600;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between"><span>${esc(Lx.orderCreated)} : ${esc(state.shopSent)}</span><button ${on(()=>shareTrack(state.shopSent))} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">🔗 ${esc(Lx.shareLink)}</button></div>`)}</div>
    <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px" data-import>
      <b>${esc(Lx.importTitle)}</b><span style="font-size:12.5px;color:var(--mute)">${esc(Lx.importHint)}</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button ${on(downloadImportTemplate)} style="${BTN_GHOST}">⤓ ${esc(Lx.importTemplate)}</button>
        <label style="${BTN_PRIMARY};display:inline-flex;align-items:center;gap:6px">⤒ ${esc(Lx.importFile)}<input type="file" accept=".xlsx,.xls,.csv" style="display:none" ${onInput(importExcel,'imp-file')}></label></div>
      ${when(rep,()=>`<div style="padding:10px;border-radius:var(--r);background:${rep.errors.length?'var(--wb)':'var(--gb)'};font-size:12.5px;display:flex;flex-direction:column;gap:4px" data-import-report>
        <b>${rep.created.length} ${esc(Lx.createdK)}</b>${rep.created.length?`<span style="font-family:var(--mono)">${esc(rep.created.join(', '))}</span>`:''}
        ${rep.errors.length?`<b style="color:var(--rf)">${rep.errors.length} ${esc(Lx.errorsK)}</b>${each(rep.errors,x=>`<span>${esc(Lx.lineK)} ${x.line} : ${esc(x.error)}</span>`)}`:''}</div>`)}
    </div></div>`;
}

/* ---------------------------------------------------------------- waiting parcels (edit, labels, cancel) */
function tplShopWaiting(d){
  const Lx=L(),rows=d.rows,sel=state.shopSel||(state.shopSel=[]),fmtP=state.shop.me.print_format||'a6';
  const toggle=id=>()=>{state.shopSel=sel.includes(id)?sel.filter(x=>x!==id):[...sel,id];render();};
  const all=rows.length&&rows.every(r=>sel.includes(r.id));
  const labels=async()=>{const w=window.open('','_blank','width=900,height=900');if(!w)return toast(Lx.popupBlocked,'err');
    try{const {orders}=await api('parcels/labels',{method:'POST',body:{ids:sel}});await loadLib('qr');w.document.open();w.document.write(labelsHtml(orders,fmtP));w.document.close();}catch(e){w.close();toast(e.message,'err');}};
  const cancel=()=>askReason(Lx.cancelSelected,false,note=>act(async()=>{const r=await api('shop/orders/cancel',{method:'POST',body:{ids:sel,note}});state.shopSel=[];if(r.errors.length)toast(r.errors.join(' · '),'err');await loadShopPage();},Lx.saved));
  return `<div class="no-print" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><b style="font-size:12.5px">${sel.length} ${esc(Lx.selectedK)}</b>
      <button ${sel.length?on(labels):'disabled'} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">🏷 ${esc(Lx.printLabels)} (${fmtP.toUpperCase()})</button>
      <button ${sel.length?on(()=>{state.pkSel=[...sel];goShop('pickups');}):'disabled'} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">🚚 ${esc(Lx.requestPickupSel)}</button>
      <button ${sel.length?on(cancel):'disabled'} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px;color:var(--rf)">✕ ${esc(Lx.cancelSelected)}</button></div>
    <div style="${CARD};overflow:hidden"><div style="overflow-x:auto"><div style="min-width:820px">
      <div style="display:grid;grid-template-columns:36px 110px minmax(0,1fr) 130px minmax(0,1.2fr) 100px 100px 90px;gap:10px;padding:8px var(--pad);font-size:11.5px;color:var(--mute);background:var(--surface2);font-weight:600;align-items:center">
        <input type="checkbox" ${all?'checked':''} ${on(()=>{state.shopSel=all?[]:rows.map(r=>r.id);render();})}><span>Code</span><span>${esc(Lx.client)}</span><span>${esc(Lx.phone)}</span><span>${esc(Lx.address)}</span><span>CR</span><span>${esc(Lx.createdOn)}</span><span></span></div>
      ${rows.length?each(rows,r=>`<div style="display:grid;grid-template-columns:36px 110px minmax(0,1fr) 130px minmax(0,1.2fr) 100px 100px 90px;gap:10px;align-items:center;padding:8px var(--pad);border-top:1px solid var(--line);font-size:12.5px" data-wrow="${esc(r.ref)}">
        <input type="checkbox" ${sel.includes(r.id)?'checked':''} ${on(toggle(r.id))}><span ${on(()=>openShopOrder(r.id))} style="font-family:var(--mono);cursor:pointer;text-decoration:underline dotted">${esc(r.ref)}</span>
        <span>${esc(r.client_name)}${r.exchange_ref?` <span style="${css(badge('w'))}">⇄</span>`:''}<br><span style="color:var(--mute)">${esc(r.description||'')}</span></span><span>${esc(fmtPhone(r.client_phone))}</span>
        <span>${esc([r.address,r.dest_city_name].filter(Boolean).join(' · '))}</span><b>${esc(fmt(r.cod))}</b><span>${esc(dtm(r.created_at))}</span>
        <button ${on(()=>openShopOrder(r.id,true))} style="${BTN_GHOST};padding:4px 9px;font-size:12px">✎ ${esc(Lx.editK)}</button></div>`):empty(Lx.noWaiting)}
    </div></div></div>`;
}

/* ---------------------------------------------------------------- parcel detail (journey, problems, calls, claim, edit) */
async function openShopOrder(id,edit){
  state.shopModal={kind:'order',loading:true};render();
  try{const d=await api('shop/orders/'+id);state.shopModal={kind:'order',d,edit:!!edit&&d.editable,f:{...d.order,cod:String(d.order.cod)}};}
  catch(e){state.shopModal=null;toast(e.message,'err');}
  render();
}
function tplShopModal(){
  const m=state.shopModal;if(!m)return '';
  const Lx=L(),close=()=>{state.shopModal=null;render();};
  let title='',body='';
  if(m.loading){title='…';body='<span class="spin"></span>';}
  else if(m.kind==='order'){
    const o=m.d.order,t=state.shopModal.tab||'journey';
    title=o.ref+' · '+stL(o.status);
    const tabs=[['journey',Lx.journeyK],['problems',Lx.problemsTab+' ('+m.d.problems.length+')'],['calls',Lx.callsK+' ('+m.d.calls.length+')']];
    const saveEdit=()=>act(async()=>{const f=state.shopModal.f;await api('shop/orders/'+o.id,{method:'PATCH',body:{client_name:f.client_name,client_phone:f.client_phone,client_phone2:f.client_phone2,address:f.address,cod:f.cod,description:f.description,external_ref:f.external_ref,notes:f.notes}});
      await openShopOrder(o.id);if(state.shopPage==='waiting')await loadShopPage();},Lx.saved);
    const upd=(k,v)=>{state.shopModal={...state.shopModal,f:{...state.shopModal.f,[k]:v}};};
    const inp=(k,l,attrs='')=>field(l,`<input class="fld" ${onInput(e=>upd(k,e.target.value),'sm-'+k)} value="${esc(m.f[k]??'')}" ${attrs}>`);
    body=m.edit?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${inp('client_name',Lx.name)}${inp('client_phone',Lx.phone,'type="tel"')}${inp('client_phone2',Lx.phone2,'type="tel"')}${inp('cod',Lx.cod+' (TND)','type="number" step="0.001"')}</div>
        ${inp('address',Lx.address)}${inp('description',Lx.description)}${inp('external_ref',Lx.externalRef)}
        <div style="display:flex;gap:8px"><button ${on(saveEdit)} style="${BTN_PRIMARY};flex:1">${spin()}${esc(Lx.save)}</button><button ${on(()=>{state.shopModal={...state.shopModal,edit:false};render();})} style="${BTN_GHOST}">${esc(Lx.cancel)}</button></div>`
      :`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;font-size:12.5px">
          ${each([[Lx.client,o.client_name],[Lx.phone,fmtPhone(o.client_phone)+(o.client_phone2?' / '+fmtPhone(o.client_phone2):'')],[Lx.address,[o.address,o.zone_name,o.dest_city_name].filter(Boolean).join(' · ')],[Lx.cod,fmt(o.cod,Lx.tnd)],[Lx.attemptsK,String(o.attempts||0)],[Lx.externalRef,o.external_ref||'—']],([k,v])=>`<div><span style="color:var(--mute)">${esc(k)}</span><br><b style="font-weight:600">${esc(v)}</b></div>`)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button ${on(()=>printLabel(o))} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">🏷 ${esc(Lx.label)}</button>
          <button ${on(()=>shareTrack(o.ref))} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">🔗 ${esc(Lx.shareLink)}</button>
          ${m.d.editable?`<button ${on(()=>{state.shopModal={...state.shopModal,edit:true};render();})} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">✎ ${esc(Lx.editK)}</button>`:''}
          ${m.d.claim&&m.d.claim.status<3?`<span style="${css(badge('o'))}">${esc(Lx.claimOpen)} RC-${String(m.d.claim.id).padStart(4,'0')}</span>`:`<button ${on(()=>{state.shopModal={kind:'claim',step:2,order:{id:o.id,ref:o.ref,client_name:o.client_name},category:'',text:''};render();})} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">! ${esc(Lx.claimBtn)}</button>`}
        </div>
        ${m.d.manifests.length?`<span style="font-size:12px;color:var(--mute)">${esc(Lx.brd)} : ${esc(m.d.manifests.map(x=>x.ref).join(', '))}</span>`:''}
        <div style="display:flex;gap:6px">${each(tabs,([k,l])=>`<button ${on(()=>{state.shopModal={...state.shopModal,tab:k};render();})} style="${css(chip(t===k))}">${esc(l)}</button>`)}</div>
        ${t==='journey'?`<div style="display:flex;flex-direction:column">${each(m.d.events,e=>`<div style="display:grid;grid-template-columns:110px 1fr;gap:8px;padding:6px 0;border-top:1px solid var(--line);font-size:12.5px"><span style="font-family:var(--mono);color:var(--mute)">${esc(dtm(e.created_at))}</span><span><b style="font-weight:600">${esc(stL(e.status))}</b>${e.note?' — '+esc(e.note):''}<br><span style="color:var(--mute);font-size:11.5px">${esc(e.actor||'')}</span></span></div>`)}</div>`
        :t==='problems'?(m.d.problems.length?each(m.d.problems,p=>`<div style="padding:6px 0;border-top:1px solid var(--line);font-size:12.5px"><span style="${css(badge('r'))}">${esc(pbL(p.type))}</span> ${esc(p.note||'')} <span style="color:var(--mute)">· ${esc(dtm(p.created_at))}${p.rdv_at?' · RDV '+esc(dtm(p.rdv_at)):''}</span></div>`):empty())
        :(m.d.calls.length?each(m.d.calls,c=>`<div style="padding:6px 0;border-top:1px solid var(--line);font-size:12.5px">📞 <b>${esc((CALL_OUT.find(x=>x[0]===c.outcome)||[0,[c.outcome,c.outcome]])[1][li()])}</b> ${esc(c.note||'')} <span style="color:var(--mute)">· ${esc(dtm(c.created_at))}</span></div>`):empty())}`;
  }else if(m.kind==='claim'){
    title=Lx.newClaim;
    const step=m.step||1,upd=p=>{state.shopModal={...state.shopModal,...p};render();};
    const find=()=>act(async()=>{const c=state.shopModal;try{
        const q=c.mode==='phone'?{phone:c.q}:{ref:c.q};const r=await api('parcels?'+(c.mode==='phone'?'q=':'refs=')+encodeURIComponent(c.q));
        if(!r.rows.length)throw new Error(Lx.parcelNotFound);
        if(r.rows.length>1&&c.mode==='phone')return upd({candidates:r.rows.slice(0,20)});
        upd({step:2,order:r.rows[0],candidates:null});void q;}catch(e){toast(e.message,'err');}});
    const send=()=>act(async()=>{const c=state.shopModal;const r=await api('shop/claims',{method:'POST',body:{order_id:c.order.id,category:c.category,text:c.text}});state.shopModal=null;toast(Lx.claimSent+' : '+r.ref);if(state.shopPage==='claims')await loadShopPage();});
    body=`<div style="display:flex;gap:6px;font-size:12px">${each([[1,Lx.cStep1],[2,Lx.cStep2],[3,Lx.cStep3]],([n,l])=>`<span style="${css(badge(step>=n?'i':'n'))}">${n}. ${esc(l)}</span>`)}</div>
      ${step===1?`<div style="display:flex;gap:6px">${each([['code',Lx.byCode],['phone',Lx.byPhone]],([k,l])=>`<button ${on(()=>upd({mode:k,candidates:null}))} style="${css(chip((m.mode||'code')===k))}">${esc(l)}</button>`)}</div>
        <div style="display:flex;gap:6px"><input class="fld" ${onInput(e=>{state.shopModal={...state.shopModal,q:e.target.value};},'cl-q')} value="${esc(m.q||'')}" placeholder="${esc((m.mode||'code')==='phone'?'+216 …':'SD-…')}"><button ${on(find)} style="${BTN_PRIMARY}">${esc(Lx.searchK)}</button></div>
        ${m.candidates?each(m.candidates,x=>`<button ${on(()=>upd({step:2,order:x,candidates:null}))} style="${BTN_GHOST};text-align:start">${esc(x.ref)} · ${esc(x.client_name)} · ${esc(stL(x.status))}</button>`):''}`
      :`<div style="padding:8px;border-radius:var(--r);background:var(--surface2);font-size:12.5px"><b style="font-family:var(--mono)">${esc(m.order.ref)}</b> · ${esc(m.order.client_name)}</div>
        ${field(Lx.claimType,`<select class="fld" ${onInput(e=>{state.shopModal={...state.shopModal,category:e.target.value,step:3};render();},'cl-cat')}><option value="">${esc(Lx.choose)}</option>${each(CATS,(c,i)=>`<option value="${i}"${String(m.category)===String(i)?' selected':''}>${esc(c[li()])}</option>`)}</select>`)}
        ${field(Lx.descK,`<textarea class="fld" rows="3" ${onInput(e=>{state.shopModal={...state.shopModal,text:e.target.value};},'cl-text')}>${esc(m.text||'')}</textarea>`)}
        <button ${m.category!==''?on(send):'disabled'} style="${BTN_PRIMARY}">${spin()}${esc(Lx.sendClaim)}</button>`}`;
  }else if(m.kind==='brd'){
    const det=m.d,b=det.manifest;title=b.ref;
    body=`<div style="font-size:12.5px;color:var(--mute)">${esc(bstL(b.stage,b.type))} · ${esc(dtm(b.created_at))}${b.driver_name?' · '+esc(b.driver_name)+' '+esc(fmtPhone(b.driver_phone)):''}</div>
      ${b.type==='settlement'?tplShopPayTotals(b.totals||{}):''}
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button ${on(()=>exportManifestPdf(det))} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">⤓ PDF</button>
        <button ${on(()=>exportBrdXlsx(det))} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">⤓ Excel</button>
        ${b.type==='pickup'&&b.stage===0?`<button ${on(()=>act(async()=>{await api('shop/pickups/'+b.id,{method:'DELETE'});state.shopModal=null;await loadShopPage();},Lx.saved))} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px;color:var(--rf)">✕ ${esc(Lx.cancelRequest)}</button>`:''}</div>
      <div style="display:flex;flex-direction:column">${each(det.items,i=>`<div style="display:grid;grid-template-columns:110px 1fr 110px 90px;gap:8px;padding:6px 0;border-top:1px solid var(--line);font-size:12.5px">
        <span style="font-family:var(--mono)">${esc(i.ref)}</span><span>${esc(i.client_name)}${i.role==='pickup'?' ⇄':''}</span><span style="${css(stB(i.status))}">${esc(stL(i.status))}</span><b style="text-align:end">${esc(fmt(i.amount??i.cod))}</b></div>`)}</div>
      <div style="font-size:12px;color:var(--mute)">${each(det.history,h=>`${esc(dtm(h.created_at))} · ${esc(histL(h.action))}<br>`)}</div>`;
  }
  return `<div class="no-print" style="position:fixed;inset:0;z-index:1500;background:oklch(0.1 0.03 262 / .55);display:flex;align-items:center;justify-content:center;padding:16px" data-shop-modal>
    <div style="${CARD};width:min(640px,100%);padding:18px;display:flex;flex-direction:column;gap:12px;max-height:90vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:16px">${esc(title)}</b><button ${on(close)} style="${BTN_GHOST};padding:4px 9px">✕</button></div>${body}</div></div>`;
}
async function openShopBrd(id){state.shopModal={kind:'brd',loading:true};render();try{state.shopModal={kind:'brd',d:await api('shop/manifests/'+id)};}catch(e){state.shopModal=null;toast(e.message,'err');}render();}
async function exportBrdXlsx(det){
  try{await loadLib('xlsx');const b=det.manifest;
    const rows=[['Code','Client','Téléphone','Ville','Statut','CR','Frais','Montant'],...det.items.map(i=>[i.ref,i.client_name,fmtPhone(i.client_phone),i.dest_city_name||'',stL(i.status),i.cod,i.delivery_fee,i.amount??''])];
    const t=b.totals||{};if(b.type==='settlement')rows.push([],['Encaissé (CR)',t.collected],['Honoraires',t.honoraires??(t.collected-t.due)],['Reste à payer',t.due],['Retenue à la source '+(t.rs_rate||0)+' %',t.rs],['Déjà versé',t.remitted_before],['Net à payer',t.balance],['Montant versé',t.paid]);
    const ws=XLSX.utils.aoa_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,b.ref.slice(0,30));XLSX.writeFile(wb,b.ref+'.xlsx');
  }catch(e){toast(e.message,'err');}
}

/* ---------------------------------------------------------------- claims */
function tplShopClaims(d){
  const Lx=L(),ST=['Nouvelle','En cours','Traitée','Fermée'];
  return `<div style="display:flex;justify-content:flex-end"><button ${on(()=>{state.shopModal={kind:'claim',step:1,mode:'code',q:''};render();})} style="${BTN_PRIMARY}">＋ ${esc(Lx.newClaim)}</button></div>
    <div style="${CARD};overflow:hidden">${d.claims.length?each(d.claims,c=>`<div style="display:grid;grid-template-columns:90px 110px minmax(0,1fr) minmax(0,1.6fr) 100px 110px;gap:10px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line);font-size:12.5px">
      <b style="font-family:var(--mono)">RC-${String(c.id).padStart(4,'0')}</b><span ${on(()=>openShopOrder(c.order_id))} style="font-family:var(--mono);cursor:pointer;text-decoration:underline dotted">${esc(c.ref)}</span><span>${esc(CATS[c.category]?.[li()]||'')}</span>
      <span>${esc(c.text||'')}</span><span style="${css(badge(c.status>=2?'g':c.status===1?'o':'n'))}">${esc(ST[c.status])}</span><span style="color:var(--mute)">${esc(dtm(c.created_at))}</span></div>`)
      :`<div style="padding:30px;text-align:center;color:var(--mute)">${esc(Lx.noClaim)}</div>`}</div>`;
}

/* ---------------------------------------------------------------- bordereaux lists (exchanges, returns, payments, pickups) */
function brdTable(list,cols){
  const Lx=L();
  return `<div style="${CARD};overflow:hidden"><div style="overflow-x:auto"><div style="min-width:700px">${list.length?each(list,x=>`<div ${on(()=>openShopBrd(x.id))} style="display:grid;grid-template-columns:${cols.map(c=>c[2]||'minmax(0,1fr)').join(' ')};gap:10px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line);font-size:12.5px;cursor:pointer" data-shopbrd="${esc(x.ref)}">${each(cols,c=>`<span>${c[1](x)}</span>`)}</div>`):empty(Lx.noBrd)}</div></div></div>`;
}
const stageCell=x=>`<span style="${css(badge(BSTAGE[x.stage][2]))}">${esc(bstL(x.stage,x.type))}</span>`;
function tplShopExchanges([m,p]){
  const Lx=L();
  return `<b>${esc(Lx.exchangeBrds)}</b>${brdTable(m.manifests,[['code',x=>`<b style="font-family:var(--mono)">${esc(x.ref)}</b>`,'150px'],['date',x=>esc(dtm(x.created_at))],['n',x=>x.n+' '+esc(Lx.parcels)],['st',stageCell],['by',x=>esc(x.created_by_name||'')]])}
    <b>${esc(Lx.exchangeParcels)} (${p.total})</b>
    <div style="${CARD};overflow:hidden">${p.rows.length?each(p.rows,r=>`<div style="display:grid;grid-template-columns:130px minmax(0,1fr) 120px 70px 110px;gap:10px;align-items:center;padding:8px var(--pad);border-top:1px solid var(--line);font-size:12.5px">
      <span ${on(()=>openShopOrder(r.id))} style="font-family:var(--mono);cursor:pointer;text-decoration:underline dotted">${esc(r.ref)}</span><span>${esc(r.client_name)}<br><span style="color:var(--mute)">${esc(r.description||'')}</span></span>
      <span style="${css(stB(r.status))}">${esc(stL(r.status))}</span><span>${r.attempts} ${esc(Lx.attemptsShort)}</span><span style="color:var(--mute)">${esc(dtm(r.created_at))}</span></div>`):empty()}</div>`;
}
function tplShopReturns(d){
  const Lx=L();
  return brdTable(d.manifests,[['code',x=>`<b style="font-family:var(--mono)">${esc(x.ref)}</b>`,'150px'],['date',x=>esc(dtm(x.created_at))],['n',x=>x.n+' '+esc(Lx.parcels)],['st',stageCell],
    ['sig',x=>esc(x.signer_name?Lx.receivedBy+' '+x.signer_name:'')]]);
}
function tplShopPayTotals(t){
  const Lx=L(),u=Lx.tnd,row=(l,v,b)=>`<div style="display:flex;justify-content:space-between;${b?'font-weight:700':''}"><span>${esc(l)}</span><span>${esc(v)}</span></div>`;
  return `<div style="display:flex;flex-direction:column;gap:4px;font-size:12.5px;padding:10px;border-radius:var(--r);background:var(--surface2)">
    ${row(Lx.nDelivered,String(t.orders??0))}${row(Lx.nReturned,String(t.returned??0))}${row(Lx.crAfter,fmt(t.collected,u))}${row(Lx.totalFees,fmt(t.honoraires??(t.collected-t.due),u))}${row(Lx.restToPay,fmt(t.due,u))}
    ${row(Lx.rsK+' '+(t.rs_rate||0)+' %',fmt(t.rs,u))}${t.remitted_before?row(Lx.alreadyPaid,fmt(t.remitted_before,u)):''}${row(Lx.netToPay,fmt(t.paid??t.balance,u),true)}</div>`;
}
function tplShopPayments(d){
  const Lx=L(),u=Lx.tnd;
  return brdTable(d.manifests,[['code',x=>`<b style="font-family:var(--mono)">${esc(x.ref)}</b>`,'140px'],['period',x=>esc((x.period_from||'')+' → '+(x.period_to||''))],['n',x=>(x.totals?.orders??x.n)+' '+esc(Lx.deliveredN)],
    ['cr',x=>esc(fmt(x.totals?.collected,u))],['fees',x=>esc(Lx.totalFees)+' '+esc(fmt(x.totals?.honoraires??((x.totals?.collected||0)-(x.totals?.due||0))))],['rs',x=>'RS '+esc(fmt(x.totals?.rs))],
    ['before',x=>x.totals?.remitted_before?esc(Lx.alreadyPaid)+' '+esc(fmt(x.totals.remitted_before)):''],['net',x=>`<b>${esc(fmt(x.totals?.paid??x.totals?.balance,u))}</b>`],['st',x=>x.stage===5?`<span style="${css(badge('r'))}">ANNULÉ</span>`:esc(dtm(x.closed_at))]]);
}

/* ---------------------------------------------------------------- pickups: prepare (selection / scan) + history */
function tplShopPickupsPage([h,w]){
  const Lx=L(),sel=state.pkSel||(state.pkSel=[]),mode=state.pkMode||'select',rows=w.rows;
  const toggle=id=>()=>{state.pkSel=sel.includes(id)?sel.filter(x=>x!==id):[...sel,id];render();};
  const addCode=code=>{const r=rows.find(x=>x.ref.toUpperCase()===code.toUpperCase());if(!r)throw new Error(code+' : '+Lx.notWaiting);if(!sel.includes(r.id))state.pkSel=[...sel,r.id];render();return {message:r.ref+' ✓'};};
  const scanSubmit=()=>{const v=(state.pkScan||'').trim();if(!v)return;state.pkScan='';try{addCode(v);}catch(e){toast(e.message,'err');}render();};
  const confirm=()=>act(async()=>{const r=await api('shop/pickups',{method:'POST',body:{order_ids:state.pkSel,comment:state.pkComment||''}});state.pkSel=[];toast(Lx.pickupRequested+' : '+r.manifest.ref+' ('+r.parcels+')');await loadShopPage();},null);
  return `<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px" data-prep-pickup>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><b>${esc(Lx.preparePickup)}</b><span style="${css(badge(sel.length?'o':'n'))}">${sel.length} ${esc(Lx.selectedK)}</span></div>
      <div style="display:flex;gap:6px">${each([['select',Lx.modeSelect],['scan',Lx.modeScan]],([k,l])=>`<button ${on(()=>{state.pkMode=k;render();})} style="${css(chip(mode===k))}">${esc(l)}</button>`)}</div>
      ${mode==='scan'?`<form data-form="pkscan" onsubmit="return false" style="display:flex;gap:6px;flex-wrap:wrap"><input class="fld" ${onInput(e=>{state.pkScan=e.target.value;},'pk-scan')} value="${esc(state.pkScan||'')}" placeholder="${esc(Lx.scanPh)}" style="font-family:var(--mono);flex:1;min-width:180px">
          <button ${on(scanSubmit)} style="${BTN_PRIMARY}">OK</button><button type="button" ${on(()=>openScanner(null,{title:Lx.preparePickup,handler:async ref=>addCode(ref)}))} style="${BTN_GHOST}">📷 ${esc(Lx.camera)}</button></form>
          ${sel.length?`<span style="font-size:12.5px;font-family:var(--mono)">${esc(rows.filter(r=>sel.includes(r.id)).map(r=>r.ref).join(', '))}</span>`:''}`
      :`<div style="max-height:300px;overflow:auto;display:flex;flex-direction:column">${rows.length?each(rows,r=>`<label style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);cursor:pointer;font-size:12.5px"><input type="checkbox" ${sel.includes(r.id)?'checked':''} ${on(toggle(r.id))}><span style="font-family:var(--mono)">${esc(r.ref)}</span><span style="flex:1">${esc(r.client_name)}</span><span>${esc(fmt(r.cod))}</span></label>`):empty(Lx.noWaiting)}</div>`}
      ${field(Lx.commentK+' ('+Lx.optional+')',`<input class="fld" ${onInput(e=>{state.pkComment=e.target.value;},'pk-com')} value="${esc(state.pkComment||'')}">`)}
      <button ${sel.length?on(confirm):'disabled'} style="${BTN_PRIMARY}">${spin()}${esc(Lx.confirmK)}</button></div>
    <b>${esc(Lx.pickupHistory)}</b>
    ${brdTable(h.manifests,[['code',x=>`<b style="font-family:var(--mono)">${esc(x.ref)}</b>`,'150px'],['addr',x=>esc(x.pickup_address||'')],['drv',x=>esc(x.driver_name||'—')+(x.driver_phone?'<br>'+telLink(x.driver_phone):'')],['st',stageCell],['n',x=>x.n+' '+esc(Lx.parcels),'90px'],['date',x=>esc(dtm(x.created_at)),'110px']])}`;
}

/* ---------------------------------------------------------------- statistics */
function shopStatsQuery(){const f=state.ssf||{};return f.from&&f.to?`from=${f.from}&to=${f.to}`:'preset='+(f.preset||'all');}
function tplShopStats(d){
  const Lx=L(),f=state.ssf||(state.ssf={preset:'all'}),k=d.kpis,dl=d.delay,nd=Math.max(1,k.delivered);
  const reload=()=>{state.sp=null;render();loadShopPage().then(render).catch(e=>toast(e.message,'err'));};
  const pct=(a,b)=>b?Math.round(a/b*1000)/10+' %':'—';
  const bucket=(l,n)=>`<div style="display:grid;grid-template-columns:120px 1fr 90px;gap:10px;align-items:center;font-size:12.5px" title="${esc(l+' : '+n)}"><span>${esc(l)}</span><span style="height:12px;background:var(--surface2);border-radius:4px;overflow:hidden"><span style="display:block;height:100%;width:${n/nd*100}%;background:var(--navy);border-radius:0 4px 4px 0"></span></span><b style="text-align:end">${n} · ${pct(n,k.delivered)}</b></div>`;
  return `<div style="${CARD};padding:var(--pad);display:flex;flex-wrap:wrap;gap:8px;align-items:end">
      ${each([['all',Lx.allPeriod],['1m',Lx.lastMonth],['2m',Lx.last2m],['3m',Lx.last3m],['12m',Lx.lastYear]],([p,l])=>`<button ${on(()=>{state.ssf={preset:p};reload();})} style="${css(chip(!f.from&&(f.preset||'all')===p))}">${esc(l)}</button>`)}
      ${field(Lx.periodFrom,input('ss-from','ssf','from','type="date"'))}${field(Lx.periodTo,input('ss-to','ssf','to','type="date"'))}<button ${on(reload)} style="${BTN_PRIMARY};min-height:42px">${esc(Lx.showK)}</button></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:var(--gap)">
      ${kpiCard(Lx.parcelsTotal,String(k.total))}${kpiCard(Lx.cDelivered,String(k.delivered),pct(k.delivered,k.total))}${kpiCard(Lx.cReturned,String(k.returned),pct(k.returned,k.total))}${kpiCard(Lx.inProgressK,String(k.in_progress),pct(k.in_progress,k.total))}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:var(--gap)">
      <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:8px"><b>${esc(Lx.deliveryTime)}</b>${bucket(Lx.lt24,dl.h24)}${bucket(Lx.lt48,dl.h48)}${bucket(Lx.lt72,dl.h72)}${bucket(Lx.gt72,dl.more)}</div>
      <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:8px"><b>${esc(Lx.problemsByType)}</b>${hbars(d.problems,{label:r=>pbL(r.type),value:r=>r.n,tone:'var(--orange)'})}</div>
      <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:8px"><b>${esc(Lx.claimsByType)}</b>${hbars(d.claims,{label:r=>CATS[r.category]?.[li()]||'',value:r=>r.n,tone:'var(--orange)'})}</div>
      <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:8px"><b>${esc(Lx.byGovernorate)}</b>${hbars(d.governorates,{label:r=>r.name,value:r=>r.n})}</div></div>`;
}

/* ---------------------------------------------------------------- settings: profile + users */
function tplShopSettings([pr,us]){
  const Lx=L(),p=pr.profile,me=pr.me,uf=state.suf||(state.suf={name:'',phone:'',email:'',password:'',shop_role:'agent'});
  const setFmt=v=>act(async()=>{await api('shop/profile',{method:'PATCH',body:{print_format:v}});state.shop.me.print_format=v;await loadShopPage();},Lx.saved);
  const addUser=()=>act(async()=>{await api('shop/users',{method:'POST',body:state.suf});state.suf={name:'',phone:'',email:'',password:'',shop_role:'agent'};await loadShopPage();},Lx.saved);
  const toggle=x=>()=>act(async()=>{await api('shop/users/'+x.id,{method:'PATCH',body:{active:!x.active}});await loadShopPage();},Lx.saved);
  const row=(l,v)=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--line);font-size:12.5px"><span style="color:var(--mute)">${esc(l)}</span><b style="font-weight:600">${esc(v||'—')}</b></div>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:var(--gap);align-items:start">
    <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:6px" data-profile><b>${esc(Lx.myProfile)}</b>
      ${row(Lx.colShop,p.shop_name)}${row(Lx.name,p.name)}${row(Lx.phone,fmtPhone(p.phone))}${row(Lx.email,p.email)}${row(Lx.address,p.address)}${row(Lx.agencyLbl,p.agency_name+(p.agency_phone?' · '+p.agency_phone:''))}
      <span style="font-size:12px;color:var(--mute)">${esc(Lx.profileManaged)}</span>
      ${field(Lx.printFormat,`<div style="display:flex;gap:6px">${each([['a6',Lx.fmtA6],['a4',Lx.fmtA4]],([k,l])=>`<button ${on(()=>setFmt(k))} style="${css(chip((me.print_format||'a6')===k))}">${esc(l)}</button>`)}</div>`)}</div>
    <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:8px" data-shop-users><b>${esc(Lx.usersK)}</b>
      ${each(us.users,x=>`<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--line);font-size:12.5px;${x.active?'':'opacity:.55'}">
        <b style="flex:1;min-width:140px">${esc(x.name)}</b><span>${esc(x.phone?fmtPhone(x.phone):x.email||'')}</span><span style="${css(badge(x.parent_id?(x.shop_role==='admin'?'i':'n'):'g'))}">${esc(x.parent_id?(x.shop_role==='admin'?Lx.roleAdmin:Lx.roleAgent):Lx.roleOwner)}</span>
        <span style="${css(badge(x.active?'g':'r'))}">${esc(x.active?Lx.activeK:Lx.inactiveK)}</span>
        ${us.can_manage&&x.parent_id?`<button ${on(toggle(x))} style="${BTN_GHOST};padding:4px 8px;font-size:12px">${esc(x.active?Lx.disableK:Lx.enableK)}</button>`:''}</div>`)}
      ${us.can_manage?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">${field(Lx.name,input('su-name','suf','name'))}${field(Lx.phone,input('su-phone','suf','phone','type="tel"'))}
        ${field(Lx.email+' ('+Lx.optional+')',input('su-mail','suf','email','type="email"'))}${field(Lx.password,input('su-pw','suf','password','type="password"'))}
        ${field(Lx.userRoleK,select('su-role','suf','shop_role',[['agent',Lx.roleAgent],['admin',Lx.roleAdmin]]))}<button ${on(addUser)} style="${BTN_PRIMARY};align-self:end;min-height:42px">${spin()}＋ ${esc(Lx.addUser)}</button></div>`:`<span style="font-size:12px;color:var(--mute)">${esc(Lx.usersReadOnly)}</span>`}
    </div></div>`;
}

Object.assign(K,{
  createParcel:['Créer un colis','إنشاء طرد'],hello:['Bonjour','مرحبا'],helloSub:['Voici où en sont vos colis aujourd’hui.','هذه حالة طرودك اليوم.'],trackCode:['Code de suivi d’un colis','رمز تتبع الطرد'],
  trackBtn2:['Suivre','تتبع'],parcelNotFound:['Colis introuvable dans votre boutique.','الطرد غير موجود.'],essentials:['L’essentiel','الأساسي'],detailedFollow:['Suivi détaillé','متابعة مفصلة'],
  cDelivered:['Colis livrés','طرود مسلمة'],cReturned:['Colis reçus par l’expéditeur','طرود أرجعت للمرسل'],cWithUs:['Colis chez Saden','طرود لدى سادن'],cOut:['En cours de livraison','قيد التوصيل'],
  cStock:['Reçus à l’entrepôt','في المستودع'],cPrepReturn:['En préparation au retour','قيد التحضير للإرجاع'],cSettled:['Colis soldés','طرود مسواة'],cWaiting:['En attente d’enlèvement','في انتظار الالتقاط'],
  importTitle:['Import Excel en masse','استيراد Excel'],importHint:['Téléchargez le modèle, remplissez une ligne par colis puis importez le fichier : chaque ligne invalide est signalée avec son numéro.','حمّل النموذج ثم استورد الملف.'],
  importTemplate:['Modèle Excel','نموذج Excel'],importFile:['Importer un fichier Excel','استيراد ملف'],emptyFile:['Fichier vide.','ملف فارغ.'],importDone:['Import terminé','تم الاستيراد'],createdK:['colis créés','طرود أنشئت'],
  errorsK:['lignes en erreur','أخطاء'],lineK:['Ligne','السطر'],printLabels:['Imprimer les étiquettes','طباعة الملصقات'],requestPickupSel:['Demander l’enlèvement','طلب الالتقاط'],cancelSelected:['Annuler la sélection','إلغاء المحدد'],
  createdOn:['Créé le','أنشئ'],editK:['Modifier','تعديل'],noWaiting:['Aucun colis en attente.','لا توجد طرود في الانتظار.'],journeyK:['Parcours','المسار'],problemsTab:['Problèmes','المشاكل'],
  claimOpen:['Réclamation en cours','شكوى جارية'],claimBtn:['Réclamer','تقديم شكوى'],newClaim:['Nouvelle réclamation','شكوى جديدة'],cStep1:['Trouver le colis','إيجاد الطرد'],cStep2:['Choisir le problème','اختيار المشكلة'],
  cStep3:['Envoyer','إرسال'],byCode:['Code de suivi','رمز التتبع'],byPhone:['Téléphone du client','هاتف الحريف'],claimType:['Type de problème','نوع المشكلة'],sendClaim:['Envoyer la réclamation','إرسال الشكوى'],
  claimSent:['Réclamation envoyée','تم إرسال الشكوى'],noClaim:['Aucune réclamation.','لا توجد شكاوى.'],cancelRequest:['Annuler la demande','إلغاء الطلب'],exchangeBrds:['Bordereaux d’échange','بوليصات التبديل'],
  exchangeParcels:['Colis d’échange','طرود التبديل'],receivedBy:['Reçu par','استلمه'],nDelivered:['Colis livrés','طرود مسلمة'],nReturned:['Colis reçus par l’expéditeur','طرود مرجعة'],crAfter:['CR encaissé','المبلغ المحصل'],
  totalFees:['Honoraires','الأتعاب'],restToPay:['Reste à payer','الباقي'],rsK:['Retenue à la source','الخصم من المورد'],netToPay:['Net à payer','الصافي'],preparePickup:['Préparer une expédition (demande d’enlèvement)','تحضير إرسالية'],
  modeSelect:['Sélection de colis','اختيار الطرود'],modeScan:['Scanner des colis','مسح الطرود'],notWaiting:['n’est pas en attente d’enlèvement','ليس في الانتظار'],confirmK:['Confirmer','تأكيد'],pickupHistory:['Historique des expéditions','سجل الإرساليات'],
  allPeriod:['Toute la période','كل الفترة'],lastMonth:['Dernier mois','آخر شهر'],last2m:['2 derniers mois','آخر شهرين'],last3m:['3 derniers mois','آخر 3 أشهر'],lastYear:['Dernière année','آخر سنة'],showK:['Afficher','عرض'],
  deliveryTime:['Colis livrés : en combien de temps ?','مدة التوصيل'],lt24:['Moins de 24 h','أقل من 24 س'],lt48:['24 à 48 h','24 إلى 48 س'],lt72:['48 à 72 h','48 إلى 72 س'],gt72:['Plus de 72 h','أكثر من 72 س'],
  myProfile:['Mon profil','ملفي'],profileManaged:['Ces informations sont gérées par votre agence.','تدير الوكالة هذه المعلومات.'],printFormat:['Format d’impression des étiquettes','حجم الطباعة'],fmtA6:['10×15 (A6)','10×15'],fmtA4:['A4 (4 par page)','A4'],
  usersK:['Utilisateurs','المستخدمون'],roleOwner:['Compte principal','الحساب الرئيسي'],roleAdmin:['Administrateur','مدير'],roleAgent:['Agent','عون'],activeK:['Actif','نشط'],disableK:['Désactiver','تعطيل'],enableK:['Activer','تفعيل'],
  userRoleK:['Rôle','الدور'],addUser:['Ajouter un utilisateur','إضافة مستخدم'],usersReadOnly:['Seul un administrateur de la boutique gère les utilisateurs.','المدير فقط يدير المستخدمين.'],
});
