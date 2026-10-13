/* SADEN — « Bordereaux » : seven types (expédition, retour, échange, inter-agences, émission d'appel, inventaire, solde)
   sharing one screen: list per type, creation, driver selector, scan (USB scanner = keyboard, camera, manual entry),
   lifecycle per type, draft edition / deletion, motivated cancellation, A4 PDF with Code 128 barcodes. */

const li=()=>lang()==='ar'?1:0;
const BTYPES=[['dispatch',['Expédition','الإرسال'],'EXP'],['return',['Retour','الإرجاع'],'RET'],['exchange',['Échange','التبديل'],'ECH'],['transfer',['Inter-agences','بين الوكالات'],'BRD'],
  ['call',['Émission d’appel','الاتصالات'],'APL'],['inventory',['Inventaire','الجرد'],'INV'],['settlement',['Solde','التسوية'],'SLD']];
const btL=t=>(BTYPES.find(x=>x[0]===t)||[t,[t,t]])[1][li()];
// stage names per type (index = stage; 5 = annulé)
const BSTAGE=[['Brouillon','مسودة','n'],['Validé','مؤكد','i'],['En transit','في العبور','o'],['Arrivé','وصل','w'],['Clôturé','مغلق','g'],['Annulé','ملغى','r']];
const STAGE_BY_TYPE={
  dispatch:{1:['Validé','مؤكد'],4:['Remis au livreur','سُلّم للموزع']},return:{4:['Confirmé','مؤكد']},exchange:{1:['Remis au livreur','سُلّم للموزع']},
  call:{0:['En cours','جارٍ']},inventory:{0:['En cours','جارٍ']},settlement:{4:['Validé','مُصادق']},
};
const bstL=(i,type)=>(STAGE_BY_TYPE[type]?.[i]||BSTAGE[i])[li()];
const stageBadge=m=>`<span style="${css(badge(BSTAGE[m.stage][2]))}">${esc(bstL(m.stage,m.type))}</span>`;
const STEPS={transfer:[0,1,2,3,4],dispatch:[0,1,4],return:[0,4],exchange:[0,1,4],call:[0,4],inventory:[0,4],settlement:[0,4]};
const RET_REASONS=[['absent',['Client absent','الحريف غائب']],['injoignable',['Client injoignable','تعذر الاتصال بالحريف']],['refus',['Refus du client','رفض الحريف']],
  ['adresse',['Adresse incorrecte','عنوان خاطئ']],['reporte',['Livraison reportée','توصيل مؤجل']],['boutique',['Retour demandé par la boutique','إرجاع بطلب المتجر']],['autre',['Autre','أخرى']]];
const retL=k=>(RET_REASONS.find(x=>x[0]===k)||[k,[k||'—',k||'—']])[1][li()];
const CALL_RES=[['confirme',['Client confirmé','الحريف أكد']],['injoignable',['Client injoignable','تعذر الاتصال']],['sans_reponse',['Sans réponse','لا رد']],
  ['reporte',['Livraison reportée','توصيل مؤجل']],['adresse',['Adresse à confirmer','عنوان للتأكيد']],['annulation',['Annulation demandée','طلب إلغاء']]];
const callL=k=>(CALL_RES.find(x=>x[0]===k)||[k,['Non appelé','لم يتم الاتصال']])[1][li()];
const RECEPTION={attente:['En attente de réception','في انتظار الاستلام','n'],partielle:['Réception partielle','استلام جزئي','o'],complete:['Réception complète','استلام كامل','g'],anomalie:['Réception avec anomalie','استلام مع خلل','r']};
const recBadge=s=>s?`<span style="${css(badge(RECEPTION[s][2]))}">${esc(RECEPTION[s][li()])}</span>`:'';
const ANOM={manquant:['Manquant','ناقص'],supplementaire:['Supplémentaire','زائد'],endommage:['Endommagé','تالف'],inconnu:['Code inconnu','رمز مجهول'],autre:['Autre','أخرى']};
const anomL=k=>(ANOM[k]||[k,k])[li()];
const dtm=iso=>iso?dm(iso)+' '+hm(iso):'—';

/* ------------------------------------------------------------------ data */
const brdAgencyQ=()=>role()==='admin'&&state.agencyFilter?'&agency_id='+encodeURIComponent(state.agencyFilter):'';
async function loadBrdList(){
  const t=state.brdType||'dispatch';
  const r=await api('manifests?type='+t+brdAgencyQ());
  if((state.brdType||'dispatch')===t){state.brdList=r.manifests;state.brdListType=t;}
}
const loadBrd=id=>api('manifests/'+id).then(d=>{if(state.selBrd===id){
  if(d.manifest.type!==state.brdType){state.brdType=d.manifest.type;state.brdList=null;state.brdListType=null;}
  state.brdDetail=d;loadBrdSrc(d);render();}}).catch(e=>toast(e.message,'err'));
function selectBrd(id,type){
  if(type&&type!==state.brdType){state.brdType=type;state.brdList=null;}
  state.selBrd=id;state.brdDetail=null;state.brdPick=[];state.brdSrc=null;state.brdLog=[];state._brdReq=id;
  if(state.page!=='brd'){state.page='brd';}
  render();loadBrd(id);
}
function goBrdType(t){state.brdType=t;state.brdList=null;state.selBrd=null;state.brdDetail=null;state.bform={open:false};render();loadBrdList().then(render).catch(e=>toast(e.message,'err'));}
/* parcels that may be added to the draft (from the real stock / drivers) */
function loadBrdSrc(det){
  const m=det.manifest;
  if(!m.can_compose){state.brdSrc={id:m.id,list:[]};return;}
  const ag='&agency_id='+m.origin_agency_id;
  let p=null;
  if(m.type==='dispatch'||m.type==='exchange')p=api('stock?category=available'+ag).then(r=>r.parcels);
  else if(m.type==='return')p=api('stock/incoming?x=1'+ag).then(r=>r.drivers.filter(o=>o.driver_id===m.driver_id));
  if(p)p.then(list=>{if(state.selBrd===m.id){state.brdSrc={id:m.id,list};render();}}).catch(()=>{});
  else state.brdSrc={id:m.id,list:null};
}

/* ------------------------------------------------------------------ driver selector (reusable) */
function tplDriverPicker(agencyId,cur,onPick,{allowNone=false}={}){
  const Lx=L(),st=state.dpk||(state.dpk={q:'',list:null,agency:null});
  if(st.agency!==agencyId&&!st.loading){
    st.loading=true;st.agency=agencyId;st.list=null;
    api('manifests/drivers?agency_id='+agencyId).then(r=>{st.list=r.drivers;st.loading=false;render();}).catch(e=>{st.loading=false;toast(e.message,'err');});
  }
  const q=(st.q||'').trim().toLowerCase();
  const list=(st.list||[]).filter(d=>!q||d.name.toLowerCase().includes(q)||String(d.id)===q||String(d.phone||'').replace(/\D/g,'').includes(q.replace(/\D/g,'')||'§'));
  const av=d=>!d.active?['r',Lx.inactiveK]:d.status==='dispo'?['g',Lx.dAvail]:d.status==='livraison'?['o',Lx.dBusy]:d.status==='pause'?['w',Lx.dPause]:['n',Lx.dOff];
  return `<div style="display:flex;flex-direction:column;gap:6px">
    <input class="fld" ${onInput(e=>{st.q=e.target.value;render();},'dpk-q')} value="${esc(st.q||'')}" placeholder="${esc(Lx.searchDriver)}">
    <div style="display:flex;flex-direction:column;gap:4px;max-height:260px;overflow:auto">
      ${when(allowNone,()=>`<button type="button" ${on(()=>onPick(null))} style="${css({...chip(!cur),textAlign:'start',borderRadius:'var(--r)'})}">— ${esc(Lx.noDriver)}</button>`)}
      ${st.list?list.length?each(list,d=>{const [t,l]=av(d),sel=cur===d.id;return `<button type="button" ${d.active?on(()=>onPick(d)):'disabled'} data-driver="${d.id}" style="${css({display:'flex',flexDirection:'column',gap:3,textAlign:'start',padding:'8px 10px',borderRadius:'var(--r)',cursor:d.active?'pointer':'not-allowed',opacity:d.active?1:.55,border:sel?'2px solid var(--orange)':'1px solid var(--line)',background:sel?'var(--ob)':'var(--surface)',color:'var(--ink)'})}">
          <span style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${esc(d.name)} <span style="font-family:var(--mono);font-weight:400;color:var(--mute);font-size:11.5px">#${d.id}</span></b><span style="${css(badge(t))}">${esc(l)}</span></span>
          <span style="font-size:12px;color:var(--mute)">${esc([d.vehicle,d.zone_name,fmtPhone(d.phone)].filter(Boolean).join(' · '))}</span>
          <span style="font-size:12px">${d.active_count} ${esc(Lx.drvInProgress)} · ${d.in_hand} ${esc(Lx.inHand)}${d.history?.length?` · <span style="color:var(--mute)">${esc(d.history.slice(0,3).map(h=>h.ref).join(', '))}</span>`:''}</span>
        </button>`;}):empty(Lx.noDriverFound):'<span class="spin"></span>'}
    </div></div>`;
}

