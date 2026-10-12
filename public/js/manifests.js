/* SADEN — « Bordereaux » (§10): manual composition, lifecycle, parcel-by-parcel reception, real PDF export, history. */

const BSTAGE=[['Brouillon','مسودة','n'],['Validé','مؤكد','i'],['En transit','في العبور','o'],['Arrivé','وصل','w'],['Clôturé','مغلق','g']];
const bstL=i=>BSTAGE[i][lang()==='ar'?1:0];
const loadBrd=id=>api('manifests/'+id).then(d=>{if(state.selBrd===id){state.brdDetail=d;render();}}).catch(e=>toast(e.message,'err'));
function selectBrd(id){state.selBrd=id;state.brdDetail=null;state.brdPick=[];state._brdReq=id;render();loadBrd(id);}

function tplBrd(){
  const Lx=L(),u=Lx.tnd,li=lang()==='ar'?1:0,d=state.data,b=state.bform;
  const ms=d.manifests;
  if(state.selBrd==null&&ms[0])state.selBrd=ms[0].id;
  const det=state.brdDetail&&state.brdDetail.manifest.id===state.selBrd?state.brdDetail:null;
  if(state.selBrd!=null&&!det&&state._brdReq!==state.selBrd){state._brdReq=state.selBrd;loadBrd(state.selBrd);}
  const drivers=(d.drivers||[]).filter(x=>x.active);
  const createBrd=()=>act(async()=>{const cur=state.bform;const r=await api('manifests',{method:'POST',body:{origin_agency_id:cur.origin_agency_id,dest_agency_id:cur.dest_agency_id,carrier:cur.carrier,driver_id:cur.driver_id}});state.bform={...state.bform,open:false,carrier:''};state.selBrd=r.manifest.id;state.brdDetail=null;await loadBrd(r.manifest.id);},Lx.saved);
  const list=`<div class="no-print" style="display:flex;flex-direction:column;gap:10px">
      ${b.open?`<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px">
        <b>${esc(Lx.newBrd)}</b>
        ${when(role()==='admin',()=>field(Lx.from,select('b-from','bform','origin_agency_id',[['',Lx.choose],...agencyOptions()],true)))}
        ${field(Lx.to,select('b-to','bform','dest_agency_id',[['',Lx.choose],...agencyOptions(a=>a.id!==(role()==='admin'?+b.origin_agency_id:myAgency()?.id))]))}
        ${field(Lx.carrier,input('b-car','bform','carrier','placeholder="Sud Express Transport"'))}
        ${field(Lx.driverCarrier,select('b-drv','bform','driver_id',[['','—'],...drivers.map(x=>[x.id,x.name])]))}
        <span style="font-size:12px;color:var(--mute)">${esc(Lx.brdHint2)}</span>
        <div style="display:flex;gap:8px"><button ${on(createBrd)} style="${BTN_PRIMARY};flex:1">${spin()}${esc(Lx.createBrd)}</button><button ${on(()=>{state.bform={...state.bform,open:false};render();})} style="${BTN_GHOST}">${esc(Lx.cancel)}</button></div>
      </div>`:`<button ${on(()=>{state.bform={...state.bform,open:true};render();})} style="padding:11px;border-radius:var(--r);border:1px dashed var(--line);background:transparent;font-weight:600;cursor:pointer;color:var(--ink)">+ ${esc(Lx.newBrd)}</button>`}
      ${ms.length?each(ms,x=>`<div ${on(()=>selectBrd(x.id))} style="${css({background:'var(--surface)',border:state.selBrd===x.id?'2px solid var(--orange)':'1px solid var(--line)',borderRadius:'var(--r)',padding:'var(--pad)',display:'flex',flexDirection:'column',gap:4,cursor:'pointer'})}">
        <div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:15px">${esc(x.origin_agency_name||x.from_city)} → ${esc(x.dest_agency_name||x.to_city)}</b><span style="${css(badge(BSTAGE[x.stage][2]))}">${esc(bstL(x.stage))}</span></div>
        <span style="font-family:var(--mono);font-size:11.5px;color:var(--mute)">${esc(x.ref)}</span>
        <span style="font-size:12.5px;color:var(--mute)">${dm(x.created_at)} · ${x.n} ${esc(Lx.parcels)}${x.stage>=2?` · ${x.received}/${x.n} ${esc(Lx.received)}`:''}</span></div>`):`<div style="${CARD}">${empty(Lx.noBrd)}</div>`}
    </div>`;
  if(!det)return `<div class="split" style="display:grid;grid-template-columns:minmax(260px,360px) minmax(0,1fr);gap:var(--gap)">${list}<div style="${CARD};padding:24px">${ms.length?'<span class="spin"></span>':''}</div></div>`;
  const m=det.manifest,items=det.items;
  const missing=m.stage>=3?items.filter(i=>!i.received_at):[];
  const totals={n:items.length,cod:items.reduce((a,i)=>a+i.cod,0),pieces:items.reduce((a,i)=>a+(i.pieces||1),0)};
  const step=(path,msg)=>()=>act(async()=>{const r=await api(`manifests/${m.id}/${path}`,{method:'POST'});if(r.missing?.length)toast(Lx.missingAtClose+' : '+r.missing.join(', '),'err');await loadBrd(m.id);},msg||Lx.saved);
  const actions=[];
  if(m.stage===0&&m.can_ship)actions.push([Lx.validate,step('validate')]);
  if(m.stage===1&&m.can_ship)actions.push([Lx.ship,step('ship')]);
  if(m.stage===2&&m.can_receive)actions.push([Lx.markArrived,step('arrive')]);
  if(m.stage===3&&m.can_receive)actions.push([Lx.closeBrd,step('close')]);
  const scanFor=action=>()=>openScanner(action,{manifest_id:m.id,onScan:()=>loadBrd(m.id)});
  // parcels that can be added: leaving this agency, heading to the destination agency, not on another active bordereau
  const pickable=m.can_compose?d.orders.filter(o=>o.origin_agency_id===m.origin_agency_id&&o.dest_agency_id===m.dest_agency_id&&['attente','en_agence'].includes(o.status)&&!items.some(i=>i.id===o.id)&&!d.manifests.some(x=>x.stage<4&&x.id!==m.id&&x.id===o.manifest_id)):[];
  const pick=state.brdPick||[];
  const togglePick=id=>()=>{state.brdPick=pick.includes(id)?pick.filter(x=>x!==id):[...pick,id];render();};
  const addPicked=()=>act(async()=>{const r=await api(`manifests/${m.id}/items`,{method:'POST',body:{order_ids:pick}});state.brdPick=[];if(r.errors.length)toast(r.errors.join(' · '),'err');await loadBrd(m.id);},Lx.saved);
  const remove=o=>()=>act(async()=>{await api(`manifests/${m.id}/items/${o.id}`,{method:'DELETE'});await loadBrd(m.id);},Lx.saved);
  const receive=o=>()=>act(async()=>{await api(`manifests/${m.id}/receive`,{method:'POST',body:{order_id:o.id}});await loadBrd(m.id);},Lx.saved);
  const ACT={'manifest.create':Lx.hCreate,'manifest.add':Lx.hAdd,'manifest.remove':Lx.hRemove,'manifest.validate':Lx.hValidate,'manifest.ship':Lx.hShip,'manifest.arrive':Lx.hArrive,'manifest.receive':Lx.hReceive,'manifest.close':Lx.hClose,'manifest.update':Lx.hUpdate};
  return `<div class="split" style="display:grid;grid-template-columns:minmax(260px,360px) minmax(0,1fr);gap:var(--gap)">
    ${list}
    <div style="min-width:0;${CARD};display:flex;flex-direction:column">
      <div style="padding:var(--pad);display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line)">
        <div style="display:flex;flex-direction:column;gap:4px"><span style="font-family:var(--mono);font-size:12px;color:var(--mute)">${esc(m.ref)}</span><b style="font-family:var(--disp);font-size:26px">${esc(m.origin_agency_name)} → ${esc(m.dest_agency_name)}</b></div>
        <div class="no-print" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <button ${on(()=>print())} style="${BTN_GHOST}">${esc(Lx.print)}</button>
          <button ${on(()=>exportManifestPdf(det))} style="${BTN_GHOST}">${esc(Lx.pdf)}</button>
          ${when(m.can_compose,()=>`<button ${on(scanFor('manifest_add'))} style="${BTN_GHOST}">📷 ${esc(Lx.addByScan)}</button>`)}
          ${when(m.can_ship&&[1,2].includes(m.stage),()=>`<button ${on(scanFor('ship'))} style="${BTN_GHOST}">📷 ${esc(Lx.loadByScan)}</button>`)}
          ${when(m.can_receive&&[2,3].includes(m.stage),()=>`<button ${on(scanFor('arrival'))} style="${BTN_GHOST}">📷 ${esc(Lx.receiveByScan)}</button>`)}
          ${each(actions,([l,fn])=>`<button ${on(fn)} style="${BTN_PRIMARY}">${spin()}${esc(l)}</button>`)}
        </div>
      </div>
      <div style="padding:var(--pad);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;border-bottom:1px solid var(--line)">
        ${each(BSTAGE,(x,j)=>`<div style="display:flex;flex-direction:column;gap:6px"><span style="height:6px;border-radius:3px;background:${j<=m.stage?'var(--orange)':'var(--surface2)'}"></span><span style="font-size:12px;font-weight:${j===m.stage?700:500};color:${j<=m.stage?'var(--ink)':'var(--mute)'}">${esc(x[li])}</span></div>`)}
      </div>
      <div style="padding:var(--pad);display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;border-bottom:1px solid var(--line)">
        ${each([[Lx.responsible,m.responsible||'—'],[Lx.carrier,m.carrier||'—'],[Lx.driverCarrier,m.driver_name||'—'],[Lx.count,String(totals.n)+' · '+totals.pieces+' '+Lx.piecesShort],[Lx.totalCod,fmt(totals.cod,u)],[Lx.date,dm(m.created_at)+' '+hm(m.created_at)]],([k2,v])=>`<div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:11.5px;color:var(--mute)">${esc(k2)}</span><b style="font-weight:600">${esc(v)}</b></div>`)}
      </div>
      ${when(missing.length,()=>`<div style="padding:10px var(--pad);background:var(--rb);color:var(--rf);font-weight:600">${esc(Lx.missingParcels)} (${missing.length}) : ${esc(missing.map(i=>i.ref).join(', '))}</div>`)}
      <div style="overflow-x:auto"><div style="min-width:620px">${items.length?each(items,c=>`
        <div style="display:grid;grid-template-columns:100px minmax(0,1fr) minmax(0,1fr) 110px 110px 90px;gap:12px;align-items:center;padding:10px var(--pad);border-bottom:1px solid var(--line);${m.stage>=3&&!c.received_at?'background:var(--rb)':''}">
          <span ${on(()=>selectOrder(c.id))} style="font-family:var(--mono);font-size:12px;cursor:pointer">${esc(c.ref)}</span><span>${esc(c.client_name)}</span><span style="color:var(--mute)">${esc([c.dest_city_name,c.zone_name].filter(Boolean).join(' · '))}</span>
          <span style="text-align:end;font-weight:600">${esc(fmt(c.cod,u))}</span><span><span style="${css(stB(c.status))}">${esc(stL(c.status))}</span></span>
          <span style="text-align:end">${m.can_compose?`<button ${on(remove(c))} title="${esc(Lx.remove)}" style="border:none;background:none;color:var(--rf);cursor:pointer;font-size:15px">✕</button>`
            :c.received_at?`<span style="color:var(--gf);font-weight:700">✓ ${esc(hm(c.received_at))}</span>`
            :m.can_receive&&[2,3].includes(m.stage)?`<button ${on(receive(c))} style="${BTN_GHOST};padding:4px 8px;font-size:12px">${esc(Lx.receiveOne)}</button>`:c.loaded_at?`<span style="color:var(--mute);font-size:12px">${esc(Lx.loaded)}</span>`:''}</span></div>`):empty(Lx.brdEmpty)}</div></div>
      ${when(m.can_compose,()=>`<div class="no-print" style="padding:var(--pad);border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>${esc(Lx.addParcels)} (${pickable.length})</b>${when(pick.length,()=>`<button ${on(addPicked)} style="${BTN_PRIMARY};padding:7px 12px">${spin()}+ ${pick.length}</button>`)}</div>
        ${pickable.length?`<div style="display:flex;flex-direction:column;max-height:240px;overflow:auto">${each(pickable,o=>`<label style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);cursor:pointer"><input type="checkbox" ${pick.includes(o.id)?'checked':''} ${on(togglePick(o.id))}><span style="font-family:var(--mono);font-size:12px">${esc(o.ref)}</span><span style="flex:1">${esc(o.client_name)}</span><span style="color:var(--mute);font-size:12px">${esc(destLabel(o))}</span></label>`)}</div>`:`<span style="color:var(--mute);font-size:12.5px">${esc(Lx.noPickable)}</span>`}
      </div>`)}
      <div style="padding:var(--pad);border-top:1px solid var(--line);display:flex;flex-direction:column;gap:6px">
        <b>${esc(Lx.brdHistory)}</b>
        ${det.history.length?each(det.history,h=>`<div style="display:grid;grid-template-columns:96px 1fr;gap:8px;font-size:12.5px"><span style="font-family:var(--mono);color:var(--mute)">${dm(h.created_at)} ${hm(h.created_at)}</span><span><b style="font-weight:600">${esc(ACT[h.action]||h.action)}</b>${(h.after?.order||h.before?.order)?' · '+esc(h.after?.order||h.before?.order):''}${h.after?.missing?.length?' · '+esc(Lx.missingParcels)+' : '+esc(h.after.missing.join(', ')):''} — ${esc(h.user_name||'Système')}</span></div>`):`<span style="color:var(--mute)">—</span>`}
      </div>
    </div>
  </div>`;
}

/* real PDF (jsPDF, generated in the browser) with totals and signature boxes */
async function exportManifestPdf(det){
  try{await loadLib('jspdf');}catch(e){return toast(e.message,'err');}
  const {jsPDF}=window.jspdf,m=det.manifest,items=det.items,u='TND';
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const W=210,M=14;let y=16;
  const ascii=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’‘]/g,"'").replace(/[→]/g,'->').replace(/[^\x20-\x7E]/g,'');
  doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('SADEN - Bordereau de transfert',M,y);
  doc.setFontSize(11);doc.text(ascii(m.ref),W-M,y,{align:'right'});y+=8;
  doc.setFont('helvetica','normal');doc.setFontSize(10);
  const info=[['Depart',m.origin_agency_name],['Destination',m.dest_agency_name],['Statut',BSTAGE[m.stage][0]],['Responsable',m.responsible||'-'],['Transporteur',m.carrier||'-'],['Livreur / chauffeur',m.driver_name||'-'],
    ['Cree le',new Date(m.created_at).toLocaleString('fr-FR')],['Valide le',m.validated_at?new Date(m.validated_at).toLocaleString('fr-FR'):'-'],['Expedie le',m.shipped_at?new Date(m.shipped_at).toLocaleString('fr-FR'):'-'],['Cloture le',m.closed_at?new Date(m.closed_at).toLocaleString('fr-FR'):'-']];
  info.forEach(([k,v],i)=>{const x=M+(i%2)*95,yy=y+Math.floor(i/2)*6;doc.setFont('helvetica','bold');doc.text(ascii(k)+' :',x,yy);doc.setFont('helvetica','normal');doc.text(ascii(v),x+34,yy);});
  y+=Math.ceil(info.length/2)*6+4;
  const cols=[['#',8],['Reference',28],['Destinataire',44],['Telephone',28],['Ville / zone',38],['COD',22],['Recu',14]];
  const head=()=>{doc.setFillColor(27,42,78);doc.rect(M,y-5,W-2*M,7,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');let x=M+1;cols.forEach(([t,w])=>{doc.text(t,x,y);x+=w;});doc.setTextColor(0);doc.setFont('helvetica','normal');y+=7;};
  head();
  items.forEach((it,i)=>{
    if(y>265){doc.addPage();y=18;head();}
    const row=[String(i+1),it.ref,it.client_name,fmtPhone(it.client_phone),[it.dest_city_name,it.zone_name].filter(Boolean).join(' / '),(+it.cod).toFixed(3),it.received_at?'oui':''];
    let x=M+1;row.forEach((v,j)=>{doc.text(ascii(v).slice(0,j===2?26:j===4?22:18),x,y);x+=cols[j][1];});
    doc.setDrawColor(220);doc.line(M,y+2,W-M,y+2);y+=7;
  });
  if(y>230){doc.addPage();y=20;}
  const cod=items.reduce((a,i)=>a+i.cod,0),pcs=items.reduce((a,i)=>a+(i.pieces||1),0);
  y+=3;doc.setFont('helvetica','bold');doc.text(`Total : ${items.length} colis - ${pcs} pieces - COD ${cod.toFixed(3)} ${u}`,M,y);y+=12;
  doc.setFont('helvetica','normal');
  ['Agence de depart','Transporteur','Agence de destination'].forEach((t,i)=>{const x=M+i*62;doc.rect(x,y,56,30);doc.text(t,x+2,y+5);doc.setFontSize(8);doc.text('Nom, date et signature',x+2,y+27);doc.setFontSize(10);});
  doc.save(`${m.ref}.pdf`);
}

Object.assign(K,{
  driverCarrier:['Chauffeur / livreur','السائق / الموزع'],brdHint2:['Le bordereau est créé en brouillon : ajoutez les colis par sélection ou par scan.','تنشأ البوليصة كمسودة: أضف الطرود بالاختيار أو بالمسح.'],
  received:['reçus','مستلمة'],validate:['Valider','تأكيد'],ship:['Expédier','شحن'],markArrived:['Marquer arrivé','تسجيل الوصول'],closeBrd:['Clôturer','إقفال'],
  addByScan:['Ajouter par scan','إضافة بالمسح'],loadByScan:['Chargement (scan)','التحميل (مسح)'],receiveByScan:['Réception (scan)','الاستلام (مسح)'],receiveOne:['Réceptionner','استلام'],loaded:['chargé','محمّل'],
  totalCod:['Total COD','مجموع المبالغ'],missingParcels:['Colis manquants','طرود ناقصة'],missingAtClose:['Clôturé avec colis manquants','أغلقت مع طرود ناقصة'],remove:['Retirer','حذف'],
  brdEmpty:['Aucun colis sur ce bordereau.','لا توجد طرود في هذه البوليصة.'],addParcels:['Ajouter des colis','إضافة طرود'],noPickable:['Aucun colis en attente pour cette destination.','لا توجد طرود منتظرة لهذه الوجهة.'],
  brdHistory:['Historique du bordereau','سجل البوليصة'],hCreate:['Création','إنشاء'],hAdd:['Colis ajouté','إضافة طرد'],hRemove:['Colis retiré','حذف طرد'],hValidate:['Validation','تأكيد'],hShip:['Expédition','شحن'],
  hArrive:['Arrivée','وصول'],hReceive:['Colis réceptionné','استلام طرد'],hClose:['Clôture','إقفال'],hUpdate:['Modification','تعديل'],
});

/* scanner actions related to bordereaux (§9): need a bordereau */
SCAN_ACTIONS.staff.splice(1,0,['manifest_add',['Ajout au bordereau','إضافة للبوليصة']],['ship',['Expédition (chargement)','الشحن']],['arrival',['Arrivée (agence destination)','الوصول']]);
const SCAN_STAGES={manifest_add:[0],ship:[1,2],arrival:[2,3]};
const baseOnScanSettings=onScanSettings;
onScanSettings=async function(){
  if(SCAN_STAGES[SC.action]){
    const ok=(state.data?.manifests||[]).filter(m=>SCAN_STAGES[SC.action].includes(m.stage));
    if(!ok.some(m=>m.id===+SC.manifest_id))SC.manifest_id=ok[0]?.id||'';
    SC.extraUi=()=>`<label class="slab">${esc(L().brd)}<select class="fld" data-sch="manifest_id">${ok.length?ok.map(m=>`<option value="${m.id}"${m.id===+SC.manifest_id?' selected':''}>${esc(m.ref)} · ${esc(bstL(m.stage))}</option>`).join(''):`<option value="">${esc(L().noBrd)}</option>`}</select></label>`;
  }else SC.extraUi=null;
  return baseOnScanSettings();
};
