/* SADEN — « Colis »: professional parcel list (server-side pagination, advanced filters, pasted list of codes,
   chosen columns), bulk actions (labels A6 / A4 / Zebra, status update through the state machine, Excel export)
   and the status × agency / shop / driver / city matrix. */

const PCOLS=[['ref',['Code','الرمز'],1],['external_ref',['Réf. externe','مرجع خارجي']],['status',['Statut','الحالة'],1],['client_name',['Destinataire','المرسل إليه'],1],
  ['client_phone',['Téléphone','الهاتف'],1],['address',['Adresse','العنوان']],['dest_city_name',['Ville','المدينة'],1],['dest_governorate',['Gouvernorat','الولاية']],['zone_name',['Zone','المنطقة']],
  ['shop_name',['Expéditeur','المرسل'],1],['pickup_address',['Adresse pickup','عنوان الالتقاط']],['current_agency_name',['Agence actuelle','الوكالة الحالية']],['origin_agency_name',['Agence de départ','وكالة الانطلاق']],
  ['driver_name',['Livreur','الموزع'],1],['description',['Description','الوصف']],['pieces',['Pièces','القطع']],['notes',['Commentaire','تعليق']],['attempts',['Tentatives','المحاولات'],1],
  ['open_problem',['Problème','المشكلة']],['cod',['CR','المبلغ'],1],['amount_to_remit',['CR après remise','الصافي']],['delivery_fee',['Frais','المصاريف']],['payment_mode',['Paiement','الدفع']],
  ['in_stock',['En stock','في المخزون']],['created_at',['Créé le','أنشئ في'],1],['delivered_at',['Livré le','سُلّم في']],['manifests',['Bordereaux','البوليصات']]];
const PSTATUS=['attente','en_agence','affecte','accepte','ramasse','transit','arrive','livraison','livre','absent','refuse','reporte','numero_incorrect','adresse_incorrecte','endommage','retour','retour_agence','restitue','annule','perdu'];
const pcolsOn=()=>{try{const v=JSON.parse(localStorage.getItem('saden.pcols')||'null');if(Array.isArray(v)&&v.length)return v;}catch{}return PCOLS.filter(c=>c[2]).map(c=>c[0]);};
function pQuery(extra={}){
  const f=state.pf||{},qs=new URLSearchParams();
  for(const k of ['q','status','shop_id','driver_id','dest_city_id','current_agency_id','attempts','cod_min','cod_max','from','to','delivered_from','delivered_to','in_stock','flagged','kind','sort'])if(f[k])qs.set(k,f[k]);
  if(f.refs)qs.set('refs',f.refs);
  if(role()==='admin'&&state.agencyFilter)qs.set('agency_id',state.agencyFilter);
  for(const [k,v] of Object.entries(extra))qs.set(k,v);
  return qs.toString();
}
async function loadParcels(){
  const tab=state.pTab||'list';
  if(tab==='matrix'){const d=await api('parcels/matrix?'+pQuery({by:state.pBy||'agency'}));if(state.pTab==='matrix')state.pm=d;return;}
  const d=await api('parcels?'+pQuery({page:state.pPage||1,size:state.pSize||50}));
  if((state.pTab||'list')==='list')state.pl=d;
}
const reloadParcels=(resetPage=true)=>{if(resetPage)state.pPage=1;state.pl=null;state.pm=null;render();loadParcels().then(render).catch(e=>toast(e.message,'err'));};

function tplParcels(){
  const Lx=L(),tab=state.pTab||(state.pTab='list');
  if(!state.pf)state.pf={};
  const need=tab==='list'?!state.pl:!state.pm;
  if(need&&state._pReq!==tab){state._pReq=tab;loadParcels().catch(e=>toast(e.message,'err')).finally(()=>{state._pReq=null;render();});}
  const tabs=`<div class="no-print" style="display:flex;gap:6px">${each([['list',Lx.pList],['matrix',Lx.pMatrix]],([k,l])=>`<button ${on(()=>{state.pTab=k;reloadParcels();})} data-ptab="${k}" style="${css(chip(tab===k))}">${esc(l)}</button>`)}</div>`;
  return tabs+tplPFilters()+(tab==='list'?tplPList():tplPMatrix());
}