/* ------------------------------------------------------------------ page */
function tplBrd(){
  const Lx=L(),t=state.brdType||(state.brdType='dispatch');
  if(!state.bform||state.bform.type!==t)state.bform={type:t,open:false,driver_id:null,dest_agency_id:'',carrier:'',comment:'',party:'driver',shop_id:'',period_from:new Date().toISOString().slice(0,8)+'01',period_to:new Date().toISOString().slice(0,10),agency_id:state.agencyFilter||''};
  if(state.brdListType!==t&&!state._brdListReq){state._brdListReq=true;loadBrdList().catch(e=>toast(e.message,'err')).finally(()=>{state._brdListReq=false;render();});}
  const ms=state.brdListType===t?state.brdList||[]:null;
  const tabs=`<div class="no-print" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px">${each(BTYPES,([k,l])=>`<button ${on(()=>goBrdType(k))} data-btype="${k}" style="${css(chip(t===k))}">${esc(l[li()])}</button>`)}</div>`;
  const det=state.brdDetail&&state.brdDetail.manifest.id===state.selBrd?state.brdDetail:null;
  if(state.selBrd!=null&&!det&&state._brdReq!==state.selBrd){state._brdReq=state.selBrd;loadBrd(state.selBrd);}
  const list=`<div class="no-print" style="display:flex;flex-direction:column;gap:10px;min-width:0">
      ${tplBrdCreate(t)}
      ${ms==null?`<div style="${CARD};padding:16px"><span class="spin"></span></div>`:ms.length?each(ms,x=>`<div ${on(()=>selectBrd(x.id))} data-brd="${esc(x.ref)}" style="${css({background:'var(--surface)',border:state.selBrd===x.id?'2px solid var(--orange)':'1px solid var(--line)',borderRadius:'var(--r)',padding:'var(--pad)',display:'flex',flexDirection:'column',gap:4,cursor:'pointer',opacity:x.stage===5?.7:1})}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="font-size:14.5px">${esc(brdTitle(x))}</b>${stageBadge(x)}</div>
        <span style="font-family:var(--mono);font-size:11.5px;color:var(--mute)">${esc(x.ref)}</span>
        <span style="font-size:12.5px;color:var(--mute)">${dm(x.created_at)} · ${x.n} ${esc(Lx.lines)}${x.type==='transfer'&&x.stage>=2?` · ${x.received}/${x.n} ${esc(Lx.received)}`:''}${x.type==='inventory'?` · ${x.scanned} ${esc(Lx.counted)}`:''}${x.anomalies?` · ⚠ ${x.anomalies}`:''}</span>
        ${when(x.reception_state,()=>`<span>${recBadge(x.reception_state)}</span>`)}</div>`):`<div style="${CARD}">${empty(Lx.noBrd)}</div>`}
    </div>`;
  return `${tabs}<div class="split" style="display:grid;grid-template-columns:minmax(260px,360px) minmax(0,1fr);gap:var(--gap)">${list}${det?tplBrdDetail(det):`<div style="${CARD};padding:24px;color:var(--mute)">${state.selBrd!=null?'<span class="spin"></span>':esc(Lx.pickBrd)}</div>`}</div>`;
}
function brdTitle(x){
  switch(x.type){
    case 'transfer':return `${x.origin_agency_name||x.from_city} → ${x.dest_agency_name||x.to_city}`;
    case 'dispatch':case 'exchange':case 'return':return (x.driver_name||L().noDriver)+' · '+(x.origin_agency_name||'');
    case 'settlement':return (x.driver_name||x.shop_name||'—')+' · '+(x.period_from||'')+' → '+(x.period_to||'');
    default:return btL(x.type)+' · '+(x.origin_agency_name||'');
  }
}

function tplBrdCreate(t){
  const Lx=L(),b=state.bform,d=state.data;
  if(!b.open)return `<button ${on(()=>{state.bform={...state.bform,open:true};render();})} data-new-brd style="padding:11px;border-radius:var(--r);border:1px dashed var(--line);background:transparent;font-weight:600;cursor:pointer;color:var(--ink)">+ ${esc(Lx.newBrdOf)} « ${esc(btL(t))} »</button>`;
  const agencyId=role()==='manager'?myAgency()?.id:+(b.agency_id||state.agencyFilter||G().agencies.find(a=>a.active)?.id);
  const create=()=>act(async()=>{
    const c=state.bform,body={type:t,agency_id:agencyId,comment:c.comment};
    if(t==='transfer')Object.assign(body,{origin_agency_id:agencyId,dest_agency_id:c.dest_agency_id,carrier:c.carrier,driver_id:c.driver_id});
    if(['dispatch','exchange','return'].includes(t))body.driver_id=c.driver_id;
    if(t==='settlement')Object.assign(body,{driver_id:c.party==='driver'?c.driver_id:null,shop_id:c.party==='shop'?c.shop_id:null,period_from:c.period_from,period_to:c.period_to});
    const r=await api('manifests',{method:'POST',body});
    state.bform={...state.bform,open:false};await loadBrdList();selectBrd(r.manifest.id);
  },Lx.saved);
  const pickDrv=dd=>{state.bform={...state.bform,driver_id:dd?.id||null};render();};
  const drivers=(d.drivers||[]).filter(x=>x.active&&(!agencyId||x.agency_id===agencyId)),shops=(d.shops||[]).filter(x=>!agencyId||x.agency_id===agencyId);
  return `<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px" data-form-brd>
    <b>${esc(Lx.newBrdOf)} « ${esc(btL(t))} »</b>
    ${when(role()==='admin',()=>field(Lx.agencyLbl,select('b-ag','bform','agency_id',[['',Lx.choose],...agencyOptions()],true)))}
    ${when(t==='transfer',()=>field(Lx.to,select('b-to','bform','dest_agency_id',[['',Lx.choose],...agencyOptions(a=>a.id!==agencyId)]))+field(Lx.carrier,input('b-car','bform','carrier','placeholder="Sud Express Transport"'))
      +field(Lx.driverCarrier,select('b-drv','bform','driver_id',[['','—'],...drivers.map(x=>[x.id,x.name])])))}
    ${when(['dispatch','exchange','return'].includes(t)&&agencyId,()=>field(Lx.driverK+(t==='return'?' *':''),tplDriverPicker(agencyId,b.driver_id,pickDrv,{allowNone:t!=='return'})))}
    ${when(t==='settlement',()=>`<div style="display:flex;gap:6px">${each([['driver',Lx.driverK],['shop',Lx.colShop]],([k,l])=>`<button type="button" ${on(()=>{state.bform={...state.bform,party:k};render();})} style="${css(chip(b.party===k))}">${esc(l)}</button>`)}</div>
      ${b.party==='driver'?field(Lx.driverK,select('b-sd','bform','driver_id',[['',Lx.choose],...drivers.map(x=>[x.id,x.name])])):field(Lx.colShop,select('b-ss','bform','shop_id',[['',Lx.choose],...shops.map(x=>[x.id,x.shop_name])]))}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${field(Lx.periodFrom,input('b-pf','bform','period_from','type="date"'))}${field(Lx.periodTo,input('b-pt','bform','period_to','type="date"'))}</div>`)}
    ${when(t==='inventory',()=>`<span style="font-size:12.5px;color:var(--mute)">${esc(Lx.invHint)}</span>`)}
    ${when(t!=='inventory'&&t!=='transfer',()=>field(Lx.commentK+' ('+Lx.optional+')',input('b-com','bform','comment')))}
    <div style="display:flex;gap:8px"><button ${on(create)} style="${BTN_PRIMARY};flex:1">${spin()}${esc(t==='inventory'?Lx.openSession:Lx.createBrd)}</button><button ${on(()=>{state.bform={...state.bform,open:false};render();})} style="${BTN_GHOST}">${esc(Lx.cancel)}</button></div>
  </div>`;
}

