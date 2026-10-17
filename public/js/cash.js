/* SADEN — « Caisse » (§22, §23): movements per agency, drivers' COD remittances, shop settlements, transfers. */

const cashAgencyId=()=>role()==='manager'?myAgency()?.id:(+state.cashAgency||+state.agencyFilter||homeAgency()?.id);
async function loadCash(){state.cashSum=await api('cash/summary?agency_id='+encodeURIComponent(cashAgencyId()||''));}

function tplCash(){
  const Lx=L(),u=Lx.tnd,li=lang()==='ar'?1:0,c=state.cashSum;
  if(!c||c.agency_id!==cashAgencyId()){if(!state._cashReq||state._cashReq!==cashAgencyId()){state._cashReq=cashAgencyId();loadCash().then(render).catch(e=>toast(e.message,'err'));}return `<div style="${CARD};padding:24px"><span class="spin"></span></div>`;}
  if(!state.cform.type)state.cform={label:'',type:'Encaissement',amount:''};
  const f=state.cform,tab=state.cashTab||'tx';
  const drivers=c.drivers,shops=c.shops;
  const add=()=>act(async()=>{await api('cash',{method:'POST',body:{...state.cform,agency_id:cashAgencyId()}});state.cform={label:'',type:state.cform.type,amount:''};await loadCash();},Lx.saved);
  const pickReceipt=e=>{const fl=e.target.files?.[0];if(!fl)return;if(fl.size>3e6)return toast(Lx.docTooBig,'err');const fr=new FileReader();fr.onload=()=>{state.cform={...state.cform,attachment:fr.result,attachmentName:fl.name};render();};fr.readAsDataURL(fl);};
  const prefill=o=>()=>{state.cform={...state.cform,...o};render();scrollTo(0,0);};
  const k=state.data.kpis,shopsToday=Math.max(0,k.remit_today),saden=k.saden_today,drv=k.drivers_today,tot=shopsToday+saden+drv||1;
  const parts=[[Lx.sClient,shopsToday,'var(--navy)'],[Lx.sSaden,saden,'var(--orange)'],[Lx.sDriver,drv,'oklch(0.7 0.1 150)']];
  const tabs=[['tx',Lx.movements],['drivers',Lx.driverRemits],['shops',Lx.shopSettlements],['closing',Lx.dayClosing]];
  const typeOpts=Object.keys(CASH_TYPES).map(t=>[t,li?CASH_TYPES[t][0]:t]);
  return `${when(role()==='admin',()=>`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span style="color:var(--mute)">${esc(Lx.agencyLbl)}</span><select class="fld" style="max-width:260px" ${onInput(e=>{state.cashAgency=e.target.value;state.cashSum=null;state._cashReq=null;render();},'cash-ag')}>${each(agencyOptions(),([v,l])=>`<option value="${v}"${v===cashAgencyId()?' selected':''}>${esc(l)}</option>`)}</select></div>`)}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:var(--gap)">
      ${kpiCard(Lx.income,fmt(c.income,u))}${kpiCard(Lx.expenses,fmt(c.expenses,u))}${kpiCard(Lx.balance,fmt(c.balance,u))}${kpiCard(Lx.toPay,fmt(c.to_pay_shops,u))}${kpiCard(Lx.sSaden+' · '+Lx.month,fmt(c.revenue.month,u),Lx.today2+' '+fmt(c.revenue.today,u))}
    </div>
    <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:12px">
      <b>${esc(Lx.split)}</b>
      <div style="display:flex;height:16px;border-radius:999px;overflow:hidden;gap:2px;background:var(--surface2)">${each(parts,p=>p[1]>0?`<span style="flex:${p[1]};background:${p[2]}"></span>`:'')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:22px">${each(parts,p=>`<span style="display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:3px;background:${p[2]}"></span>${esc(p[0])} <b>${Math.round(p[1]/tot*100)} %</b> <span style="color:var(--mute)">${esc(fmt(p[1],u))}</span></span>`)}</div>
    </div>
    <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px">
      <b>${esc(Lx.newMovement)}</b>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:8px;align-items:end">
        ${field(Lx.type,select('c-type','cform','type',typeOpts,true))}
        ${field(Lx.label,input('c-label','cform','label','placeholder="Versement COD — …"'))}
        ${field(Lx.amount+' ('+u+')',input('c-amt','cform','amount','inputmode="decimal" placeholder="0,000"'))}
        ${when(['Encaissement','Paiement livreur'].includes(f.type),()=>field(Lx.driver,select('c-drv','cform','driver_id',[['','—'],...drivers.map(d=>[d.id,d.name])])))}
        ${when(f.type==='Règlement',()=>field(Lx.colShop,select('c-shop','cform','shop_id',[['',Lx.choose],...shops.map(s=>[s.id,s.shop_name])])))}
        ${when(f.type==='Transfert',()=>field(Lx.toAgency,select('c-to','cform','counterpart_agency_id',[['',Lx.choose],...agencyOptions(a=>a.id!==cashAgencyId())])))}
        ${field(Lx.receiptK+' ('+Lx.optional+')',`<input class="fld" type="file" accept="image/*,application/pdf" ${onInput(pickReceipt,'c-file')}>`+(f.attachmentName?`<span style="font-size:11.5px;color:var(--gf)">✓ ${esc(f.attachmentName)}</span>`:''))}
        <button ${on(add)} style="${BTN_PRIMARY};min-height:42px">${spin()}+ ${esc(Lx.addMove)}</button>
      </div>
    </div>
    <div style="${CARD};overflow:hidden">
      <div style="display:flex;gap:4px;padding:var(--pad);flex-wrap:wrap">${each(tabs,([k2,l])=>`<button ${on(set({cashTab:k2}))} style="${css(chip(tab===k2))}">${esc(l)}</button>`)}</div>
      ${tab==='closing'?tplCashClosing():tab==='tx'?`<div style="overflow-x:auto"><div style="min-width:640px">${c.tx.length?each(c.tx,t=>`
        <div style="display:grid;grid-template-columns:56px minmax(0,1fr) 150px 140px;gap:12px;align-items:center;padding:10px var(--pad);border-top:1px solid var(--line)">
          <span style="font-family:var(--mono);font-size:12px;color:var(--mute)">${hm(t.created_at)}</span>
          <span style="display:flex;flex-direction:column;min-width:0"><span>${esc(t.label)}${t.has_attachment?` <button ${on(()=>openReceipt(t.id))} title="${esc(Lx.receiptK)}" style="background:none;border:none;cursor:pointer;padding:0">📎</button>`:''}</span><span style="font-size:12px;color:var(--mute)">${esc([t.driver_name,t.shop_name,t.counterpart_name&&('↔ '+t.counterpart_name),t.order_ref].filter(Boolean).join(' · '))}</span></span>
          <span><span style="${css(badge((CASH_TYPES[t.type]||[0,'n'])[1]))}">${esc(li?(CASH_TYPES[t.type]||[t.type])[0]:t.type)}</span></span>
          <span style="text-align:end;font-weight:700;color:${t.amount>0?'var(--gf)':'var(--ink)'}">${t.amount>0?'+':'−'}${esc(fmt(Math.abs(t.amount),u))}</span></div>`):empty()}</div></div>`
      :tab==='drivers'?`<div style="overflow-x:auto"><div style="min-width:640px">
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 110px 110px 110px auto;gap:10px;padding:8px var(--pad);font-size:11.5px;text-transform:uppercase;color:var(--mute);background:var(--surface2)"><span>${esc(Lx.driver)}</span><span style="text-align:end">${esc(Lx.codCollected)}</span><span style="text-align:end">${esc(Lx.remitted)}</span><span style="text-align:end">${esc(Lx.toRemitDriver)}</span><span></span></div>
        ${drivers.length?each(drivers,d=>`<div style="display:grid;grid-template-columns:minmax(0,1fr) 110px 110px 110px auto;gap:10px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line)">
          <span style="display:flex;flex-direction:column"><b style="font-weight:600">${esc(d.name)}</b><span style="font-size:12px;color:var(--mute)">${esc(Lx.driverEarned)} ${esc(fmt(d.earned,u))} · ${esc(Lx.toPayDriver)} ${esc(fmt(d.to_pay,u))}</span></span>
          <span style="text-align:end">${esc(fmt(d.collected))}</span><span style="text-align:end">${esc(fmt(d.remitted))}</span><b style="text-align:end;color:${d.to_remit>0?'var(--rf)':'var(--gf)'}">${esc(fmt(d.to_remit))}</b>
          <span style="display:flex;gap:4px;justify-content:flex-end">${when(d.to_remit>0,()=>`<button ${on(prefill({type:'Encaissement',driver_id:String(d.id),amount:String(d.to_remit),label:Lx.codRemitLabel+' — '+d.name}))} style="${BTN_GHOST};padding:5px 9px;font-size:12px">${esc(Lx.collectBtn)}</button>`)}${when(d.to_pay>0,()=>`<button ${on(prefill({type:'Paiement livreur',driver_id:String(d.id),amount:String(d.to_pay),label:Lx.driverPayLabel+' — '+d.name}))} style="${BTN_GHOST};padding:5px 9px;font-size:12px">${esc(Lx.payBtn)}</button>`)}</span></div>`):empty()}</div></div>`
      :`<div style="overflow-x:auto"><div style="min-width:600px">
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 120px 120px 120px auto;gap:10px;padding:8px var(--pad);font-size:11.5px;text-transform:uppercase;color:var(--mute);background:var(--surface2)"><span>${esc(Lx.colShop)}</span><span style="text-align:end">${esc(Lx.dueShop)}</span><span style="text-align:end">${esc(Lx.settled)}</span><span style="text-align:end">${esc(Lx.balanceShop)}</span><span></span></div>
        ${shops.length?each(shops,s=>`<div style="display:grid;grid-template-columns:minmax(0,1fr) 120px 120px 120px auto;gap:10px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line)">
          <span style="display:flex;flex-direction:column"><b style="font-weight:600">${esc(s.shop_name)}</b><span style="font-size:12px;color:var(--mute)">${s.delivered} ${esc(Lx.deliveredN)}</span></span>
          <span style="text-align:end">${esc(fmt(s.due))}</span><span style="text-align:end">${esc(fmt(s.settled))}</span><b style="text-align:end;color:${s.balance>0?'var(--of)':'var(--gf)'}">${esc(fmt(s.balance))}</b>
          <span>${when(s.balance>0,()=>`<button ${on(prefill({type:'Règlement',shop_id:String(s.id),amount:String(s.balance),label:Lx.settleLabel+' — '+s.shop_name}))} style="${BTN_GHOST};padding:5px 9px;font-size:12px">${esc(Lx.settleBtn)}</button>`)}</span></div>`):empty()}</div></div>`}
    </div>`;
}

