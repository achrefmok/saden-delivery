/* SADEN — « Stock » per agency: entry into stock (USB scanner / camera / manual), current stock with counters and
   filters, incoming / outgoing transfers, inventories, anomalies (validated corrections) and movement history.
   A parcel is only counted as present once its reception has been confirmed. */

const STK_TABS=[['entry',['Entrée en stock','الإدخال للمخزون']],['current',['Stock actuel','المخزون الحالي']],['in',['Transferts entrants','التحويلات الواردة']],
  ['out',['Transferts sortants','التحويلات الصادرة']],['inventories',['Inventaires','الجرد']],['anomalies',['Anomalies','الإخلالات']],['moves',['Mouvements','الحركات']]];
const stkAgency=()=>role()==='manager'?myAgency()?.id:+(state.agencyFilter||state.stkAg||G().agencies.find(a=>a.active)?.id||0);
const MOVE_L={reception:['Réception en agence','استلام'],transfer_in:['Réception transfert','استلام تحويل'],transfer_out:['Départ transfert','خروج تحويل'],return:['Retour en agence','إرجاع'],
  return_driver:['Retour livreur','إرجاع موزع'],dispatch:['Remise au livreur','تسليم للموزع'],delivery:['Sortie livraison','خروج للتوصيل'],restitution:['Restitution boutique','إرجاع للمتجر'],
  lost:['Déclaré perdu','مفقود'],inventory_adjust:['Correction d’inventaire','تصحيح جرد'],cancel:['Annulation de bordereau','إلغاء بوليصة'],exchange_pickup:['Récupération échange','استرجاع تبديل'],relocation:['Changement d’agence','تغيير وكالة']};
const PATH_L={shop:['dépôt boutique','إيداع متجر'],transfer:['transfert','تحويل'],driver:['retour livreur','إرجاع موزع'],client:['retour client','إرجاع حريف'],return:['retour boutique','إرجاع متجر'],relocation:['changement d’agence','تغيير وكالة']};

async function loadStock(){
  const tab=state.stkTab||'entry',ag=stkAgency();
  if(!ag)return;
  const f=state.stkF||{},qs=new URLSearchParams({agency_id:ag});
  let data;
  if(tab==='entry')data=await api('stock/incoming?'+qs);
  else if(tab==='current'){for(const k of ['category','status','shop_id','driver_id','from','to','q'])if(f[k])qs.set(k,f[k]);data=await api('stock?'+qs);}
  else if(tab==='in'||tab==='out')data=await api(`manifests?type=transfer&direction=${tab}&agency_id=${ag}`);
  else if(tab==='inventories')data=await api(`manifests?type=inventory&agency_id=${ag}`);
  else if(tab==='anomalies')data=await api(`stock/anomalies?agency_id=${ag}&status=${f.astatus||'open'}`);
  else if(tab==='moves'){for(const k of ['from','to'])if(f[k])qs.set(k,f[k]);data=await api('stock/movements?'+qs);}
  // counters shown above every tab
  const counts=tab==='current'?data.counts:(await api('stock?counts_only=1&agency_id='+ag)).counts;
  if((state.stkTab||'entry')===tab)state.stk={tab,ag,data,counts};
}
function goStkTab(t){state.stkTab=t;state.stk=null;render();loadStock().then(render).catch(e=>toast(e.message,'err'));}

async function stockReceive(code,extra={}){
  const Lx=L(),f=state.stkEntry||{};
  const body={code,agency_id:stkAgency(),condition:state.stkCond==='damaged'?'damaged':undefined,reason:f.reason||undefined,comment:f.comment||undefined,...extra};
  try{
    const r=await api('stock/receive',{method:'POST',body});
    state.stkLog=[{ref:r.order?.ref||code,ok:!r.already&&!r.extra,msg:(r.already?Lx.alreadyInStock:r.message)+(r.path?' ('+(PATH_L[r.path]||[r.path,r.path])[li()]+')':'')},...(state.stkLog||[])].slice(0,10);
    if(state.stkCond==='damaged')state.stkCond='ok';
    loadStock().then(render).catch(()=>{});
    render();return r;
  }catch(e){
    state.stkLog=[{ref:String(code).toUpperCase(),ok:false,msg:e.message},...(state.stkLog||[])].slice(0,10);render();
    if(e.message&&/Motif de retour/.test(e.message))toast(Lx.chooseReasonThenRescan,'err');
    throw e;
  }
}