/* ------------------------------------------------------------------ detail */
async function brdScan(m,code){
  const f=state.brdLine||{};
  const body={code,reason:f.reason,comment:f.comment,condition:state.brdCond==='damaged'?'damaged':undefined,note:f.comment};
  const r=await api(`manifests/${m.id}/scan`,{method:'POST',body});
  state.brdLog=[{ref:code,ok:!r.extra&&!r.anomaly,msg:r.message+(r.warning?' — '+r.warning:'')},...(state.brdLog||[])].slice(0,8);
  if(state.brdCond==='damaged')state.brdCond='ok';
  await loadBrd(m.id);
  return r;
}
function tplScanBox(m,hint){
  const Lx=L();
  const submit=()=>{const v=(state.brdScanVal||'').trim();if(!v)return;state.brdScanVal='';render();
    brdScan(m,v).catch(e=>{state.brdLog=[{ref:v.toUpperCase(),ok:false,msg:e.message},...(state.brdLog||[])].slice(0,8);render();});};
  return `<div class="no-print" style="padding:var(--pad);border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:8px;background:var(--surface2)">
    <form data-form="bscan" onsubmit="return false" style="display:flex;gap:6px;flex-wrap:wrap">
      <input class="fld" ${onInput(e=>{state.brdScanVal=e.target.value;},'brd-scan')} value="${esc(state.brdScanVal||'')}" placeholder="${esc(Lx.scanPh)}" autocomplete="off" autocapitalize="characters" style="font-family:var(--mono);flex:1;min-width:180px">
      <button ${on(submit)} style="${BTN_PRIMARY};padding:9px 14px">OK</button>
      <button type="button" ${on(()=>openScanner(null,{title:m.ref+' · '+hint,handler:ref=>brdScan(m,ref)}))} style="${BTN_GHOST}">📷 ${esc(Lx.camera)}</button>
    </form>
    <span style="font-size:12px;color:var(--mute)">${esc(hint)} — ${esc(Lx.usbHint)}</span>
    ${when((state.brdLog||[]).length,()=>`<div style="display:flex;flex-direction:column;gap:2px;font-size:12.5px" data-scanlog>${each(state.brdLog,r=>`<span style="color:${r.ok?'var(--gf)':'var(--rf)'}">${r.ok?'✓':'✕'} <b style="font-family:var(--mono)">${esc(r.ref)}</b> · ${esc(r.msg)}</span>`)}</div>`)}
  </div>`;
}

