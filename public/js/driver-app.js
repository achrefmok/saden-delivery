/* SADEN — driver app shell (mobile first): bottom tabs Missions · Enlèvements · Scanner · Caisse · Historique,
   navigation (Google Maps / Waze), client contact (call, SMS, WhatsApp) with call outcome log, pickups at the
   shops confirmed by scan, parcels to bring back to the agency, cash held and history.
   The mission flow itself (detail → status → proof → done) stays in app.js (tplDriver) and is framed here. */

Object.assign(K,{
  dvMissions:['Missions','المهام'],dvPickups:['Enlèvements','الاستلامات'],dvScan:['Scanner','مسح'],dvCash:['Caisse','الخزينة'],dvHistory:['Historique','السجل'],
  dvDoneToday:['Livrés aujourd’hui','سُلّمت اليوم'],dvInHand:['Caisse en main','نقدية بحوزتك'],dvBack:['À rapporter à l’agence','للإرجاع إلى الوكالة'],dvBackHint:['Remettez ces colis au comptoir de l’agence.','سلّم هذه الطرود في الوكالة.'],
  dvWaze:['Waze','Waze'],dvMaps:['Itinéraire','المسار'],dvSms:['SMS','رسالة'],dvWa:['WhatsApp','واتساب'],dvPhone2:['2e numéro','رقم ثان'],dvLogCall:['Noter l’appel','تسجيل المكالمة'],
  dvCallTitle:['Résultat de l’appel','نتيجة المكالمة'],dvCallSaved:['Appel enregistré','تم تسجيل المكالمة'],dvNote:['Note (facultatif)','ملاحظة (اختياري)'],dvSave:['Enregistrer','حفظ'],
  dvShopCall:['Appeler la boutique','اتصال بالمتجر'],dvScanPickup:['Scanner les colis','مسح الطرود'],dvTake:['Pris','تم الأخذ'],dvCollected:['{a} / {b} enlevés','{a} / {b} مستلمة'],
  dvNoPickups:['Aucun enlèvement prévu.','لا توجد استلامات مبرمجة.'],dvPickupDone:['Enlèvement complet — rapportez les colis à l’agence.','اكتمل الاستلام — أرجع الطرود إلى الوكالة.'],
  dvCollectedTotal:['Encaissé (total)','المحصل (المجموع)'],dvRemitted:['Versé à l’agence','مسلم للوكالة'],dvToday:['Encaissé aujourd’hui','المحصل اليوم'],dvCollectedList:['Encaissements (30 jours)','التحصيلات (30 يوما)'],
  dvRemits:['Versements','الدفعات'],dvCashHint:['Remettez l’argent encaissé à l’agence en fin de journée. Le versement est saisi par l’agence.','سلّم المبالغ للوكالة في آخر اليوم.'],
  dvAll:['Tout','الكل'],dvOk:['Livrés','مسلمة'],dvKo:['Échecs','إخفاقات'],dvNoHistory:['Aucune activité sur la période.','لا يوجد نشاط.'],dvCod:['Encaissé','المحصل'],
  dvHello:['Bonne route','طريق سالمة'],
});

const DV_PROOF={otp:['Code','رمز'],photo:['Photo','صورة'],sign:['Signature','توقيع']};
const dvI=()=>lang()==='ar'?1:0;
const dvPhone=p=>String(p||'').replace(/\D/g,'').slice(-8);
const dvDest=o=>o.lat!=null&&o.lng!=null?`${o.lat},${o.lng}`:[o.address,o.zone_name,o.dest_city_name].filter(Boolean).join(', ');
const dvMaps=o=>`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dvDest(o))}`;
const dvWazeUrl=o=>o.lat!=null&&o.lng!=null?`https://waze.com/ul?ll=${o.lat},${o.lng}&navigate=yes`:`https://waze.com/ul?q=${encodeURIComponent(dvDest(o))}&navigate=yes`;
const dvBtn=(href,icon,label,extra='')=>`<a href="${esc(href)}" ${/^https/.test(href)?'target="_blank" rel="noopener"':''} style="min-height:52px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);text-decoration:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-weight:700;font-size:12px;box-shadow:var(--shadow);${extra}">${ico(icon,19)}${esc(label)}</a>`;