function tplStock(){
  const Lx=L(),tab=state.stkTab||(state.stkTab='entry'),ag=stkAgency(),s=state.stk&&state.stk.tab===tab&&state.stk.ag===ag?state.stk:null;
  if(!s&&ag&&state._stkReq!==tab+ag){state._stkReq=tab+ag;loadStock().catch(e=>toast(e.message,'err')).finally(()=>{state._stkReq=null;render();});}
  const tabs=`<div class="no-print" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px">${each(STK_TABS,([k,l])=>`<button ${on(()=>goStkTab(k))} data-stab="${k}" style="${css(chip(tab===k))}">${esc(l[li()])}</button>`)}</div>`;
  const agSel=role()==='admin'&&!state.agencyFilter?`<div style="display:flex;gap:8px;align-items:center"><span style="color:var(--mute);font-size:12.5px">${esc(Lx.agencyLbl)}</span><select class="fld" style="max-width:240px" ${onInput(e=>{state.stkAg=e.target.value;state.stk=null;render();},'stk-ag')}>${each(agencyOptions(),([v,l])=>`<option value="${v}"${+v===ag?' selected':''}>${esc(l)}</option>`)}</select></div>`:'';
  const c=s?.counts;
  const kpis=c?`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:var(--gap)" data-stock-kpis>
    ${kpiCard(Lx.stkPresent,String(c.present))}${kpiCard(Lx.stkAvailable,String(c.available))}${kpiCard(Lx.stkProcessing,String(c.processing))}${kpiCard(Lx.stkReturns,String(c.returns))}
    ${kpiCard(Lx.stkOutgoing,String(c.outgoing))}${kpiCard(Lx.stkIncoming,String(c.incoming))}${kpiCard(Lx.anomaliesK,String(c.anomalies))}</div>`:'';
  const body=!s?`<div style="${CARD};padding:24px"><span class="spin"></span></div>`:({entry:tplStockEntry,current:tplStockCurrent,in:tplStockTransfers,out:tplStockTransfers,inventories:tplStockInventories,anomalies:tplStockAnomalies,moves:tplStockMoves}[tab])(s);
  return `${tabs}${agSel}${kpis}${body}`;
}