function tplBrdDetail(det){
  const Lx=L(),u=Lx.tnd,m=det.manifest,items=det.items,t=m.type,d=state.data;
  const reload=()=>loadBrd(m.id);
  const post=(path,body,msg)=>act(async()=>{const r=await api(`manifests/${m.id}/${path}`,{method:'POST',body});
    if(r.missing?.length)toast(Lx.missingAtClose+' : '+r.missing.join(', '),'err');
    if(r.to_return?.length)toast(Lx.toReturn+' : '+r.to_return.join(', '),'err');
    if(r.kept?.length)toast(Lx.notReversed+' : '+r.kept.join(', '),'err');
    await reload();await loadBrdList();},msg||Lx.saved);
  const actions=[];
  const S=m.stage,origin=m.can_ship,dest=m.can_receive;
  if(t==='transfer'){
    if(S===0&&origin)actions.push([Lx.validate,()=>post('validate')]);
    if(S===1&&origin)actions.push([Lx.ship,()=>post('ship')]);
    if(S===2&&dest)actions.push([Lx.markArrived,()=>post('arrive')]);
    if(S===3&&dest){const pb=items.some(i=>!i.received_at)||det.anomalies.length;
      actions.push([pb?Lx.closeReserves:Lx.closeBrd,()=>pb?askReason(Lx.reservesTitle,true,txt=>post('close',{reserves:txt})):post('close')]);}
  }
  if(t==='dispatch'){
    if(S===0&&origin)actions.push([Lx.validate,()=>post('validate')]);
    if(S===1&&origin)actions.push([Lx.confirmHandover,()=>post('handover',null,Lx.handedOver)]);
  }
  if(t==='return'&&S===0&&origin)actions.push([Lx.confirmReturn,()=>post('confirm',null,Lx.returnConfirmed)]);
  if(t==='exchange'){
    if(S===0&&origin)actions.push([Lx.handOverExchange,()=>post('validate',null,Lx.handedOver)]);
    if(S===1&&origin)actions.push([Lx.closeBrd,()=>post('close',{results:Object.fromEntries(items.filter(i=>i.role==='pickup').map(i=>[i.id,i.result]))})]);
  }
  if((t==='call'||t==='inventory')&&S===0&&origin)actions.push([t==='inventory'?Lx.closeInventory:Lx.closeBrd,()=>post('close')]);
  if(t==='settlement'&&S===0&&origin){
    actions.push([Lx.recompute,()=>post('recompute')]);
    actions.push([Lx.validateSettlement,()=>post('validate',{amount:state.sldAmount===''||state.sldAmount==null?undefined:state.sldAmount,comment:state.sldComment||undefined},Lx.settlementDone)]);
  }
  const del=()=>{if(!confirm(Lx.confirmDelete))return;act(async()=>{await api('manifests/'+m.id,{method:'DELETE'});state.selBrd=null;state.brdDetail=null;await loadBrdList();},Lx.deleted);};
  const cancel=()=>askReason(Lx.cancelBrdTitle,true,txt=>act(async()=>{const r=await api(`manifests/${m.id}/cancel`,{method:'POST',body:{reason:txt}});
    toast(Lx.cancelled+(r.reversed?.length?' · '+Lx.reversed+' : '+r.reversed.join(', '):'')+(r.reversal_cash_tx?' · '+Lx.reversalDone:''));
    if(r.kept?.length)setTimeout(()=>toast(Lx.notReversed+' : '+r.kept.join(', '),'err'),2900);
    await reload();await loadBrdList();}));
  const steps=STEPS[t];
  const totals={n:items.filter(i=>i.expected!==false).length,cod:items.reduce((a,i)=>a+(i.cod||0),0),pieces:items.reduce((a,i)=>a+(i.pieces||1),0)};
  const info=brdInfo(det);
  // scan box: composition (draft), loading control (validated), reception (transfer at destination), inventory counting
  let scanHint=null;
  if(S===0&&m.can_compose&&t!=='settlement')scanHint=t==='inventory'?Lx.hintCount:Lx.hintAdd;
  if(S===1&&origin&&['transfer','dispatch'].includes(t))scanHint=Lx.hintCheck;
  if(t==='transfer'&&[2,3].includes(S)&&dest)scanHint=Lx.hintReceive;
  const retForm=t==='return'&&S===0&&m.can_compose?`<div class="no-print" style="padding:var(--pad);border-bottom:1px solid var(--line);display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;align-items:end">
      ${field(Lx.returnReason,`<select class="fld" ${onInput(e=>{state.brdLine={...(state.brdLine||{}),reason:e.target.value};render();},'ret-reason')}>${each([['',Lx.choose],...RET_REASONS.map(([k,l])=>[k,l[li()]])],([v,l])=>`<option value="${esc(v)}"${(state.brdLine?.reason||'')===v?' selected':''}>${esc(l)}</option>`)}</select>`)}
      ${field(Lx.commentK+((state.brdLine?.reason)==='autre'?' *':''),`<input class="fld" ${onInput(e=>{state.brdLine={...(state.brdLine||{}),comment:e.target.value};},'ret-com')} value="${esc(state.brdLine?.comment||'')}">`)}
    </div>`:'';
  const condToggle=t==='transfer'&&[2,3].includes(S)&&dest?`<div class="no-print" style="padding:8px var(--pad);border-bottom:1px solid var(--line);display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span style="font-size:12.5px;color:var(--mute)">${esc(Lx.nextScan)}</span>${each([['ok',Lx.condOk],['damaged',Lx.condDamaged]],([k,l])=>`<button type="button" ${on(()=>{state.brdCond=k;render();})} style="${css(chip((state.brdCond||'ok')===k))}">${esc(l)}</button>`)}</div>`:'';
  return `<div style="min-width:0;${CARD};display:flex;flex-direction:column" data-brd-detail="${esc(m.ref)}">
    ${when(S===5,()=>`<div style="padding:12px var(--pad);background:var(--rb);color:var(--rf);font-weight:700;display:flex;flex-direction:column;gap:2px"><span style="font-size:18px;letter-spacing:.08em">ANNULÉ</span><span style="font-weight:500;font-size:12.5px">${esc(dtm(m.cancelled_at))} · ${esc(m.cancelled_by_name||'')} · ${esc(Lx.reasonK)} : ${esc(m.cancel_reason||'')}</span></div>`)}
    <div style="padding:var(--pad);display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line)">
      <div style="display:flex;flex-direction:column;gap:4px;min-width:0"><span style="font-size:12px;color:var(--mute)">${esc(btL(t))} · ${stageBadge(m)} ${recBadge(m.reception_state)}</span>
        <b style="font-family:var(--disp);font-size:22px">${esc(brdTitle(m))}</b>
        <div class="docbc" style="max-width:260px">${code128Svg(m.ref,{h:38,module:1.6,font:11})}</div></div>
      <div class="no-print" style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;justify-content:flex-end">
        <button ${on(()=>exportManifestPdf(det))} style="${BTN_GHOST}">⤓ ${esc(Lx.pdf)}</button>
        <button ${on(()=>exportManifestPdf(det,true))} style="${BTN_GHOST}">🖨 ${esc(Lx.print)}</button>
        ${each(actions,([l,fn])=>`<button ${on(fn)} style="${BTN_PRIMARY}">${spin()}${esc(l)}</button>`)}
        ${when(m.can_delete,()=>`<button ${on(del)} style="${BTN_GHOST};color:var(--rf)">🗑 ${esc(Lx.deleteDraft)}</button>`)}
        ${when(m.can_cancel,()=>`<button ${on(cancel)} style="${BTN_GHOST};color:var(--rf)">${esc(Lx.cancelBrd)}</button>`)}
      </div>
    </div>
    <div style="padding:var(--pad);display:grid;grid-template-columns:repeat(${steps.length},minmax(0,1fr));gap:6px;border-bottom:1px solid var(--line)">
      ${each(steps,j=>`<div style="display:flex;flex-direction:column;gap:6px"><span style="height:6px;border-radius:3px;background:${S!==5&&j<=S?'var(--orange)':'var(--surface2)'}"></span><span style="font-size:12px;font-weight:${j===S?700:500};color:${j<=S&&S!==5?'var(--ink)':'var(--mute)'}">${esc(bstL(j,t))}</span></div>`)}
    </div>
    <div style="padding:var(--pad);display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;border-bottom:1px solid var(--line)">
      ${each(info,([k2,v])=>`<div style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:11.5px;color:var(--mute)">${esc(k2)}</span><b style="font-weight:600;overflow-wrap:anywhere">${esc(v)}</b></div>`)}
    </div>
    ${when(['dispatch','exchange','return'].includes(t)&&S===0&&m.can_compose,()=>`<details class="no-print" style="padding:var(--pad);border-bottom:1px solid var(--line)"${m.driver_id?'':' open'}><summary style="cursor:pointer;font-weight:600">${esc(Lx.changeDriver)}</summary><div style="margin-top:8px">${tplDriverPicker(m.origin_agency_id,m.driver_id,dd=>act(async()=>{await api('manifests/'+m.id,{method:'PATCH',body:{driver_id:dd?.id||null}});await reload();await loadBrdList();},Lx.saved),{allowNone:t!=='return'})}</div></details>`)}
    ${when(t==='transfer'&&S>=3,()=>{const miss=items.filter(i=>!i.received_at);return miss.length?`<div style="padding:10px var(--pad);background:var(--rb);color:var(--rf);font-weight:600">${esc(Lx.missingParcels)} (${miss.length}) : ${esc(miss.map(i=>i.ref).join(', '))}</div>`:'';})}
    ${t==='settlement'?tplSettlement(det):''}
    ${retForm}${condToggle}
    ${scanHint?tplScanBox(m,scanHint):''}
    ${tplBrdLines(det)}
    ${tplBrdPick(det)}
    ${when(det.anomalies.length,()=>tplBrdAnomalies(det))}
    ${when(m.reserves,()=>`<div style="padding:var(--pad);border-top:1px solid var(--line)"><b>${esc(Lx.reservesK)}</b> : ${esc(m.reserves)}</div>`)}
    <div style="padding:var(--pad);border-top:1px solid var(--line);display:flex;flex-direction:column;gap:6px">
      <b>${esc(Lx.brdHistory)}</b>
      ${det.history.length?each(det.history,h=>`<div style="display:grid;grid-template-columns:96px 1fr;gap:8px;font-size:12.5px"><span style="font-family:var(--mono);color:var(--mute)">${dm(h.created_at)} ${hm(h.created_at)}</span><span><b style="font-weight:600">${esc(histL(h.action))}</b>${histDetail(h)} — ${esc(h.user_name||'Système')}</span></div>`):`<span style="color:var(--mute)">—</span>`}
    </div>
  </div>`;
}
const HIST={'manifest.create':['Création','إنشاء'],'manifest.add':['Colis ajouté','إضافة طرد'],'manifest.remove':['Colis retiré','حذف طرد'],'manifest.validate':['Validation','تأكيد'],
  'manifest.ship':['Expédition','شحن'],'manifest.arrive':['Arrivée','وصول'],'manifest.receive':['Colis réceptionné','استلام طرد'],'manifest.close':['Clôture','إقفال'],'manifest.update':['Modification','تعديل'],
  'manifest.handover':['Remise au livreur','التسليم للموزع'],'manifest.confirm':['Retour confirmé','تأكيد الإرجاع'],'manifest.pickup':['Récupération ajoutée','إضافة استرجاع'],'manifest.call':['Appel','اتصال'],
  'manifest.cancel':['Annulation','إلغاء'],'manifest.extra':['Colis supplémentaire','طرد زائد'],'manifest.delete':['Suppression du brouillon','حذف المسودة']};
const histL=a=>(HIST[a]||[a,a])[li()];
function histDetail(h){
  const a=h.after||{},b=h.before||{},o=a.order||b.order||a.code;
  const parts=[];if(o)parts.push(o);if(a.reason&&h.action==='manifest.cancel')parts.push(a.reason);if(a.result&&h.action==='manifest.call')parts.push(callL(a.result));
  if(Array.isArray(a.missing)&&a.missing.length)parts.push(L().missingParcels+' : '+a.missing.join(', '));if(a.driver)parts.push(a.driver);if(a.reserves)parts.push(a.reserves);
  return parts.length?' · '+esc(parts.join(' · ')):'';
}
function brdInfo(det){
  const Lx=L(),u=Lx.tnd,m=det.manifest,items=det.items,t=m.type;
  const cod=items.reduce((a,i)=>a+(i.cod||0),0),n=items.filter(i=>i.expected!==false).length;
  const base=[[Lx.agencyLbl,m.origin_agency_name||'—'],[Lx.createdBy,(m.created_by_name||m.responsible||'—')+' · '+dtm(m.created_at)]];
  if(t==='transfer')return [[Lx.from,m.origin_agency_name],[Lx.to,m.dest_agency_name],[Lx.carrier,m.carrier||'—'],[Lx.driverCarrier,m.driver_name||'—'],[Lx.count,n+' · '+items.reduce((a,i)=>a+(i.pieces||1),0)+' '+Lx.piecesShort],[Lx.totalCod,fmt(cod,u)],[Lx.received,items.filter(i=>i.received_at).length+' / '+n],[Lx.createdBy,(m.created_by_name||m.responsible||'—')+' · '+dtm(m.created_at)]];
  if(t==='dispatch'||t==='exchange')return [...base,[Lx.driverK,m.driver_name?m.driver_name+' · '+fmtPhone(m.driver_phone):'—'],[Lx.count,String(n)],[Lx.totalCod,fmt(cod,u)],[Lx.handedAt,dtm(m.handed_at)],...(m.result?[[Lx.resultK,resL(m.result)]]:[])];
  if(t==='return')return [...base,[Lx.driverK,m.driver_name||'—'],[Lx.count,String(n)],[Lx.confirmedAt,dtm(m.closed_at)]];
  if(t==='call'){const done=items.filter(i=>i.call_result).length;return [...base,[Lx.count,String(n)],[Lx.calledK,done+' / '+n]];}
  if(t==='inventory'){const exp=items.filter(i=>i.expected).length,cnt=items.filter(i=>i.scanned_at).length,ex=items.filter(i=>!i.expected).length;
    return [...base,[Lx.theoretical,String(exp)],[Lx.counted,String(cnt)],[Lx.invMissing,String(items.filter(i=>i.expected&&!i.scanned_at).length)],[Lx.extraK,String(ex)],...(m.result?[[Lx.resultK,resL(m.result)]]:[])];}
  if(t==='settlement')return [...base,[m.driver_id?Lx.driverK:Lx.colShop,m.driver_name||m.shop_name||'—'],[Lx.periodK,(m.period_from||'')+' → '+(m.period_to||'')],[Lx.validatedBy,m.validated_by_name?m.validated_by_name+' · '+dtm(m.validated_at):'—']];
  return base;
}
const RES={complet:['Complet','كامل'],partiel:['Partiel','جزئي'],echoue:['Échoué','فاشل'],avec_reserves:['Clôturé avec réserves','مغلق مع تحفظات'],sans_reserve:['Clôturé sans réserve','مغلق بدون تحفظ'],conforme:['Conforme','مطابق'],ecarts:['Écarts constatés','فوارق']};
const resL=k=>(RES[k]||[k,k])[li()];

function tplBrdLines(det){
  const Lx=L(),u=Lx.tnd,m=det.manifest,items=det.items,t=m.type,S=m.stage,edit=m.can_compose;
  if(!items.length)return empty(t==='settlement'?Lx.noSettleLines:Lx.brdEmpty);
  const rm=o=>`<button ${on(()=>act(async()=>{await api(`manifests/${m.id}/items/${o.id}`,{method:'DELETE'});await loadBrd(m.id);},Lx.saved))} title="${esc(Lx.remove)}" style="border:none;background:none;color:var(--rf);cursor:pointer;font-size:15px">✕</button>`;
  const ref=c=>`<span ${on(()=>selectOrder(c.id))} style="font-family:var(--mono);font-size:12px;cursor:pointer;text-decoration:underline dotted">${esc(c.ref)}</span>`;
  const st=c=>`<span style="${css(stB(c.status))}">${esc(stL(c.status))}</span>`;
  const row=(cols,cells,bg='')=>`<div style="display:grid;grid-template-columns:${cols};gap:10px;align-items:center;padding:9px var(--pad);border-bottom:1px solid var(--line);${bg}">${cells.join('')}</div>`;
  let cols,body;
  switch(t){
    case 'transfer':
      cols='100px minmax(0,1fr) minmax(0,1fr) 100px 110px 110px';
      body=items.map(c=>row(cols,[ref(c),`<span>${esc(c.client_name)}</span>`,`<span style="color:var(--mute)">${esc([c.dest_city_name,c.zone_name].filter(Boolean).join(' · '))}</span>`,`<span style="text-align:end;font-weight:600">${esc(fmt(c.cod,u))}</span>`,`<span>${st(c)}</span>`,
        `<span style="text-align:end">${edit?rm(c):c.received_at?`<span style="color:${c.anomaly?'var(--wf)':'var(--gf)'};font-weight:700">✓ ${esc(hm(c.received_at))}${c.anomaly?' ⚠':''}</span>`:c.anomaly==='manquant'?`<span style="color:var(--rf);font-weight:700">${esc(Lx.missingK)}</span>`
          :m.can_receive&&[2,3].includes(S)?`<button ${on(()=>act(async()=>{await api(`manifests/${m.id}/receive`,{method:'POST',body:{order_id:c.id}});await loadBrd(m.id);},Lx.saved))} style="${BTN_GHOST};padding:4px 8px;font-size:12px">${esc(Lx.receiveOne)}</button>`:c.scanned_at||c.loaded_at?`<span style="color:var(--mute);font-size:12px">${esc(Lx.loaded)}</span>`:''}</span>`],
        S>=3&&!c.received_at?'background:var(--rb)':'')).join('');break;
    case 'dispatch':
      cols='100px minmax(0,1fr) minmax(0,1fr) 100px 110px 90px';
      body=items.map(c=>row(cols,[ref(c),`<span>${esc(c.client_name)}</span>`,`<span style="color:var(--mute)">${esc(c.zone_name||c.dest_city_name||'')}</span>`,`<span style="text-align:end;font-weight:600">${esc(fmt(c.cod,u))}</span>`,`<span>${st(c)}</span>`,
        `<span style="text-align:end">${edit?rm(c):c.confirmed_at?`<span style="color:var(--gf);font-weight:700">✓ ${esc(Lx.handedK)}</span>`:c.scanned_at?`<span style="color:var(--gf)">✓ ${esc(Lx.checkedK)}</span>`:''}</span>`])).join('');break;
    case 'return':
      cols='100px minmax(0,1fr) 110px minmax(0,1.3fr) 60px';
      body=items.map(c=>row(cols,[ref(c),`<span>${esc(c.client_name)}</span>`,`<span>${st(c)}</span>`,
        edit?`<span style="display:flex;gap:4px;flex-wrap:wrap"><select class="fld" style="max-width:190px" ${onInput(e=>{const reason=e.target.value;const go=comment=>act(async()=>{await api(`manifests/${m.id}/items/${c.id}`,{method:'PATCH',body:{reason,comment}});await loadBrd(m.id);},Lx.saved);reason==='autre'?askReason(Lx.otherReason,true,go):go(c.comment);},'rr-'+c.id)}>${each(RET_REASONS,([k,l])=>`<option value="${k}"${c.reason===k?' selected':''}>${esc(l[li()])}</option>`)}</select>${c.comment?`<span style="font-size:12px;color:var(--mute)">${esc(c.comment)}</span>`:''}</span>`
          :`<span>${esc(retL(c.reason))}${c.comment?` <span style="color:var(--mute);font-size:12px">— ${esc(c.comment)}</span>`:''}</span>`,
        `<span style="text-align:end">${edit?rm(c):c.confirmed_at?`<span style="color:var(--gf);font-weight:700">✓</span>`:''}</span>`])).join('');break;
    case 'exchange':
      cols='110px 100px minmax(0,1fr) 110px minmax(0,1fr) 40px';
      body=items.map(c=>row(cols,[`<span style="${css(badge(c.role==='pickup'?'w':'i'))}">${esc(c.role==='pickup'?Lx.toPickup:Lx.brdToDeliver)}</span>`,ref(c),`<span>${esc(c.client_name)}${c.related_ref?` <span style="color:var(--mute);font-size:12px">↔ ${esc(c.related_ref)}</span>`:''}</span>`,`<span>${st(c)}</span>`,
        c.role==='pickup'&&S===1&&m.can_ship?`<span style="display:flex;gap:4px">${each([['ok',Lx.collectedK],['failed',Lx.notCollected]],([k,l])=>`<button ${on(()=>act(async()=>{await api(`manifests/${m.id}/items/${c.id}`,{method:'PATCH',body:{result:k}});await loadBrd(m.id);}))} style="${css(chip(c.result===k))};padding:5px 9px;font-size:12px">${esc(l)}</button>`)}</span>`
          :`<span>${c.result?esc(c.result==='ok'?(c.role==='pickup'?Lx.collectedK:Lx.okDelivered):(c.role==='pickup'?Lx.notCollected:Lx.notDelivered)):''}</span>`,
        `<span style="text-align:end">${edit?rm(c):''}</span>`])).join('');break;
    case 'call':
      cols='100px minmax(0,1fr) 150px minmax(0,1fr) 170px minmax(0,1fr) 80px';
      body=items.map(c=>{const k='cl'+c.id,f=state[k]||(state[k]={phone:c.phone||c.client_phone,reason:c.reason||'',call_result:c.call_result||'',comment:c.comment||''});
        return row(cols,[ref(c),`<span>${esc(c.client_name)}<br><span style="font-size:11.5px;color:var(--mute)">${c.called_at?esc(dtm(c.called_at)+' · '+(c.called_by_name||'')):''}</span></span>`,
          edit?input('cp-'+c.id,k,'phone','type="tel"'):`<span>${esc(c.phone||'')}</span>`,edit?input('cm-'+c.id,k,'reason',`placeholder="${esc(Lx.motiveK)}"`):`<span>${esc(c.reason||'')}</span>`,
          edit?select('cr-'+c.id,k,'call_result',[['',Lx.choose],...CALL_RES.map(([v,l])=>[v,l[li()]])]):`<span style="${css(badge(c.call_result==='confirme'?'g':c.call_result?'o':'n'))}">${esc(callL(c.call_result))}</span>`,
          edit?input('cc-'+c.id,k,'comment',`placeholder="${esc(Lx.commentK)}"`):`<span style="font-size:12.5px">${esc(c.comment||'')}</span>`,
          `<span style="display:flex;gap:4px;justify-content:flex-end">${edit?`<button ${on(()=>act(async()=>{await api(`manifests/${m.id}/items/${c.id}`,{method:'PATCH',body:state[k]});delete state[k];await loadBrd(m.id);},Lx.saved))} style="${BTN_GHOST};padding:5px 8px;font-size:12px">✓</button>${rm(c)}`:''}</span>`]);}).join('');break;
    case 'inventory':
      cols='100px minmax(0,1fr) 120px 160px';
      body=items.map(c=>row(cols,[ref(c),`<span>${esc(c.client_name)}</span>`,`<span>${st(c)}</span>`,
        `<span style="text-align:end;font-weight:700;color:${!c.expected?'var(--wf)':c.scanned_at?'var(--gf)':S===4?'var(--rf)':'var(--mute)'}">${!c.expected?'＋ '+esc(Lx.extraK):c.scanned_at?'✓ '+esc(hm(c.scanned_at)):S===4?esc(Lx.missingK):'…'}</span>`],
        !c.expected?'background:var(--wb)':S===4&&!c.scanned_at?'background:var(--rb)':'')).join('');break;
    case 'settlement':
      cols='100px minmax(0,1fr) 110px 110px 110px';
      body=items.map(c=>row(cols,[ref(c),`<span>${esc(c.client_name)}</span>`,`<span style="text-align:end">${esc(fmt(c.cod))}</span>`,`<span style="text-align:end">${esc(fmt(m.driver_id?c.driver_share:c.delivery_fee))}</span>`,`<span style="text-align:end;font-weight:700">${esc(fmt(c.amount))}</span>`])).join('');break;
  }
  const head={transfer:['Réf.',Lx.client,Lx.destK,'COD',Lx.statusK,''],dispatch:['Réf.',Lx.client,Lx.zoneK,'COD',Lx.statusK,''],return:['Réf.',Lx.client,Lx.statusK,Lx.returnReason,''],
    exchange:[Lx.roleK,'Réf.',Lx.client,Lx.statusK,Lx.resultK,''],call:['Réf.',Lx.client,Lx.phone,Lx.motiveK,Lx.resultK,Lx.commentK,''],inventory:['Réf.',Lx.client,Lx.statusK,Lx.countK],
    settlement:['Réf.',Lx.client,'COD',m.driver_id?Lx.commissionK:Lx.feesK,Lx.amountK]}[t];
  return `<div style="overflow-x:auto"><div style="min-width:${t==='call'?900:620}px">
    <div style="display:grid;grid-template-columns:${cols};gap:10px;padding:8px var(--pad);font-size:11.5px;color:var(--mute);background:var(--surface2);font-weight:600">${each(head,(h,i)=>`<span style="${i===head.length-1&&['settlement','inventory'].includes(t)?'text-align:end':''}">${esc(h)}</span>`)}</div>
    ${body}</div></div>`;
}

function tplBrdPick(det){
  const Lx=L(),m=det.manifest,t=m.type,d=state.data;
  if(!m.can_compose)return '';
  const items=det.items,pick=state.brdPick||[];
  let src;
  if(t==='transfer')src=d.orders.filter(o=>o.origin_agency_id===m.origin_agency_id&&o.dest_agency_id===m.dest_agency_id&&['attente','en_agence'].includes(o.status)&&!items.some(i=>i.id===o.id));
  else if(state.brdSrc?.id===m.id&&state.brdSrc.list)src=state.brdSrc.list.filter(o=>!items.some(i=>i.id===o.id));
  else if(['dispatch','exchange','return'].includes(t))return `<div style="padding:var(--pad);border-top:1px solid var(--line)"><span class="spin"></span></div>`;
  else src=null;
  const toggle=id=>()=>{state.brdPick=pick.includes(id)?pick.filter(x=>x!==id):[...pick,id];render();};
  const add=()=>act(async()=>{const body={order_ids:pick};if(t==='return'){Object.assign(body,state.brdLine||{});}
    const r=await api(`manifests/${m.id}/items`,{method:'POST',body});state.brdPick=[];if(r.errors.length)toast(r.errors.join(' · '),'err');else if(r.warnings?.length)toast(r.warnings.join(' · '));await loadBrd(m.id);},Lx.saved);
  const pickup=t==='exchange'?`<div style="display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px dashed var(--line)"><b>${esc(Lx.addPickup)}</b>
      <span style="font-size:12px;color:var(--mute)">${esc(Lx.pickupHint)}</span>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;align-items:end">
        ${field(Lx.forParcel,`<select class="fld" ${onInput(e=>{state.pkForm={...(state.pkForm||{}),order_id:e.target.value};},'pk-o')}>${each([['',Lx.choose],...items.filter(i=>i.role!=='pickup').map(i=>[i.id,i.ref+' · '+i.client_name])],([v,l])=>`<option value="${v}"${String(state.pkForm?.order_id||'')===String(v)?' selected':''}>${esc(l)}</option>`)}</select>`)}
        ${field(Lx.itemToCollect,`<input class="fld" ${onInput(e=>{state.pkForm={...(state.pkForm||{}),description:e.target.value};},'pk-d')} value="${esc(state.pkForm?.description||'')}">`)}
        <button ${on(()=>act(async()=>{const f=state.pkForm||{};if(!f.order_id)throw new Error(Lx.choose);await api(`manifests/${m.id}/pickup`,{method:'POST',body:f});state.pkForm={};await loadBrd(m.id);},Lx.saved))} style="${BTN_GHOST}">+ ${esc(Lx.addPickupBtn)}</button>
      </div></div>`:'';
  if(src==null)return pickup?`<div class="no-print" style="padding:var(--pad);border-top:1px solid var(--line)">${pickup}</div>`:'';
  return `<div class="no-print" style="padding:var(--pad);border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>${esc(t==='return'?Lx.parcelsWithDriver:t==='transfer'?Lx.addParcels:Lx.stockAvailable)} (${src.length})</b>${when(pick.length,()=>`<button ${on(add)} style="${BTN_PRIMARY};padding:7px 12px">${spin()}+ ${pick.length}</button>`)}</div>
    ${t==='return'&&!(state.brdLine?.reason)?`<span style="font-size:12px;color:var(--wf)">${esc(Lx.pickReasonFirst)}</span>`:''}
    ${src.length?`<div style="display:flex;flex-direction:column;max-height:260px;overflow:auto">${each(src,o=>`<label style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);cursor:pointer"><input type="checkbox" ${pick.includes(o.id)?'checked':''} ${on(toggle(o.id))}><span style="font-family:var(--mono);font-size:12px">${esc(o.ref)}</span><span style="flex:1">${esc(o.client_name)}</span><span style="${css(stB(o.status))}">${esc(stL(o.status))}</span>${o.driver_name&&t!=='return'?`<span style="font-size:12px;color:var(--mute)">${esc(o.driver_name)}</span>`:''}</label>`)}</div>`:`<span style="color:var(--mute);font-size:12.5px">${esc(Lx.noPickable)}</span>`}
    ${pickup}
  </div>`;
}

function tplSettlement(det){
  const Lx=L(),u=Lx.tnd,m=det.manifest,t=m.totals||{};
  const row=(k,v,b)=>`<div style="display:flex;justify-content:space-between;gap:8px;${b?'font-weight:700;font-size:15px':''}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`;
  return `<div style="padding:var(--pad);border-bottom:1px solid var(--line);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--gap)">
    <div style="display:flex;flex-direction:column;gap:6px">
      ${row(Lx.ordersK,String(t.orders??0))}${row(Lx.collectedK2,fmt(t.collected,u))}${row(Lx.feesK,fmt(t.fees,u))}${row(Lx.commissionK,fmt(t.commissions,u))}
      ${t.party==='shop'?row(Lx.sldDueShop,fmt(t.due,u)):''}${row(Lx.alreadyPaid,fmt(t.remitted_before,u))}
      ${row(t.party==='shop'?Lx.sldBalanceShop:Lx.balanceDriver,fmt(t.balance,u),true)}
      ${m.stage===4||m.stage===5?row(Lx.paidK,fmt(t.paid,u),true)+(t.gap?row(Lx.gapK,fmt(t.gap,u)):''):''}
    </div>
    ${when(m.stage===0&&m.can_compose,()=>`<div style="display:flex;flex-direction:column;gap:8px">
      ${field(Lx.amountPaid+' ('+u+')',`<input class="fld" type="number" step="0.001" min="0" ${onInput(e=>{state.sldAmount=e.target.value;},'sld-a')} value="${esc(state.sldAmount??'')}" placeholder="${esc(String(t.balance??''))}">`)}
      ${field(Lx.commentK,`<input class="fld" ${onInput(e=>{state.sldComment=e.target.value;},'sld-c')} value="${esc(state.sldComment||'')}" placeholder="${esc(Lx.gapHint)}">`)}
      <span style="font-size:12px;color:var(--mute)">${esc(Lx.cashLinkHint)}</span></div>`)}
  </div>`;
}