function tplPFilters(){
  const Lx=L(),f=state.pf,d=state.data||{},open=state.pfOpen;
  const cities=(G().cities||[]).map(c=>[c.id,c.name]);
  const status=(f.status||'').split(',').filter(Boolean);
  return `<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px" data-pfilters>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
      <div style="flex:1;min-width:220px">${field(Lx.searchK,input('pf-q','pf','q','placeholder="SD-… / client / téléphone / adresse"'))}</div>
      ${field(Lx.statusK,`<select class="fld" ${onInput(e=>{state.pf={...state.pf,status:e.target.value};},'pf-st')}><option value="">${esc(Lx.any)}</option>${each(PSTATUS,k=>`<option value="${k}"${status.length===1&&status[0]===k?' selected':''}>${esc(stL(k))}</option>`)}</select>`)}
      <button ${on(()=>{state.pfOpen=!open;render();})} style="${BTN_GHOST}">${open?'▲':'▼'} ${esc(Lx.moreFilters)}</button>
      <button ${on(()=>reloadParcels())} style="${BTN_PRIMARY}">${esc(Lx.launchSearch)}</button>
      <button ${on(()=>{state.pf={};state.pfOpen=false;reloadParcels();})} style="${BTN_GHOST}">${esc(Lx.resetK)}</button>
    </div>
    ${when(open,()=>`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:8px;align-items:end">
      ${field(Lx.colShop,select('pf-shop','pf','shop_id',[['',Lx.any],...(d.shops||[]).map(x=>[x.id,x.shop_name])]))}
      ${field(Lx.driverK,select('pf-drv','pf','driver_id',[['',Lx.any],...(d.drivers||[]).map(x=>[x.id,x.name])]))}
      ${field(Lx.city,select('pf-city','pf','dest_city_id',[['',Lx.any],...cities]))}
      ${field(Lx.currentAgency,select('pf-ag','pf','current_agency_id',[['',Lx.any],...agencyOptions()]))}
      ${field(Lx.attemptsK,select('pf-att','pf','attempts',[['',Lx.any],['0','0'],['1','1'],['2','2'],['3','3'],['4','+3']]))}
      ${field(Lx.codMin,input('pf-cmin','pf','cod_min','type="number" step="0.001"'))}${field(Lx.codMax,input('pf-cmax','pf','cod_max','type="number" step="0.001"'))}
      ${field(Lx.createdFrom,input('pf-from','pf','from','type="date"'))}${field(Lx.createdTo,input('pf-to','pf','to','type="date"'))}
      ${field(Lx.deliveredFrom,input('pf-dfrom','pf','delivered_from','type="date"'))}${field(Lx.deliveredTo,input('pf-dto','pf','delivered_to','type="date"'))}
      ${field(Lx.kindK,select('pf-kind','pf','kind',[['',Lx.any],['delivery',Lx.kDelivery],['pickup',Lx.kPickup]]))}
      ${field(Lx.sortK,select('pf-sort','pf','sort',[['created_desc',Lx.sNewest],['created_asc',Lx.sOldest],['updated_desc',Lx.sUpdated],['cod_desc',Lx.sCod],['attempts_desc',Lx.sAttempts],['ref','Code']]))}
      <label style="display:flex;gap:6px;align-items:center;font-size:12.5px"><input type="checkbox" ${f.in_stock?'checked':''} ${on(()=>{state.pf={...state.pf,in_stock:f.in_stock?'':'1'};render();})}> ${esc(Lx.inStockOnly)}</label>
      <label style="display:flex;gap:6px;align-items:center;font-size:12.5px"><input type="checkbox" ${f.flagged?'checked':''} ${on(()=>{state.pf={...state.pf,flagged:f.flagged?'':'1'};render();})}> ${esc(Lx.flaggedOnly)}</label>
      <div style="grid-column:1/-1">${field(Lx.pasteCodes,`<textarea class="fld" rows="3" ${onInput(e=>{state.pf={...state.pf,refs:e.target.value};},'pf-refs')} placeholder="SD-24101&#10;SD-24102&#10;…" style="font-family:var(--mono)">${esc(f.refs||'')}</textarea>`)}</div>
    </div>`)}
  </div>`;
}