/* navigation + contact block of a mission (used in the mission detail) */
function dvContact(cm){
  const Lx=L(),ph=dvPhone(cm.client_phone),ph2=dvPhone(cm.client_phone2);
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${dvBtn(dvMaps(cm),'navigate',Lx.navigate,'background:var(--navy);color:#fff;border-color:transparent')}${dvBtn(dvWazeUrl(cm),'map',Lx.dvWaze)}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      ${dvBtn(telHref(cm.client_phone),'phone',Lx.call,'background:var(--gb);color:var(--gf);border-color:transparent')}${dvBtn('sms:+216'+ph,'message',Lx.dvSms)}${dvBtn('https://wa.me/216'+ph,'whatsapp',Lx.dvWa)}</div>
    ${when(ph2&&ph2!==ph,`<a href="${telHref(ph2)}" style="${BTN_GHOST};text-decoration:none">${ico('phone',16)}${esc(Lx.dvPhone2)} · ${esc(fmtPhone(ph2))}</a>`)}
    <button ${on(()=>{state.callSheet={id:cm.id,ref:cm.ref,outcome:'joint',note:''};render();})} data-logcall style="${BTN_GHOST}">${ico('pen',16)}${esc(Lx.dvLogCall)}</button>`;
}

function dvCallSheet(){
  const c=state.callSheet;if(!c)return '';
  const Lx=L(),outs=state.drv?.call_outcomes||{};
  const save=()=>act(async()=>{await api('driver/calls',{method:'POST',body:{order_id:c.id,outcome:c.outcome,note:c.note}});state.callSheet=null;},Lx.dvCallSaved);
  return `<div ${on(()=>{state.callSheet=null;render();})} style="position:fixed;inset:0;z-index:1400;background:oklch(0.1 0.03 262 / .5);display:flex;align-items:flex-end;justify-content:center">
    <div ${on(()=>{})} role="dialog" aria-modal="true" style="width:100%;max-width:520px;background:var(--surface);border-radius:22px 22px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;box-shadow:var(--shadow2)">
      <span style="align-self:center;width:42px;height:4px;border-radius:4px;background:var(--line)"></span>
      <b style="font-size:17px">${esc(Lx.dvCallTitle)} · <span style="font-family:var(--mono);font-size:14px">${esc(c.ref)}</span></b>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${each(Object.entries(outs),([k,l])=>`<button ${on(()=>{c.outcome=k;render();})} data-outcome="${k}" style="${css({...chip(c.outcome===k),borderRadius:12,minHeight:44,whiteSpace:'normal'})}">${esc(l)}</button>`)}</div>
      <textarea class="fld" rows="2" placeholder="${esc(Lx.dvNote)}" ${onInput(e=>{c.note=e.target.value;},'call-note')}>${esc(c.note)}</textarea>
      <button ${on(save)} data-savecall style="${BTN_PRIMARY};min-height:50px">${spin()}${esc(Lx.dvSave)}</button>
    </div></div>`;
}

/* parcels the driver must hand back to the agency (failed deliveries, returns) */
function tplDvBack(){
  const Lx=L(),b=state.drv?.back||[];if(!b.length)return '';
  return `<div style="padding:0 16px 16px"><div style="${CARD};padding:14px;display:flex;flex-direction:column;gap:8px;border-color:var(--wb)">
    <b style="display:flex;gap:8px;align-items:center;color:var(--wf)">${ico('undo',18)}${esc(Lx.dvBack)} <span style="${css(badge('w'))}">${b.length}</span></b>
    <span style="font-size:12px;color:var(--mute)">${esc(Lx.dvBackHint)}</span>
    ${each(b,o=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--line);font-size:13px"><span style="display:flex;flex-direction:column;min-width:0"><b style="font-family:var(--mono);font-size:12.5px">${esc(o.ref)}</b><span style="color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.client_name)}</span></span><span style="${css(stB(o.status))}">${esc(stL(o.status))}</span></div>`)}
  </div></div>`;
}