/* ------------------------------------------------------------------ day closing (clôture de caisse) */
async function loadClosing(){const ag=cashAgencyId();const [d,h]=await Promise.all([api('cash/closing?agency_id='+ag),api('cash/closings?agency_id='+ag)]);state.closing={ag,d,h:h.closings};}
function tplCashClosing(){
  const Lx=L(),u=Lx.tnd,c=state.closing;
  if(!c||c.ag!==cashAgencyId()){if(state._clReq!==cashAgencyId()){state._clReq=cashAgencyId();loadClosing().then(render).catch(e=>toast(e.message,'err')).finally(()=>{state._clReq=null;});}return `<div style="padding:24px"><span class="spin"></span></div>`;}
  const d=c.d,f=state.clf||(state.clf={counted:'',note:''});
  const ST={conforme:['g',Lx.clConform],manque:['r',Lx.clShort],surplus:['w',Lx.clSurplus],rouverte:['n',Lx.clReopened]};
  const close=()=>act(async()=>{const r=await api('cash/closing',{method:'POST',body:{agency_id:cashAgencyId(),counted:state.clf.counted,note:state.clf.note}});state.clf={counted:'',note:''};await loadClosing();toast(Lx.dayClosed+' : '+ST[r.status][1]);},null);
  const reopen=k=>()=>askReason(Lx.reopenTitle,true,reason=>act(async()=>{await api(`cash/closings/${k.id}/reopen`,{method:'POST',body:{reason}});await loadClosing();},Lx.saved));
  // live gap, updated in place while typing (no re-render: number inputs lose the caret)
  const gapLine=v=>{const n=v===''||v==null?null:Number(String(v).replace(',','.'));const g=n==null||isNaN(n)?null:Math.round((n-d.theoretical)*1000)/1000;
    return `<span id="cl-gap" style="font-weight:700;min-height:1.2em;color:${g==null?'inherit':g===0?'var(--gf)':g<0?'var(--rf)':'var(--wf)'}">${g==null?'':esc(Lx.gapK+' : '+fmt(g,u)+' — '+(g===0?Lx.clConform:g<0?Lx.clShort:Lx.clSurplus))}</span>`;};
  const row=(l,v,b)=>`<div style="display:flex;justify-content:space-between;gap:8px;${b?'font-weight:700;font-size:15px':''}"><span>${esc(l)}</span><span>${esc(v)}</span></div>`;
  return `<div style="padding:var(--pad);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:var(--gap)" data-closing>
    <div style="display:flex;flex-direction:column;gap:6px">
      <b>${esc(Lx.dayK)} ${esc(d.day)}</b>
      ${row(Lx.openingBal,fmt(d.opening,u))}${row(Lx.income,'+ '+fmt(d.income,u))}${row(Lx.outflowK,'− '+fmt(d.outflow,u))}${row(Lx.theoreticalBal,fmt(d.theoretical,u),true)}
      <span style="font-size:12px;color:var(--mute)">${d.movements} ${esc(Lx.movementsLow)}</span>
    </div>
    ${d.closing?`<div style="display:flex;flex-direction:column;gap:6px"><b>${esc(Lx.dayClosed)}</b><span style="${css(badge(ST[d.closing.status][0]))};align-self:flex-start">${esc(ST[d.closing.status][1])}</span>
        ${row(Lx.countedK,fmt(d.closing.counted,u))}${row(Lx.gapK,fmt(d.closing.gap,u),true)}<span style="font-size:12.5px;color:var(--mute)">${esc(d.closing.note||'')}</span>
        <span style="font-size:12px;color:var(--mute)">${esc(Lx.closedNote)}</span></div>`
    :`<div style="display:flex;flex-direction:column;gap:8px">
        ${field(Lx.countedK+' ('+u+')',`<input class="fld" type="number" step="0.001" min="0" ${onInput(e=>{state.clf={...state.clf,counted:e.target.value};const el=document.getElementById('cl-gap');if(el)el.outerHTML=gapLine(e.target.value);},'cl-count')} value="${esc(f.counted)}">`)}
        ${gapLine(f.counted)}
        ${field(Lx.noteK+' ('+Lx.ifGap+')',`<input class="fld" ${onInput(e=>{state.clf={...state.clf,note:e.target.value};},'cl-note')} value="${esc(f.note)}">`)}
        <button ${on(close)} style="${BTN_PRIMARY}">${spin()}${esc(Lx.closeDay)}</button>
        <span style="font-size:12px;color:var(--mute)">${esc(Lx.closeHint)}</span></div>`}
    <div style="grid-column:1/-1;display:flex;flex-direction:column;gap:4px"><b>${esc(Lx.closingHistory)}</b>
      ${c.h.length?each(c.h,k=>`<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--line);font-size:12.5px">
        <b style="font-family:var(--mono)">${esc(k.day)}</b><span style="${css(badge(ST[k.status][0]))}">${esc(ST[k.status][1])}</span>
        <span>${esc(Lx.theoreticalBal)} ${esc(fmt(k.theoretical))} · ${esc(Lx.countedK)} ${esc(fmt(k.counted))} · <b>${esc(Lx.gapK)} ${esc(fmt(k.gap))}</b></span>
        <span style="color:var(--mute);flex:1;min-width:160px">${esc([k.note,k.closed_by_name,dtm(k.closed_at)].filter(Boolean).join(' · '))}${k.reopened_at?' — '+esc(Lx.clReopened+' : '+(k.reopen_reason||'')+' ('+(k.reopened_by_name||'')+')'):''}</span>
        ${role()==='admin'&&k.status!=='rouverte'?`<button ${on(reopen(k))} style="${BTN_GHOST};padding:4px 8px;font-size:12px">${esc(Lx.reopenK)}</button>`:''}</div>`):empty()}
    </div></div>`;
}
async function openReceipt(id){
  const w=window.open('','_blank');
  try{const d=await api(`cash/${id}/attachment`);if(!w)return toast(L().popupBlocked,'err');
    w.document.write(d.attachment.startsWith('data:application/pdf')?`<iframe src="${d.attachment}" style="border:0;width:100vw;height:100vh"></iframe>`:`<img src="${d.attachment}" style="max-width:100%">`);
  }catch(e){w?.close();toast(e.message,'err');}
}