function tplPList(){
  const Lx=L(),d=state.pl;
  if(!d)return `<div style="${CARD};padding:24px"><span class="spin"></span></div>`;
  const cols=pcolsOn().map(k=>PCOLS.find(c=>c[0]===k)).filter(Boolean),sel=state.pSel||(state.pSel=[]);
  const allOn=d.rows.length&&d.rows.every(r=>sel.includes(r.id));
  const toggle=id=>()=>{state.pSel=sel.includes(id)?sel.filter(x=>x!==id):[...sel,id];render();};
  const toggleAll=()=>{state.pSel=allOn?sel.filter(x=>!d.rows.some(r=>r.id===x)):[...new Set([...sel,...d.rows.map(r=>r.id)])];render();};
  const cell=(r,k)=>{const v=r[k];
    if(k==='ref')return `<span ${on(()=>selectOrder(r.id))} style="font-family:var(--mono);font-size:12px;cursor:pointer;text-decoration:underline dotted">${esc(v)}</span>${r.flagged_at?' ⚑':''}`;
    if(k==='status')return `<span style="${css(stB(v))}">${esc(stL(v))}</span>`;
    if(k==='client_phone')return esc(fmtPhone(v));
    if(['cod','amount_to_remit','delivery_fee'].includes(k))return `<span style="font-weight:600">${esc(fmt(v))}</span>`;
    if(['created_at','delivered_at'].includes(k))return esc(v?dtm(v):'—');
    if(k==='in_stock')return v?'✓':'';
    if(k==='attempts')return `<b style="color:${v>=3?'var(--rf)':'inherit'}">${v}</b>`;
    if(k==='open_problem')return v?`<span style="${css(badge('r'))}">${esc(pbL(v))}</span>`:'';
    if(k==='payment_mode')return esc(pmL(v));
    return esc(v==null||v===''?'—':String(v));};
  const grid=`36px ${cols.map(c=>['address','description','notes','manifests','pickup_address'].includes(c[0])?'minmax(160px,1.6fr)':['client_name','shop_name','driver_name'].includes(c[0])?'minmax(120px,1fr)':'minmax(90px,auto)').join(' ')}`;
  const pager=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12.5px">
    <span>${esc(Lx.showing)} ${d.total?(d.page-1)*d.size+1:0}–${Math.min(d.page*d.size,d.total)} / <b>${d.total}</b> · CR ${esc(fmt(d.cod_total,Lx.tnd))}</span><span style="flex:1"></span>
    <select class="fld" style="max-width:90px" ${onInput(e=>{state.pSize=+e.target.value;reloadParcels();},'p-size')}>${each([25,50,100,200],n=>`<option${n===d.size?' selected':''}>${n}</option>`)}</select>
    <button ${d.page>1?on(()=>{state.pPage=d.page-1;reloadParcels(false);}):'disabled'} style="${BTN_GHOST};padding:6px 10px">‹</button><span>${d.page} / ${d.pages}</span>
    <button ${d.page<d.pages?on(()=>{state.pPage=d.page+1;reloadParcels(false);}):'disabled'} style="${BTN_GHOST};padding:6px 10px">›</button></div>`;
  const nsel=sel.length;
  const actions=`<div class="no-print" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center" data-pactions>
    <b style="font-size:12.5px">${nsel} ${esc(Lx.selectedK)}</b>
    <button ${nsel?on(()=>bulkLabels('a6')):'disabled'} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">🏷 ${esc(Lx.labelsA6)}</button>
    <button ${nsel?on(()=>bulkLabels('a4')):'disabled'} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">🏷 ${esc(Lx.labelsA4)}</button>
    <button ${nsel?on(()=>bulkLabels('zpl')):'disabled'} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">🦓 Zebra (ZPL)</button>
    <button ${nsel?on(()=>{state.bulkSt={status:'',note:''};render();}):'disabled'} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">⇆ ${esc(Lx.bulkStatus)}</button>
    ${nsel?`<button ${on(()=>{state.pSel=[];render();})} style="background:none;border:none;color:var(--of);cursor:pointer;font-size:12.5px">${esc(Lx.clearSel)}</button>`:''}
    <span style="flex:1"></span>
    <button ${on(exportParcels)} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">⤓ ${esc(Lx.exportXlsx)}</button>
    <button ${on(()=>{state.pColsOpen=!state.pColsOpen;render();})} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">▦ ${esc(Lx.shownFields)}</button></div>`;
  const colPicker=state.pColsOpen?`<div style="${CARD};padding:var(--pad);display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px" data-pcols>${each(PCOLS,([k,l])=>{const onn=pcolsOn().includes(k);
    return `<label style="display:flex;gap:6px;align-items:center;font-size:12.5px"><input type="checkbox" ${onn?'checked':''} ${on(()=>{const cur=pcolsOn();const next=onn?cur.filter(x=>x!==k):PCOLS.map(c=>c[0]).filter(x=>x===k||cur.includes(x));try{localStorage.setItem('saden.pcols',JSON.stringify(next.length?next:['ref']));}catch{}render();})}> ${esc(l[li()])}</label>`;})}</div>`:'';
  const rep=state.bulkReport;
  const report=rep?`<div style="padding:10px var(--pad);border-radius:var(--r);background:${rep.errors.length?'var(--wb)':'var(--gb)'};color:${rep.errors.length?'var(--wf)':'var(--gf)'};font-size:12.5px;display:flex;gap:10px;align-items:flex-start" data-bulkreport>
    <span style="flex:1"><b>${esc(Lx.bulkDone)} : ${rep.done.length}</b>${rep.done.length?' — '+esc(rep.done.join(', ')):''}${rep.errors.length?`<br><b>${esc(Lx.bulkRefused)} : ${rep.errors.length}</b><br>${each(rep.errors,e=>esc(e)+'<br>')}`:''}</span>
    <button ${on(()=>{state.bulkReport=null;render();})} style="background:none;border:none;cursor:pointer;color:inherit">✕</button></div>`:'';
  return `${report}${actions}${colPicker}${when(d.not_found?.length,()=>`<div style="padding:10px var(--pad);border-radius:var(--r);background:var(--wb);color:var(--wf);font-size:12.5px">${esc(Lx.notFoundCodes)} (${d.not_found.length}) : ${esc(d.not_found.join(', '))}</div>`)}
    <div style="${CARD};overflow:hidden"><div style="padding:var(--pad)">${pager}</div><div style="overflow-x:auto"><div style="min-width:${Math.max(700,cols.length*120)}px">
      <div style="display:grid;grid-template-columns:${grid};gap:10px;padding:8px var(--pad);font-size:11.5px;color:var(--mute);background:var(--surface2);font-weight:600;align-items:center">
        <input type="checkbox" ${allOn?'checked':''} ${on(toggleAll)} aria-label="${esc(Lx.selectAll)}">${each(cols,c=>`<span>${esc(c[1][li()])}</span>`)}</div>
      ${d.rows.length?each(d.rows,r=>`<div style="display:grid;grid-template-columns:${grid};gap:10px;align-items:center;padding:8px var(--pad);border-top:1px solid var(--line);font-size:12.5px;${sel.includes(r.id)?'background:var(--ib)':''}" data-prow="${esc(r.ref)}">
        <input type="checkbox" ${sel.includes(r.id)?'checked':''} ${on(toggle(r.id))}>${each(cols,c=>`<span style="min-width:0;overflow-wrap:anywhere">${cell(r,c[0])}</span>`)}</div>`):empty()}
    </div></div><div style="padding:var(--pad)">${pager}</div></div>${tplBulkStatus()}`;
}