function tplBrdAnomalies(det){
  const Lx=L(),m=det.manifest;
  return `<div style="padding:var(--pad);border-top:1px solid var(--line);display:flex;flex-direction:column;gap:6px">
    <b>⚠ ${esc(Lx.anomaliesK)} (${det.anomalies.length})</b>
    ${each(det.anomalies,a=>`<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--line)">
      <span style="${css(badge(a.status==='open'?'r':'g'))}">${esc(anomL(a.kind))}</span><b style="font-family:var(--mono)">${esc(a.order_ref||a.code||'')}</b><span style="color:var(--mute);flex:1">${esc(a.note||'')}${a.resolution?' → '+esc(a.resolution)+(a.corrected?' ('+Lx.correctedK+')':''):''}</span>
      ${when(a.status==='open',()=>tplAnomalyActions(a,()=>loadBrd(m.id)))}</div>`)}
  </div>`;
}
/* explicit validation of a stock correction (never automatic) */
function tplAnomalyActions(a,after){
  const Lx=L(),canFix=a.order_id&&['manquant','supplementaire'].includes(a.kind);
  const go=correct=>askReason(correct?Lx.correctTitle:Lx.resolveTitle,true,txt=>act(async()=>{await api(`stock/anomalies/${a.id}/resolve`,{method:'POST',body:{resolution:txt,correct}});await after();},Lx.saved));
  return `<span style="display:flex;gap:4px">${canFix?`<button ${on(()=>go(true))} style="${BTN_GHOST};padding:4px 8px;font-size:12px">${esc(a.kind==='manquant'?Lx.fixMissing:Lx.fixExtra)}</button>`:''}<button ${on(()=>go(false))} style="${BTN_GHOST};padding:4px 8px;font-size:12px">${esc(Lx.resolveK)}</button></span>`;
}