function tplDvPickups(){
  const Lx=L(),ps=state.drv?.pickups||[];
  const collect=(m,body)=>api(`driver/pickups/${m.id}/collect`,{method:'POST',body});
  const scan=m=>openScanner(null,{title:m.ref+' · '+(m.shop_name||''),handler:async ref=>{const r=await collect(m,{code:ref});refresh(true);return r;}});
  return `<div style="padding:16px;display:flex;flex-direction:column;gap:12px">
    <b style="font-size:20px;letter-spacing:-.01em">${esc(Lx.dvPickups)}</b>
    ${ps.length?each(ps,m=>{const items=m.items||[],n=items.filter(i=>i.collected).length;return `<div data-pickup="${m.id}" style="${CARD};padding:14px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:12px;align-items:center"><span style="width:44px;height:44px;border-radius:12px;background:var(--accentSoft);color:var(--of);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${ico('store',22)}</span>
        <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><b style="font-size:15.5px">${esc(m.shop_name||'—')}</b><span style="font-size:12.5px;color:var(--mute)">${esc(m.address||'—')}</span></span>${stageBadge({...m,type:'pickup'})}</div>
      <div style="display:flex;flex-direction:column;gap:5px"><div style="display:flex;justify-content:space-between;font-size:12.5px"><span style="font-family:var(--mono)">${esc(m.ref)}</span><b>${esc(flTxt(Lx.dvCollected,{a:n,b:items.length}))}</b></div>
        <span style="height:8px;border-radius:6px;background:var(--surface2);overflow:hidden"><span style="display:block;height:100%;width:${items.length?n/items.length*100:0}%;background:var(--gf);border-radius:6px"></span></span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${dvBtn(dvMaps(m),'navigate',Lx.dvMaps)}${dvBtn(telHref(m.shop_phone),'phone',Lx.dvShopCall)}</div>
      ${m.stage===1?`<button ${on(()=>scan(m))} data-scanpickup style="${BTN_PRIMARY};min-height:50px">${ico('scan',19)}${esc(Lx.dvScanPickup)}</button>`:`<div style="padding:10px 12px;border-radius:12px;background:var(--gb);color:var(--gf);font-weight:600;font-size:13px;display:flex;gap:8px;align-items:center">${ico('checkCircle',17)}${esc(Lx.dvPickupDone)}</div>`}
      <div style="display:flex;flex-direction:column">${each(items,i=>`<div style="display:flex;gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--line)">
        <span style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:${i.collected?'var(--gb)':'var(--surface2)'};color:var(--gf)">${i.collected?ico('check',14):''}</span>
        <span style="flex:1;min-width:0;display:flex;flex-direction:column"><b style="font-family:var(--mono);font-size:12.5px">${esc(i.ref)}</b><span style="font-size:12px;color:var(--mute)">${esc(i.client_name)}</span></span>
        ${i.collected?`<span style="${css(badge('g'))}">${esc(Lx.dvTake)}</span>`:m.stage===1?`<button ${on(()=>act(()=>collect(m,{order_id:i.id}).then(r=>toast(r.message))))} data-take="${esc(i.ref)}" style="${BTN_GHOST};min-height:36px;padding:6px 12px">${ico('check',15)}${esc(Lx.dvTake)}</button>`:''}</div>`)}</div>
    </div>`;}):`<div style="${CARD}">${emptyState(Lx.dvNoPickups)}</div>`}
  </div>`;
}