async function bulkLabels(format){
  const Lx=L(),ids=state.pSel||[];
  if(!ids.length)return;
  const w=format==='zpl'?null:window.open('','_blank','width=900,height=900');   // opened synchronously (popup blockers)
  if(format!=='zpl'&&!w)return toast(Lx.popupBlocked,'err');
  try{
    const {orders}=await api('parcels/labels',{method:'POST',body:{ids}});
    if(format==='zpl'){downloadText(`etiquettes-${orders.length}.zpl`,labelsZpl(orders));toast(Lx.zplDone+' ('+orders.length+')');return;}
    await loadLib('qr');w.document.open();w.document.write(labelsHtml(orders,format));w.document.close();
  }catch(e){w?.close();toast(e.message,'err');}
}

function tplBulkStatus(){
  const b=state.bulkSt;if(!b)return '';
  const Lx=L(),n=(state.pSel||[]).length;
  const go=()=>act(async()=>{const c=state.bulkSt;if(!c.status)throw new Error(Lx.choose);
    const r=await api('parcels/bulk-status',{method:'POST',body:{ids:state.pSel,status:c.status,note:c.note}});
    state.bulkSt=null;state.pSel=[];state.bulkReport=r;await loadParcels();},null);
  return `<div class="no-print" style="position:fixed;inset:0;z-index:1500;background:oklch(0.1 0.03 262 / .55);display:flex;align-items:center;justify-content:center;padding:16px" data-bulk>
    <div style="${CARD};width:min(460px,100%);padding:18px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;justify-content:space-between"><b style="font-size:16px">${esc(Lx.bulkStatus)} · ${n} ${esc(Lx.parcels)}</b><button ${on(()=>{state.bulkSt=null;render();})} style="${BTN_GHOST};padding:4px 9px">✕</button></div>
      ${field(Lx.newStatus,`<select class="fld" ${onInput(e=>{state.bulkSt={...state.bulkSt,status:e.target.value};},'bs-st')}><option value="">${esc(Lx.choose)}</option>${each(PSTATUS,k=>`<option value="${k}"${b.status===k?' selected':''}>${esc(stL(k))}</option>`)}</select>`)}
      ${field(Lx.noteK+' ('+Lx.reasonIfRequired+')',`<input class="fld" ${onInput(e=>{state.bulkSt={...state.bulkSt,note:e.target.value};},'bs-note')} value="${esc(b.note||'')}">`)}
      <span style="font-size:12px;color:var(--mute)">${esc(Lx.bulkHint)}</span>
      <button ${on(go)} style="${BTN_PRIMARY};min-height:44px">${spin()}${esc(Lx.confirmAction)}</button></div></div>`;
}