/* ------------------------------------------------------------------ PDF (A4, Code 128 on the document and on every line) */
function brdPdfSpec(det){
  const m=det.manifest,items=det.items,t=m.type,u='TND';
  const c=(tx,w,align,code)=>({t:tx,w,align,code});
  const cod=items.reduce((a,i)=>a+(i.cod||0),0);
  const titles={transfer:'Bordereau de transfert inter-agences',dispatch:'Bordereau d’expédition (remise au livreur)',return:'Bordereau de retour livreur',exchange:'Bordereau d’échange',
    call:'Bordereau d’émission d’appel',inventory:'Bordereau d’inventaire',settlement:'Bordereau de solde'};
  const info=[['Type',btL(t)],['Statut',bstL(m.stage,t)],['Agence',m.origin_agency_name||'-'],['Créé par',(m.created_by_name||m.responsible||'-')+' le '+dtm(m.created_at)]];
  if(t==='transfer')info.push(['Destination',m.dest_agency_name],['Transporteur',m.carrier||'-'],['Chauffeur / livreur',m.driver_name||'-'],['Expédié le',dtm(m.shipped_at)],['Réception',m.reception_state?RECEPTION[m.reception_state][0]:'-'],['Clôturé le',dtm(m.closed_at)]);
  if(['dispatch','exchange','return'].includes(t))info.push(['Livreur',m.driver_name?m.driver_name+' (#'+m.driver_id+') '+fmtPhone(m.driver_phone):'-'],['Remis / confirmé le',dtm(m.handed_at||m.closed_at)]);
  if(t==='settlement')info.push([m.driver_id?'Livreur':'Boutique',m.driver_name||m.shop_name||'-'],['Période',(m.period_from||'')+' -> '+(m.period_to||'')],['Validé par',m.validated_by_name?m.validated_by_name+' le '+dtm(m.validated_at):'-']);
  if(m.result)info.push(['Résultat',resL(m.result)]);
  if(m.comment)info.push(['Commentaire',m.comment]);
  let columns,rows,totals=[],signatures,notes=[];
  const st=i=>stL(i.status);
  switch(t){
    case 'transfer':columns=[c('#',7),c('Code',40,null,true),c('Destinataire',40),c('Téléphone',27),c('Ville / zone',34),c('COD',20,'right'),c('Reçu',16)];
      rows=items.map((i,k)=>({code:i.ref,cells:[k+1,'',i.client_name,fmtPhone(i.client_phone),[i.dest_city_name,i.zone_name].filter(Boolean).join(' / '),(+i.cod).toFixed(3),i.received_at?'oui'+(i.anomaly?' (!)':''):i.anomaly==='manquant'?'MANQUANT':'']}));
      totals=[`Total : ${items.length} colis - ${items.reduce((a,i)=>a+(i.pieces||1),0)} pièces - COD ${cod.toFixed(3)} ${u}`];if(m.reserves)notes.push('Réserves : '+m.reserves);
      signatures=['Agence de départ','Transporteur','Agence de destination'];break;
    case 'dispatch':columns=[c('#',7),c('Code',40,null,true),c('Destinataire',42),c('Téléphone',27),c('Zone / adresse',40),c('COD',20,'right')];
      rows=items.map((i,k)=>({code:i.ref,cells:[k+1,'',i.client_name,fmtPhone(i.client_phone),[i.zone_name,i.address].filter(Boolean).join(' - '),(+i.cod).toFixed(3)]}));
      totals=[`Total : ${items.length} colis - COD à encaisser ${cod.toFixed(3)} ${u}`];signatures=['Agence (remise)','Livreur (réception des colis)'];break;
    case 'return':columns=[c('#',7),c('Code',40,null,true),c('Destinataire',40),c('Motif',50),c('Statut',30)];
      rows=items.map((i,k)=>({code:i.ref,cells:[k+1,'',i.client_name,retL(i.reason)+(i.comment?' - '+i.comment:''),st(i)]}));
      totals=[`Total : ${items.length} colis rapportés`];signatures=['Livreur (remise)','Agence (contrôle et entrée en stock)'];break;
    case 'exchange':columns=[c('#',7),c('Code',40,null,true),c('Sens',22),c('Client',40),c('Statut',28),c('Résultat',26)];
      rows=items.map((i,k)=>({code:i.ref,cells:[k+1,'',i.role==='pickup'?'À récupérer':'À livrer',i.client_name+(i.related_ref?' ('+i.related_ref+')':''),st(i),i.result==='ok'?'OK':i.result==='failed'?'Échec':'']}));
      totals=[`${items.filter(i=>i.role!=='pickup').length} à livrer - ${items.filter(i=>i.role==='pickup').length} à récupérer`];signatures=['Agence','Livreur','Client'];break;
    case 'call':columns=[c('#',7),c('Code',40,null,true),c('Client',32),c('Téléphone',26),c('Motif',28),c('Résultat',28),c('Commentaire',34)];
      rows=items.map((i,k)=>({code:i.ref,cells:[k+1,'',i.client_name,i.phone||fmtPhone(i.client_phone),i.reason||'',i.call_result?callL(i.call_result)+(i.called_at?' '+dtm(i.called_at):''):'',i.comment||'']}));
      totals=[`${items.length} appels - ${items.filter(i=>i.call_result).length} effectués`];notes.push('Aucun changement de statut automatique : les suites sont décidées par l’agence.');signatures=['Agent'];break;
    case 'inventory':columns=[c('#',7),c('Code',40,null,true),c('Client',50),c('Statut',30),c('Comptage',30)];
      rows=items.map((i,k)=>({code:i.ref,cells:[k+1,'',i.client_name,st(i),!i.expected?'SUPPLÉMENTAIRE':i.scanned_at?'compté '+hm(i.scanned_at):m.stage===4?'MANQUANT':'à compter']}));
      {const tt=m.totals||{};totals=[`Théorique : ${items.filter(i=>i.expected).length} - comptés : ${items.filter(i=>i.scanned_at).length} - manquants : ${tt.missing??items.filter(i=>i.expected&&!i.scanned_at).length} - supplémentaires : ${items.filter(i=>!i.expected).length} - codes inconnus : ${tt.unknown??0}`];}
      notes.push('Les écarts ne sont corrigés qu’après validation explicite, anomalie par anomalie.');signatures=['Agent d’inventaire','Responsable d’agence'];break;
    case 'settlement':{const tt=m.totals||{};columns=[c('#',7),c('Code',40,null,true),c('Client',50),c('COD',24,'right'),c(m.driver_id?'Commission':'Frais',24,'right'),c('Montant',26,'right')];
      rows=items.map((i,k)=>({code:i.ref,cells:[k+1,'',i.client_name,(+i.cod).toFixed(3),(+(m.driver_id?i.driver_share:i.delivery_fee)).toFixed(3),(+i.amount).toFixed(3)]}));
      totals=[`Commandes : ${tt.orders??0} - encaissé : ${fmt(tt.collected)} - frais : ${fmt(tt.fees)} - commissions : ${fmt(tt.commissions)} ${u}`,
        ...(tt.party==='shop'?[`Dû à la boutique : ${fmt(tt.due)} ${u}`]:[]),`Déjà versé : ${fmt(tt.remitted_before)} ${u} - SOLDE : ${fmt(tt.balance)} ${u}`,...(tt.paid!=null?[`Montant validé : ${fmt(tt.paid)} ${u}`+(tt.gap?` (écart ${fmt(tt.gap)})`:'')]:[])];
      notes.push('Écriture de caisse liée au bordereau (aucune comptabilité parallèle).');signatures=[m.driver_id?'Livreur':'Boutique','Caisse / agence'];break;}
  }
  return {title:titles[t],ref:m.ref,subtitle:m.origin_agency_name,info,columns,rows,totals,notes,signatures,
    cancelled:m.stage===5?{at:dtm(m.cancelled_at),by:m.cancelled_by_name||'',reason:m.cancel_reason||''}:null};
}
async function exportManifestPdf(det,printIt){
  const Lx=L();
  try{
    const doc=await buildPdf(brdPdfSpec(det),{save:!printIt});
    if(printIt){doc.autoPrint();const url=doc.output('bloburl');const w=window.open(url,'_blank');if(!w)toast(Lx.popupBlocked,'err');}
    return doc;
  }catch(e){toast(e.message,'err');}
}