Object.assign(K,{
  dayClosing:['Clôture du jour','إقفال اليوم'],dayK:['Journée du','يوم'],openingBal:['Solde d’ouverture','رصيد الافتتاح'],outflowK:['Sorties','المصاريف'],theoreticalBal:['Solde théorique','الرصيد النظري'],
  movementsLow:['mouvements','حركات'],countedK:['Compté en caisse','المعدود'],closeDay:['Clôturer la journée','إقفال اليوم'],dayClosed:['Journée clôturée','تم الإقفال'],
  closeHint:['Après la clôture, plus aucun mouvement ne peut être enregistré ce jour-là (réouverture par un administrateur, tracée).','بعد الإقفال لا يمكن تسجيل حركات.'],
  closedNote:['Les nouveaux mouvements du jour sont bloqués.','الحركات الجديدة ممنوعة.'],clConform:['Conforme','مطابق'],clShort:['Manque','نقص'],clSurplus:['Surplus','فائض'],clReopened:['Rouverte','أعيد فتحها'],
  closingHistory:['Historique des clôtures','سجل الإقفالات'],ifGap:['obligatoire si écart','إجباري عند الفارق'],reopenK:['Rouvrir','إعادة فتح'],reopenTitle:['Rouvrir la journée — motif','إعادة فتح اليوم — السبب'],receiptK:['Justificatif','وصل'],
  newMovement:['Nouveau mouvement','حركة جديدة'],toAgency:['Agence destinataire','الوكالة المستلمة'],month:['mois','الشهر'],today2:['aujourd’hui','اليوم'],
  driverRemits:['Remises livreurs','تسليم الموزعين'],shopSettlements:['Règlements boutiques','تسويات المتاجر'],codCollected:['COD encaissé','المحصل'],remitted:['Remis','المسلم'],
  toRemitDriver:['À remettre','للتسليم'],driverEarned:['Gains','المستحقات'],toPayDriver:['à payer','للدفع'],codRemitLabel:['Versement COD','تسليم المبالغ'],collectBtn:['Encaisser','تحصيل'],
  driverPayLabel:['Paiement livreur','خلاص موزع'],payBtn:['Payer','دفع'],dueShop:['Dû (livrés)','المستحق'],settled:['Réglé','المسدد'],balanceShop:['Reste à reverser','الباقي'],
  deliveredN:['colis livrés','طرود مسلمة'],settleLabel:['Règlement boutique','تسوية متجر'],settleBtn:['Régler','تسوية'],
});