function tplStockEntry(s){
  const Lx=L(),d=s.data,f=state.stkEntry||(state.stkEntry={reason:'',comment:''});
  const submit=()=>{const v=(state.stkScanVal||'').trim();if(!v)return;state.stkScanVal='';render();stockReceive(v).catch(()=>{});};
  const box=`<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px" data-stock-entry>
    <b>${esc(Lx.receiveTitle)}</b>
    <form data-form="sscan" onsubmit="return false" style="display:flex;gap:6px;flex-wrap:wrap">
      <input class="fld" ${onInput(e=>{state.stkScanVal=e.target.value;},'stk-scan')} value="${esc(state.stkScanVal||'')}" placeholder="${esc(Lx.scanPh)}" autocomplete="off" autocapitalize="characters" style="font-family:var(--mono);flex:1;min-width:200px">
      <button ${on(submit)} style="${BTN_PRIMARY};padding:9px 16px">${esc(Lx.confirmEntry)}</button>
      <button type="button" ${on(()=>openScanner(null,{title:Lx.receiveTitle,handler:ref=>stockReceive(ref)}))} style="${BTN_GHOST}">${ico('camera',16)} ${esc(Lx.camera)}</button>
    </form>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="font-size:12.5px;color:var(--mute)">${esc(Lx.nextScan)}</span>${each([['ok',Lx.condOk],['damaged',Lx.condDamaged]],([k,l])=>`<button type="button" ${on(()=>{state.stkCond=k;render();})} style="${css(chip((state.stkCond||'ok')===k))}">${esc(l)}</button>`)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
      ${field(Lx.returnReason+' ('+Lx.ifDriverReturn+')',`<select class="fld" ${onInput(e=>{state.stkEntry={...state.stkEntry,reason:e.target.value};render();},'stk-reason')}>${each([['',Lx.autoReason],...RET_REASONS.map(([k,l])=>[k,l[li()]])],([v,l])=>`<option value="${v}"${f.reason===v?' selected':''}>${esc(l)}</option>`)}</select>`)}
      ${field(Lx.commentK,`<input class="fld" ${onInput(e=>{state.stkEntry={...state.stkEntry,comment:e.target.value};},'stk-com')} value="${esc(f.comment||'')}">`)}
    </div>
    <span style="font-size:12px;color:var(--mute)">${esc(Lx.usbHint)} · ${esc(Lx.entryRule)}</span>
    ${when((state.stkLog||[]).length,()=>`<div style="display:flex;flex-direction:column;gap:2px;font-size:12.5px" data-scanlog>${each(state.stkLog,r=>`<span style="color:${r.ok?'var(--gf)':'var(--rf)'}">${r.ok?'✓':'✕'} <b style="font-family:var(--mono)">${esc(r.ref)}</b> · ${esc(r.msg)}</span>`)}</div>`)}
    <div><button ${on(()=>{state.anForm={kind:'autre',code:'',note:''};state.anOpen=!state.anOpen;render();})} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">⚠ ${esc(Lx.reportAnomaly)}</button></div>
    ${when(state.anOpen,()=>`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;align-items:end">
      ${field(Lx.codeK,input('an-code','anForm','code','style="font-family:var(--mono)"'))}
      ${field(Lx.kindK,select('an-kind','anForm','kind',[['autre',anomL('autre')],['endommage',anomL('endommage')],['inconnu',anomL('inconnu')],['supplementaire',anomL('supplementaire')],['manquant',anomL('manquant')]]))}
      ${field(Lx.descK,input('an-note','anForm','note'))}
      <button ${on(()=>act(async()=>{await api('stock/anomalies',{method:'POST',body:{...state.anForm,agency_id:stkAgency()}});state.anOpen=false;await loadStock();},Lx.saved))} style="${BTN_PRIMARY}">${esc(Lx.save)}</button></div>`)}
  </div>`;
  const recv=o=>`<button ${on(()=>stockReceive(o.ref).catch(()=>{}))} style="${BTN_GHOST};padding:4px 9px;font-size:12px">${esc(Lx.confirmEntry)}</button>`;
  const rows=(list,extra)=>list.length?each(list,o=>`<div style="display:grid;grid-template-columns:100px minmax(0,1fr) minmax(0,1fr) 120px auto;gap:10px;align-items:center;padding:8px var(--pad);border-top:1px solid var(--line)">
      <span ${on(()=>selectOrder(o.id))} style="font-family:var(--mono);font-size:12px;cursor:pointer">${esc(o.ref)}</span><span>${esc(o.client_name)}</span><span style="color:var(--mute);font-size:12.5px">${esc(extra(o))}</span>
      <span style="${css(stB(o.status))}">${esc(stL(o.status))}</span>${recv(o)}</div>`):empty(Lx.nothingExpected);
  const cat=(key,title,list,extra)=>`<details style="${CARD};overflow:hidden" ${list.length?'open':''} data-cat="${key}"><summary style="padding:var(--pad);cursor:pointer;display:flex;justify-content:space-between;gap:8px"><b>${esc(title)}</b><span style="${css(badge(list.length?'o':'n'))}">${list.length}</span></summary><div style="overflow-x:auto"><div style="min-width:560px">${rows(list,extra)}</div></div></details>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:var(--gap);align-items:start">
    <div style="display:flex;flex-direction:column;gap:var(--gap)">${box}
      <div style="${CARD};padding:var(--pad);display:flex;justify-content:space-between"><b>${esc(Lx.awaitingReception)}</b><b style="font-size:18px">${d.total}</b></div></div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${cat('shops',Lx.fromShops,d.shops,o=>o.shop_name||'')}
      ${cat('transfers',Lx.fromAgencies,d.transfers,o=>(o.manifest_ref||'')+' · '+(o.from_agency||''))}
      ${cat('drivers',Lx.fromDrivers,d.drivers,o=>o.driver_name||'')}
      ${cat('clients',Lx.fromClients,d.clients,o=>(o.related_ref?'↔ '+o.related_ref+' · ':'')+(o.driver_name||''))}
      <details style="${CARD};overflow:hidden" ${d.anomalies.length?'open':''} data-cat="anomalies"><summary style="padding:var(--pad);cursor:pointer;display:flex;justify-content:space-between"><b>${esc(Lx.receptionAnomalies)}</b><span style="${css(badge(d.anomalies.length?'r':'n'))}">${d.anomalies.length}</span></summary>
        ${d.anomalies.length?each(d.anomalies,a=>`<div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px var(--pad);border-top:1px solid var(--line);font-size:12.5px"><span style="${css(badge('r'))}">${esc(anomL(a.kind))}</span><b style="font-family:var(--mono)">${esc(a.order_ref||a.code||'')}</b><span style="color:var(--mute)">${esc([a.manifest_ref,a.note].filter(Boolean).join(' · '))}</span></div>`):empty()}
      </details>
    </div></div>`;
}

function tplStockCurrent(s){
  const Lx=L(),d=state.data,f=state.stkF||(state.stkF={}),ps=s.data.parcels;
  const apply=()=>{state.stk=null;render();loadStock().then(render).catch(e=>toast(e.message,'err'));};
  const ag=stkAgency();
  const filters=`<div style="${CARD};padding:var(--pad);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px;align-items:end">
    ${field(Lx.categoryK,select('sf-cat','stkF','category',[['',Lx.any],['available',Lx.stkAvailable],['processing',Lx.stkProcessing],['returns',Lx.stkReturns]]))}
    ${field(Lx.statusK,select('sf-st','stkF','status',[['',Lx.any],...['en_agence','arrive','affecte','endommage','retour','retour_agence','annule'].map(k=>[k,stL(k)])]))}
    ${field(Lx.colShop,select('sf-sh','stkF','shop_id',[['',Lx.any],...(d.shops||[]).filter(x=>x.agency_id===ag).map(x=>[x.id,x.shop_name])]))}
    ${field(Lx.driverK,select('sf-dr','stkF','driver_id',[['',Lx.any],...(d.drivers||[]).filter(x=>x.agency_id===ag).map(x=>[x.id,x.name])]))}
    ${field(Lx.inSinceFrom,input('sf-from','stkF','from','type="date"'))}${field(Lx.periodTo,input('sf-to','stkF','to','type="date"'))}
    ${field(Lx.searchK,input('sf-q','stkF','q','placeholder="SD-… / client"'))}
    <button ${on(apply)} style="${BTN_PRIMARY};min-height:42px">${esc(Lx.apply)}</button></div>`;
  const CAT={available:['g',Lx.stkAvailable],processing:['w',Lx.stkProcessing],returns:['o',Lx.stkReturns]};
  return `${filters}<div style="${CARD};overflow:hidden"><div style="padding:var(--pad);display:flex;justify-content:space-between"><b>${esc(Lx.parcelsInStock)} (${ps.length})</b></div>
    <div style="overflow-x:auto"><div style="min-width:760px">
    ${ps.length?each(ps,o=>`<div style="display:grid;grid-template-columns:100px minmax(0,1fr) minmax(0,1fr) 120px 110px 110px;gap:10px;align-items:center;padding:8px var(--pad);border-top:1px solid var(--line)">
      <span ${on(()=>selectOrder(o.id))} style="font-family:var(--mono);font-size:12px;cursor:pointer">${esc(o.ref)}</span><span>${esc(o.client_name)}<br><span style="font-size:11.5px;color:var(--mute)">${esc(o.shop_name||'')}</span></span>
      <span style="color:var(--mute);font-size:12.5px">${esc([o.dest_city_name,o.zone_name].filter(Boolean).join(' · '))}${o.driver_name?' · '+esc(o.driver_name):''}</span>
      <span style="${css(stB(o.status))}">${esc(stL(o.status))}</span><span style="${css(badge(CAT[o.category][0]))}">${esc(CAT[o.category][1])}</span><span style="font-size:12px;color:var(--mute)">${esc(dtm(o.in_since))}</span></div>`):empty(Lx.stockEmpty)}
    </div></div></div>`;
}

function tplStockTransfers(s){
  const Lx=L(),ms=s.data.manifests,out=s.tab==='out';
  return `<div style="${CARD};overflow:hidden"><div style="padding:var(--pad);display:flex;justify-content:space-between;align-items:center"><b>${esc(out?Lx.outgoingTitle:Lx.incomingTitle)}</b>
    ${out?`<button ${on(()=>{goPage('brd');goBrdType('transfer');})} style="${BTN_GHOST};padding:6px 10px">+ ${esc(Lx.newTransfer)}</button>`:''}</div>
    ${ms.length?each(ms,m=>`<div ${on(()=>selectBrd(m.id,'transfer'))} style="display:grid;grid-template-columns:150px minmax(0,1fr) 110px minmax(0,190px) 90px;gap:10px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line);cursor:pointer" data-transfer="${esc(m.ref)}">
      <span style="font-family:var(--mono);font-size:12px">${esc(m.ref)}</span><span>${esc(out?'→ '+(m.dest_agency_name||''):'← '+(m.origin_agency_name||''))}</span>${stageBadge(m)}<span>${recBadge(m.reception_state)}</span>
      <span style="text-align:end;font-size:12.5px">${m.stage>=2?m.received+' / '+m.n:m.n+' '+esc(Lx.lines)}${m.anomalies?' ⚠'+m.anomalies:''}</span></div>`):empty(Lx.noBrd)}</div>`;
}

function tplStockInventories(s){
  const Lx=L(),ms=s.data.manifests;
  const start=()=>act(async()=>{const r=await api('manifests',{method:'POST',body:{type:'inventory',agency_id:stkAgency()}});selectBrd(r.manifest.id,'inventory');},Lx.saved);
  return `<div style="${CARD};overflow:hidden"><div style="padding:var(--pad);display:flex;justify-content:space-between;align-items:center"><b>${esc(Lx.invSessions)}</b>
    ${ms.some(m=>m.stage===0)?'':`<button ${on(start)} style="${BTN_PRIMARY};padding:7px 12px">+ ${esc(Lx.openSession)}</button>`}</div>
    ${ms.length?each(ms,m=>{const t=m.totals||{};return `<div ${on(()=>selectBrd(m.id,'inventory'))} style="display:grid;grid-template-columns:150px 110px minmax(0,1fr) 140px;gap:10px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line);cursor:pointer">
      <span style="font-family:var(--mono);font-size:12px">${esc(m.ref)}</span>${stageBadge(m)}<span style="font-size:12.5px">${m.stage===4?`${t.expected} ${esc(Lx.theoretical.toLowerCase())} · ${t.counted} ${esc(Lx.counted)} · ${t.missing} ${esc(Lx.invMissing)} · ${t.extra} ${esc(Lx.extraK.toLowerCase())}`:`${m.scanned} / ${m.n} ${esc(Lx.counted)}`}</span>
      <span style="text-align:end;font-size:12px;color:var(--mute)">${esc(dtm(m.created_at))}</span></div>`;}):empty(Lx.noBrd)}</div>`;
}

function tplStockAnomalies(s){
  const Lx=L(),list=s.data.anomalies,f=state.stkF||(state.stkF={});
  return `<div style="${CARD};overflow:hidden"><div style="padding:var(--pad);display:flex;gap:6px;align-items:center;flex-wrap:wrap"><b style="flex:1">${esc(Lx.anomaliesK)}</b>
    ${each([['open',Lx.openK],['resolved',Lx.resolvedK],['all',Lx.any]],([k,l])=>`<button ${on(()=>{state.stkF={...f,astatus:k};state.stk=null;render();loadStock().then(render);})} style="${css(chip((f.astatus||'open')===k))}">${esc(l)}</button>`)}</div>
    ${list.length?each(list,a=>`<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line);font-size:12.5px">
      <span style="${css(badge(a.status==='open'?'r':'g'))}">${esc(anomL(a.kind))}</span><b style="font-family:var(--mono)">${esc(a.order_ref||a.code||'')}</b>
      <span style="color:var(--mute);flex:1;min-width:200px">${esc([a.manifest_ref,a.source,a.note,dtm(a.created_at),a.created_by_name].filter(Boolean).join(' · '))}${a.resolution?' → '+esc(a.resolution)+' ('+esc(a.resolved_by_name||'')+(a.corrected?', '+Lx.correctedK:'')+')':''}</span>
      ${when(a.status==='open',()=>tplAnomalyActions(a,loadStock))}</div>`):empty()}</div>`;
}

function tplStockMoves(s){
  const Lx=L(),list=s.data.movements;
  const apply=()=>{state.stk=null;render();loadStock().then(render).catch(e=>toast(e.message,'err'));};
  return `<div style="${CARD};overflow:hidden"><div style="padding:var(--pad);display:flex;gap:8px;align-items:end;flex-wrap:wrap"><b style="flex:1">${esc(Lx.movesTitle)}</b>
      ${field(Lx.periodFrom,input('mv-from','stkF','from','type="date"'))}${field(Lx.periodTo,input('mv-to','stkF','to','type="date"'))}<button ${on(apply)} style="${BTN_GHOST}">${esc(Lx.apply)}</button></div>
    <div style="overflow-x:auto"><div style="min-width:640px">${list.length?each(list,m=>`<div style="display:grid;grid-template-columns:110px 40px 100px minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:center;padding:7px var(--pad);border-top:1px solid var(--line);font-size:12.5px">
      <span style="font-family:var(--mono);color:var(--mute)">${esc(dtm(m.created_at))}</span><b style="color:${m.direction==='in'?'var(--gf)':'var(--rf)'}">${m.direction==='in'?'⬇':'⬆'}</b>
      <span style="font-family:var(--mono)">${esc(m.ref)}</span><span>${esc((MOVE_L[m.reason]||[m.reason_label,m.reason_label])[li()])}${m.manifest_ref?' · '+esc(m.manifest_ref):''}${m.note?' · '+esc(m.note):''}</span><span style="color:var(--mute)">${esc(m.user_name||'Système')}</span></div>`):empty()}</div></div></div>`;
}

Object.assign(K,{
  stock:['Stock','المخزون'],stkPresent:['Présents en stock','الموجود'],stkAvailable:['Disponibles pour livraison','متاح للتوصيل'],stkProcessing:['En attente de traitement','في انتظار المعالجة'],stkReturns:['Retours','المرتجعات'],
  stkOutgoing:['Transferts sortants (colis)','تحويلات صادرة'],stkIncoming:['Transferts entrants (colis)','تحويلات واردة'],
  receiveTitle:['Réception : scanner, viser ou saisir le colis','الاستلام: امسح أو أدخل الطرد'],confirmEntry:['Confirmer l’entrée','تأكيد الإدخال'],alreadyInStock:['Déjà en stock — aucune double réception','موجود في المخزون'],
  ifDriverReturn:['retour livreur','إرجاع موزع'],autoReason:['Déduit du statut','مستنتج من الحالة'],entryRule:['un colis n’est présent qu’après confirmation de sa réception','الطرد لا يعتبر موجودا إلا بعد تأكيد استلامه'],
  chooseReasonThenRescan:['Colis rapporté par un livreur : choisissez le motif puis scannez à nouveau.','اختر سبب الإرجاع ثم امسح من جديد.'],
  reportAnomaly:['Signaler une anomalie de réception','الإبلاغ عن خلل'],codeK:['Code / référence','الرمز'],kindK:['Type','النوع'],descK:['Description','الوصف'],
  awaitingReception:['Colis en attente de réception','طرود في انتظار الاستلام'],fromShops:['Provenant des boutiques','من المتاجر'],fromAgencies:['Transférés depuis une autre agence','محولة من وكالة أخرى'],
  fromDrivers:['Retournés par les livreurs','مرتجعة من الموزعين'],fromClients:['Retournés par les clients (échanges)','مرتجعة من الحرفاء'],receptionAnomalies:['Anomalies de réception','إخلالات الاستلام'],nothingExpected:['Rien en attente.','لا شيء في الانتظار.'],
  categoryK:['Catégorie','الصنف'],inSinceFrom:['Entré depuis le','دخل منذ'],searchK:['Recherche','بحث'],parcelsInStock:['Colis présents','الطرود الموجودة'],stockEmpty:['Aucun colis en stock.','لا توجد طرود في المخزون.'],
  outgoingTitle:['Transferts sortants','التحويلات الصادرة'],incomingTitle:['Transferts entrants','التحويلات الواردة'],newTransfer:['Nouveau transfert','تحويل جديد'],invSessions:['Sessions d’inventaire','جلسات الجرد'],
  openK:['Ouvertes','مفتوحة'],resolvedK:['Traitées','معالجة'],movesTitle:['Historique des mouvements de stock','سجل حركات المخزون'],
});