Object.assign(K,{
  driverCarrier:['Chauffeur / livreur','السائق / الموزع'],brdHint2:['Le bordereau est créé en brouillon : ajoutez les colis par sélection ou par scan.','تنشأ البوليصة كمسودة: أضف الطرود بالاختيار أو بالمسح.'],
  received:['reçus','مستلمة'],validate:['Valider','تأكيد'],ship:['Expédier','شحن'],markArrived:['Marquer arrivé','تسجيل الوصول'],closeBrd:['Clôturer','إقفال'],
  addByScan:['Ajouter par scan','إضافة بالمسح'],loadByScan:['Chargement (scan)','التحميل (مسح)'],receiveByScan:['Réception (scan)','الاستلام (مسح)'],receiveOne:['Réceptionner','استلام'],loaded:['chargé','محمّل'],
  totalCod:['Total COD','مجموع المبالغ'],missingParcels:['Colis manquants','طرود ناقصة'],missingAtClose:['Clôturé avec colis manquants','أغلقت مع طرود ناقصة'],remove:['Retirer','حذف'],
  brdEmpty:['Aucun colis sur ce bordereau.','لا توجد طرود في هذه البوليصة.'],addParcels:['Ajouter des colis','إضافة طرود'],noPickable:['Aucun colis disponible.','لا توجد طرود متاحة.'],
  brdHistory:['Historique du bordereau','سجل البوليصة'],
  newBrdOf:['Nouveau bordereau','بوليصة جديدة'],pickBrd:['Choisissez un bordereau ou créez-en un.','اختر بوليصة أو أنشئ واحدة.'],lines:['lignes','أسطر'],counted:['comptés','محسوبة'],
  driverK:['Livreur','الموزع'],noDriver:['Sans livreur','بدون موزع'],searchDriver:['Rechercher un livreur (nom, n°, téléphone)…','ابحث عن موزع…'],noDriverFound:['Aucun livreur.','لا يوجد موزع.'],
  dAvail:['Disponible','متاح'],dBusy:['En livraison','قيد التوصيل'],dPause:['En pause','استراحة'],dOff:['Hors service','خارج الخدمة'],inactiveK:['Désactivé','معطل'],drvInProgress:['en cours','جارية'],inHand:['en main','بحوزته'],
  periodFrom:['Du','من'],periodTo:['Au','إلى'],periodK:['Période','الفترة'],invHint:['Le stock théorique de l’agence est figé à l’ouverture de la session, puis chaque colis est scanné.','يتم تجميد المخزون النظري عند فتح الجلسة ثم يمسح كل طرد.'],
  openSession:['Ouvrir la session','فتح الجلسة'],commentK:['Commentaire','تعليق'],createdBy:['Créé par','أنشأها'],handedAt:['Remis le','سُلّم في'],confirmedAt:['Confirmé le','أُكّد في'],calledK:['Appels faits','اتصالات منجزة'],
  theoretical:['Stock théorique','المخزون النظري'],extraK:['Supplémentaires','زائدة'],resultK:['Résultat','النتيجة'],validatedBy:['Validé par','صادق عليه'],
  closeReserves:['Clôturer avec réserves','إقفال مع تحفظات'],reservesTitle:['Réserves (manquants, endommagés…)','التحفظات'],reservesK:['Réserves','التحفظات'],
  confirmHandover:['Confirmer la remise au livreur','تأكيد التسليم للموزع'],handedOver:['Colis remis au livreur','تم تسليم الطرود'],confirmReturn:['Confirmer le retour (entrée en stock)','تأكيد الإرجاع'],returnConfirmed:['Retour confirmé : colis en stock','تم تأكيد الإرجاع'],
  handOverExchange:['Valider et remettre au livreur','تأكيد وتسليم'],closeInventory:['Clôturer l’inventaire','إقفال الجرد'],recompute:['Recalculer','إعادة الحساب'],validateSettlement:['Valider le solde','المصادقة على التسوية'],settlementDone:['Solde validé et enregistré en caisse','تمت المصادقة وتسجيلها في الصندوق'],
  confirmDelete:['Supprimer définitivement ce brouillon ?','حذف هذه المسودة نهائيا؟'],deleted:['Brouillon supprimé','تم حذف المسودة'],deleteDraft:['Supprimer le brouillon','حذف المسودة'],cancelBrd:['Annuler le bordereau','إلغاء البوليصة'],
  cancelBrdTitle:['Annuler le bordereau — motif obligatoire','إلغاء البوليصة — السبب إجباري'],cancelled:['Bordereau annulé','تم الإلغاء'],reversed:['réintégrés','أعيدت'],reversalDone:['contre-passation en caisse','قيد عكسي في الصندوق'],notReversed:['Non réversibles (déjà traités)','غير قابلة للإرجاع'],
  toReturn:['À rapporter par bordereau de retour','للإرجاع ببوليصة إرجاع'],reasonK:['Motif','السبب'],changeDriver:['Livreur du bordereau','موزع البوليصة'],
  hintAdd:['Scannez ou saisissez les colis à ajouter','امسح أو أدخل الطرود'],hintCount:['Scannez chaque colis présent','امسح كل طرد موجود'],hintCheck:['Contrôle : scannez chaque colis remis','مراقبة: امسح كل طرد'],hintReceive:['Réception : scannez chaque colis arrivé','الاستلام: امسح كل طرد وصل'],
  scanPh:['Code-barres / QR / référence SD-…','رمز / مرجع'],camera:['Caméra','الكاميرا'],usbHint:['lecteur USB : scannez directement dans le champ (validation automatique par Entrée)','قارئ USB: امسح مباشرة في الحقل'],
  returnReason:['Motif de retour','سبب الإرجاع'],nextScan:['Prochain scan :','المسح التالي:'],condOk:['Bon état','حالة جيدة'],condDamaged:['Endommagé','تالف'],otherReason:['Motif « Autre » : précisez','سبب آخر: وضّح'],
  missingK:['MANQUANT','ناقص'],handedK:['remis','سُلّم'],checkedK:['contrôlé','مراقب'],toPickup:['À récupérer','للاسترجاع'],brdToDeliver:['À livrer','للتوصيل'],collectedK:['Récupéré','تم الاسترجاع'],notCollected:['Non récupéré','لم يسترجع'],
  okDelivered:['Livré','سُلّم'],notDelivered:['Non livré','لم يُسلّم'],motiveK:['Motif de l’appel','سبب الاتصال'],client:['Client','الحريف'],destK:['Destination','الوجهة'],statusK:['Statut','الحالة'],zoneK:['Zone','المنطقة'],
  roleK:['Sens','الاتجاه'],countK:['Comptage','العدّ'],commissionK:['Commission','العمولة'],feesK:['Frais','المصاريف'],amountK:['Montant','المبلغ'],noSettleLines:['Aucune commande livrée sur la période.','لا توجد طلبات مسلمة في الفترة.'],
  addPickup:['Colis à récupérer chez le client','طرد للاسترجاع من الحريف'],pickupHint:['Une commande « à récupérer » liée est créée (sans frais) et suivie séparément.','ينشأ طلب استرجاع مرتبط ويُتابع بشكل منفصل.'],forParcel:['Pour le colis','للطرد'],
  itemToCollect:['Article à récupérer','المادة المسترجعة'],addPickupBtn:['Ajouter la récupération','إضافة'],parcelsWithDriver:['Colis chez ce livreur','طرود لدى هذا الموزع'],stockAvailable:['Stock disponible pour livraison','المخزون المتاح للتوصيل'],
  pickReasonFirst:['Choisissez d’abord le motif de retour (appliqué aux colis ajoutés).','اختر سبب الإرجاع أولا.'],
  ordersK:['Commandes livrées','الطلبات المسلمة'],collectedK2:['Montants encaissés (COD)','المبالغ المحصلة'],sldDueShop:['Dû à la boutique','المستحق للمتجر'],alreadyPaid:['Déjà versé (période)','المدفوع سابقا'],
  balanceDriver:['Solde à verser par le livreur','الرصيد على الموزع'],sldBalanceShop:['Solde à payer à la boutique','الرصيد للمتجر'],paidK:['Montant validé','المبلغ المصادق'],gapK:['Écart','الفارق'],
  amountPaid:['Montant réellement versé','المبلغ المدفوع فعلا'],gapHint:['Obligatoire si le montant diffère du solde','إجباري إذا اختلف المبلغ'],cashLinkHint:['La validation crée une seule écriture dans la Caisse, liée à ce bordereau.','تنشئ المصادقة قيدا واحدا في الصندوق.'],
  anomaliesK:['Anomalies','الإخلالات'],correctedK:['stock corrigé','تم تصحيح المخزون'],correctTitle:['Valider la correction de stock — justification','تأكيد تصحيح المخزون — التبرير'],resolveTitle:['Classer l’anomalie — explication','إغلاق الإخلال — التوضيح'],
  fixMissing:['Corriger : sortir du stock','تصحيح: إخراج من المخزون'],fixExtra:['Corriger : entrer en stock','تصحيح: إدخال للمخزون'],resolveK:['Classer','إغلاق'],
});