async function exportParcels(){
  const Lx=L();
  try{
    const [{rows,capped}]=await Promise.all([api('parcels/export?'+pQuery()),loadLib('xlsx')]);
    const head=PCOLS.map(c=>c[1][0]);
    const data=rows.map(r=>PCOLS.map(([k])=>{const v=r[k];if(k==='status')return stL(v);if(k==='open_problem')return v?pbL(v):'';if(k==='in_stock')return v?'oui':'';
      if(['created_at','delivered_at'].includes(k))return v?new Date(v).toLocaleString('fr-FR'):'';if(k==='payment_mode')return pmL(v);return v??'';}));
    const ws=XLSX.utils.aoa_to_sheet([head,...data]);ws['!cols']=PCOLS.map(([k])=>({wch:['address','description','notes','manifests'].includes(k)?40:16}));
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Colis');
    XLSX.writeFile(wb,`colis-${new Date().toISOString().slice(0,10)}.xlsx`);
    toast(Lx.exported+' : '+rows.length+(capped?' ('+Lx.capped+')':''));
  }catch(e){toast(e.message,'err');}
}

function tplPMatrix(){
  const Lx=L(),m=state.pm;
  const bys=[['agency',Lx.agencyLbl],['shop',Lx.colShop],['driver',Lx.driverK],['city',Lx.city]];
  const top=`<div class="no-print" style="display:flex;gap:6px;flex-wrap:wrap">${each(bys,([k,l])=>`<button ${on(()=>{state.pBy=k;reloadParcels();})} style="${css(chip((state.pBy||'agency')===k))}">${esc(l)}</button>`)}</div>`;
  if(!m)return top+`<div style="${CARD};padding:24px"><span class="spin"></span></div>`;
  const tot=st=>m.rows.reduce((a,r)=>a+(st?r.counts[st]:r.total),0);
  const grid=`minmax(160px,1.4fr) ${m.statuses.map(()=>'minmax(70px,1fr)').join(' ')} minmax(70px,1fr)`;
  const go=(k,st)=>()=>{state.pTab='list';state.pf={...state.pf,status:st||''};toast(L().matrixHint);reloadParcels();};
  return `${top}<div style="${CARD};overflow:hidden" data-matrix><div style="overflow-x:auto"><div style="min-width:${300+m.statuses.length*80}px">
    <div style="display:grid;grid-template-columns:${grid};gap:6px;padding:8px var(--pad);font-size:11px;color:var(--mute);background:var(--surface2);font-weight:600"><span></span>${each(m.statuses,st=>`<span style="text-align:center">${esc(stL(st))}</span>`)}<span style="text-align:center">${esc(Lx.totalK)}</span></div>
    ${m.rows.length?each(m.rows,r=>`<div style="display:grid;grid-template-columns:${grid};gap:6px;padding:7px var(--pad);border-top:1px solid var(--line);font-size:12.5px"><b style="font-weight:600">${esc(r.key)}</b>
      ${each(m.statuses,st=>`<span style="text-align:center;${r.counts[st]?'font-weight:600':'color:var(--mute)'}">${r.counts[st]||'·'}</span>`)}<b style="text-align:center">${r.total}</b></div>`):empty()}
    <div style="display:grid;grid-template-columns:${grid};gap:6px;padding:8px var(--pad);border-top:2px solid var(--line);font-weight:700;font-size:12.5px"><span>${esc(Lx.totalK)}</span>${each(m.statuses,st=>`<span ${on(go(null,st))} style="text-align:center;cursor:pointer;text-decoration:underline dotted">${tot(st)}</span>`)}<span style="text-align:center">${tot()}</span></div>
  </div></div></div>`;
}