function dvLazy(key,url,store){
  if(state[store]||state._dvReq===key)return;
  state._dvReq=key;api(url).then(d=>{state[store]=d;}).catch(e=>toast(e.message,'err')).finally(()=>{state._dvReq=null;render();});
}
function tplDvCash(){
  const Lx=L(),u=Lx.tnd,c=state.drv?.cash||{};dvLazy('cash','driver/cash','dvCashD');const d=state.dvCashD;
  return `<div style="padding:16px;display:flex;flex-direction:column;gap:12px">
    <div style="border-radius:20px;padding:18px;background:linear-gradient(135deg,var(--orange),var(--orange2));color:#fff;display:flex;flex-direction:column;gap:4px;box-shadow:0 10px 28px oklch(0.7 0.18 47 / .3)">
      <span style="font-size:12.5px;opacity:.9;display:flex;gap:6px;align-items:center">${ico('wallet',16)}${esc(Lx.dvInHand)}</span><b data-inhand style="font-size:34px;letter-spacing:-.02em">${esc(fmt(c.to_remit))} <span style="font-size:15px">${esc(u)}</span></b>
      <span style="font-size:12px;opacity:.9">${esc(Lx.dvToday)} : ${esc(fmt(c.collected_today,u))}</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${kpiCard(Lx.dvCollectedTotal,fmt(c.collected_total),u,'cash','o')}${kpiCard(Lx.dvRemitted,fmt(c.remitted_total),u,'checkCircle','g')}</div>
    <span style="font-size:12px;color:var(--mute);display:flex;gap:6px">${ico('shield',14)}${esc(Lx.dvCashHint)}</span>
    ${!d?`<div style="${CARD};padding:24px;text-align:center"><span class="spin"></span></div>`:`
    <div style="${CARD};overflow:hidden"><b style="display:block;padding:12px 14px;border-bottom:1px solid var(--line)">${esc(Lx.dvRemits)}</b>
      ${d.remits.length?each(d.remits,r=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);font-size:13px"><span style="display:flex;flex-direction:column"><b>${esc(r.label||'—')}</b><span style="font-size:11.5px;color:var(--mute)">${esc(dtm(r.created_at)+(r.by_name?' · '+r.by_name:''))}</span></span><b style="color:var(--gf)">${esc(fmt(r.amount))}</b></div>`):emptyState()}</div>
    <div style="${CARD};overflow:hidden"><b style="display:block;padding:12px 14px;border-bottom:1px solid var(--line)">${esc(Lx.dvCollectedList)}</b>
      ${d.collected.length?each(d.collected,r=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);font-size:13px"><span style="display:flex;flex-direction:column;min-width:0"><b style="font-family:var(--mono);font-size:12.5px">${esc(r.ref)}</b><span style="font-size:11.5px;color:var(--mute)">${esc(r.client_name+' · '+dtm(r.created_at))}</span></span><b>${esc(fmt(r.cod))}</b></div>`):emptyState()}</div>`}
  </div>`;
}
function tplDvHistory(){
  const Lx=L(),h=state.dvH||(state.dvH={kind:'all'}),li=dvI();
  dvLazy('hist'+h.kind,'driver/history'+(h.kind==='all'?'':'?kind='+h.kind),'dvHist');const d=state.dvHist;
  const days={};(d?.rows||[]).forEach(r=>{const k=dm(r.created_at);(days[k]=days[k]||[]).push(r);});
  return `<div style="padding:16px;display:flex;flex-direction:column;gap:12px">
    <b style="font-size:20px;letter-spacing:-.01em">${esc(Lx.dvHistory)}</b>
    <div style="display:flex;gap:6px">${each([['all',Lx.dvAll],['delivered',Lx.dvOk],['failed',Lx.dvKo]],([k,l])=>`<button ${on(()=>{h.kind=k;state.dvHist=null;render();})} data-hkind="${k}" style="${css(chip(h.kind===k))}">${esc(l)}</button>`)}</div>
    ${!d?`<div style="${CARD};padding:24px;text-align:center"><span class="spin"></span></div>`:`
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${each([[d.totals.delivered,Lx.dvOk,'g'],[d.totals.failed,Lx.dvKo,'r'],[fmt(d.totals.cod),Lx.dvCod,'o']],([v,l,t])=>`<div style="${CARD};padding:12px;display:flex;flex-direction:column;gap:2px"><b style="font-size:19px;color:var(--${t}f)">${esc(v)}</b><span style="font-size:11.5px;color:var(--mute)">${esc(l)}</span></div>`)}</div>
    ${d.rows.length?each(Object.entries(days),([day,rows])=>`<div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:12px;font-weight:700;color:var(--mute);text-transform:uppercase;letter-spacing:.06em">${esc(day)}</span>
      <div style="${CARD};overflow:hidden">${each(rows,r=>`<div style="display:flex;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)">
        <span style="width:32px;height:32px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--${r.status==='livre'?'g':'r'}b);color:var(--${r.status==='livre'?'g':'r'}f)">${ico(r.status==='livre'?'check':'x',16)}</span>
        <span style="flex:1;min-width:0;display:flex;flex-direction:column"><span style="font-size:13px"><b style="font-family:var(--mono);font-size:12.5px">${esc(r.ref)}</b> · ${esc(r.client_name)}</span><span style="font-size:11.5px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(stL(r.status)+(r.proof_type&&DV_PROOF[r.proof_type]?' · '+DV_PROOF[r.proof_type][li]:'')+(r.note?' · '+r.note:''))}</span></span>
        <span style="display:flex;flex-direction:column;align-items:flex-end"><b style="font-size:12.5px">${r.status==='livre'&&r.payment_mode!=='prepaid'?esc(fmt(r.cod)):''}</b><span style="font-size:11px;color:var(--mute)">${esc(hm(r.created_at))}</span></span></div>`)}</div></div>`):`<div style="${CARD}">${emptyState(Lx.dvNoHistory)}</div>`}`}
  </div>`;
}

/* frame: content of the current tab + bottom tab bar (hidden while proving a delivery) */
function driverShell(screen,lv){
  const Lx=L(),tab=state.dvTab||'missions',home=lv==='home',dv=state.drv||{};
  let content=screen;
  if(home)content=tab==='pickups'?tplDvPickups():tab==='cash'?tplDvCash():tab==='history'?tplDvHistory():screen+tplDvBack();
  const go=k=>()=>{if(k==='scan')return openScanner('delivery');state.dvTab=k;state.lv='home';state.curId=null;state.dvCashD=null;state.dvHist=null;render();window.scrollTo(0,0);};
  const nP=(dv.pickups||[]).filter(m=>m.stage===1).length;
  const bar=lv==='proof'?'':`<nav class="no-print" aria-label="${esc(Lx.dvMissions)}" style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:520px;z-index:900;background:var(--surface);border-top:1px solid var(--line);box-shadow:0 -6px 24px oklch(0.2 0.03 265 / .08);display:grid;grid-template-columns:repeat(5,1fr);padding:6px 6px calc(6px + env(safe-area-inset-bottom))">
    ${each([['missions','list',Lx.dvMissions],['pickups','store',Lx.dvPickups],['scan','scan',Lx.dvScan],['cash','wallet',Lx.dvCash],['history','clock',Lx.dvHistory]],([k,i,l])=>k==='scan'
      ?`<button ${on(go(k))} data-dvtab="scan" aria-label="${esc(l)}" style="border:none;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;color:var(--ink);font-size:10.5px;font-weight:700;margin-top:-22px"><span style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--orange),var(--orange2));color:#fff;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 8px 20px oklch(0.7 0.18 47 / .4);border:4px solid var(--surface)">${ico(i,24)}</span>${esc(l)}</button>`
      :`<button ${on(go(k))} data-dvtab="${k}" style="border:none;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;color:${home&&tab===k?'var(--of)':'var(--mute)'};font-size:10.5px;font-weight:${home&&tab===k?800:600};position:relative">${ico(i,22)}${esc(l)}${k==='pickups'&&nP?`<span style="position:absolute;top:2px;inset-inline-end:22%;background:var(--orange);color:#fff;border-radius:999px;font-size:10px;padding:0 5px;font-weight:800">${nP}</span>`:''}</button>`)}
  </nav>`;
  return `<main style="flex:1;display:flex;justify-content:center"><div style="width:100%;max-width:520px;display:flex;flex-direction:column;background:var(--bg);border-inline:1px solid var(--line);padding-bottom:${bar?'calc(84px + env(safe-area-inset-bottom))':'env(safe-area-inset-bottom)'}">${content}</div>${bar}${dvCallSheet()}</main>`;
}