/* scanner actions related to transfer bordereaux (§9): need a bordereau */
SCAN_ACTIONS.staff.splice(1,0,['manifest_add',['Ajout au bordereau','إضافة للبوليصة']],['ship',['Expédition (chargement)','الشحن']],['arrival',['Arrivée (agence destination)','الوصول']]);
const SCAN_STAGES={manifest_add:[0],ship:[1,2],arrival:[2,3]};
const baseOnScanSettings=onScanSettings;
onScanSettings=async function(){
  if(SCAN_STAGES[SC.action]&&!SC.handler){
    const ok=(state.data?.manifests||[]).filter(m=>(m.type||'transfer')==='transfer'&&SCAN_STAGES[SC.action].includes(m.stage));
    if(!ok.some(m=>m.id===+SC.manifest_id))SC.manifest_id=ok[0]?.id||'';
    SC.extraUi=()=>`<label class="slab">${esc(L().brd)}<select class="fld" data-sch="manifest_id">${ok.length?ok.map(m=>`<option value="${m.id}"${m.id===+SC.manifest_id?' selected':''}>${esc(m.ref)} · ${esc(bstL(m.stage))}</option>`).join(''):`<option value="">${esc(L().noBrd)}</option>`}</select></label>`;
  }else SC.extraUi=null;
  return baseOnScanSettings();
};