Object.assign(K,{
  colis:['Colis','الطرود'],bulkDone:['Mis à jour','تم التحديث'],bulkRefused:['Refusés','مرفوضة'],pList:['Les colis','الطرود'],pMatrix:['Matrice','المصفوفة'],moreFilters:['Plus de filtres','مرشحات إضافية'],launchSearch:['Lancer la recherche','بحث'],resetK:['Réinitialiser','إعادة'],
  currentAgency:['Agence actuelle','الوكالة الحالية'],codMin:['CR min','المبلغ الأدنى'],codMax:['CR max','المبلغ الأقصى'],createdFrom:['Créé du','أنشئ من'],createdTo:['Créé au','أنشئ إلى'],
  deliveredFrom:['Livré du','سُلّم من'],deliveredTo:['Livré au','سُلّم إلى'],kDelivery:['Livraison','توصيل'],kPickup:['À récupérer (échange)','للاسترجاع'],sortK:['Tri','الترتيب'],sNewest:['Plus récents','الأحدث'],
  sOldest:['Plus anciens','الأقدم'],sUpdated:['Dernière mise à jour','آخر تحديث'],sCod:['CR décroissant','المبلغ'],sAttempts:['Tentatives','المحاولات'],inStockOnly:['En stock uniquement','في المخزون فقط'],
  flaggedOnly:['Signalés uniquement','المبلغ عنها فقط'],pasteCodes:['Filtrer par liste de codes (collés depuis Excel, un par ligne)','تصفية بقائمة رموز'],showing:['Affichés','معروض'],selectedK:['sélectionné(s)','محدد'],
  labelsA6:['Étiquettes 10×15','ملصقات 10×15'],labelsA4:['Étiquettes A4 (×4)','ملصقات A4'],bulkStatus:['Mise à jour du statut','تحديث الحالة'],clearSel:['Tout désélectionner','إلغاء التحديد'],
  exportXlsx:['Export Excel','تصدير Excel'],shownFields:['Champs affichés','الحقول المعروضة'],notFoundCodes:['Codes introuvables','رموز غير موجودة'],selectAll:['Tout sélectionner','تحديد الكل'],
  zplDone:['Fichier Zebra téléchargé','تم تنزيل ملف Zebra'],newStatus:['Nouveau statut','الحالة الجديدة'],reasonIfRequired:['obligatoire pour les incidents / annulations','إجباري للحوادث'],
  bulkHint:['Chaque colis passe par la machine à états : les transitions non autorisées sont refusées et listées, les autres sont appliquées.','كل طرد يمر بآلة الحالات.'],
  exported:['Export Excel','تم التصدير'],capped:['limité à 20 000 lignes','محدود'],matrixHint:['Liste filtrée sur ce statut','قائمة مصفاة'],
});
