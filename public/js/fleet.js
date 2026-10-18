/* SADEN — « Livreurs » page of the agency manager (and admin, per agency): live team, performance table,
   bulk assignment board, driver profile (overview, missions, pickups, history, cash, reviews), messages.
   Built on /api/fleet/*. The former driver cards stay available as the « Avis » view. */

Object.assign(K,{
  flTeam:['Équipe','الفريق'],flPerf:['Performance','الأداء'],flAssign:['Affectation','الإسناد'],flReviewsTab:['Avis clients','آراء الحرفاء'],
  flActive:['Livreurs actifs','الموزعون النشطون'],flOnDuty:['En service','في الخدمة'],flInHand:['Colis en main','طرود بحوزتهم'],flDeliveredToday:['Livrés aujourd’hui','سُلّمت اليوم'],
  flFailedToday:['Échecs aujourd’hui','إخفاقات اليوم'],flToRemit:['Caisse à reverser','مبالغ للإرجاع'],flDays:['Période','الفترة'],flDaysN:['{n} j','{n} يوم'],
  flCol:['Livreur','الموزع'],flHandled:['Colis traités','طرود معالجة'],flDelivered:['Livrés','مسلمة'],flFailed:['Échecs','إخفاقات'],flSuccess:['Taux de réussite','نسبة النجاح'],
  flFirst:['1er passage','من أول مرة'],flRoute:['Durée moy.','المدة المتوسطة'],flCod:['Encaissé (période)','المحصل (الفترة)'],flProblems:['Problèmes','مشاكل'],flCalls:['Appels','مكالمات'],
  flRating:['Note','التقييم'],flClaims:['Réclamations','شكاوى'],flMin:['min','د'],flSeen:['Vu','آخر ظهور'],flBattery:['Batterie','البطارية'],
  flProfile:['Fiche','البطاقة'],flMessage:['Message','رسالة'],flCall:['Appeler','اتصال'],flMsgTitle:['Message au livreur','رسالة إلى الموزع'],flMsgSent:['Message envoyé','تم إرسال الرسالة'],
  flBack:['Tous les livreurs','كل الموزعين'],flOverview:['Aperçu','نظرة عامة'],flMissions:['Missions','المهام'],flPickups:['Enlèvements','الاستلامات'],flHistory:['Historique','السجل'],flCash:['Caisse','الخزينة'],
  flDaily:['Activité des 30 derniers jours','نشاط آخر 30 يوما'],flNoData:['Aucune donnée sur la période','لا توجد بيانات'],flUnassign:['Retirer au livreur','سحب من الموزع'],flUnassignQ:['Motif (facultatif)','السبب (اختياري)'],
  flSelectAll:['Tout sélectionner','تحديد الكل'],flNone:['Aucun','لا شيء'],flSelected:['{n} sélectionné(s)','{n} محدد'],flToAssign:['Colis à affecter','طرود للإسناد'],flPickDriver:['Choisir le livreur','اختر الموزع'],
  flAssignBtn:['Affecter {n} colis à {d}','إسناد {n} طرد إلى {d}'],flAssigned:['{n} colis affecté(s)','تم إسناد {n} طرد'],flUnassigned:['{n} colis retiré(s) au livreur','تم سحب {n} طرد'],flRefused:['{n} refusé(s)','{n} مرفوض'],flAllZones:['Toutes les zones','كل المناطق'],
  flSearch:['Réf., client, adresse…','مرجع، حريف، عنوان…'],flLoad:['{n} en cours','{n} جارية'],flCollected:['Encaissé total','مجموع المحصل'],flRemitted:['Versé à l’agence','مسلم للوكالة'],
  flRemits:['Versements','الدفعات'],flGoCash:['Ouvrir la caisse','فتح الخزينة'],flNoAssign:['Aucun colis en attente de livreur.','لا توجد طرود في انتظار موزع.'],flOnlyAffecte:['Seuls les colis « affecté » non commencés peuvent être retirés.','يمكن سحب الطرود غير المبدوءة فقط.'],
  flEmptyTeam:['Aucun livreur dans cette agence.','لا يوجد موزعون في هذه الوكالة.'],flBy:['par','بواسطة'],flOpen:['Ouvrir','فتح'],flLegendOk:['Livrés','مسلمة'],flLegendKo:['Échecs','إخفاقات'],
  flTeamLead:['Suivez votre équipe en temps réel : statut, colis en main, encaissements.','تابع فريقك مباشرة: الحالة، الطرود، المبالغ.'],
});

const flQ=extra=>{const qs=new URLSearchParams(extra||{});if(role()==='admin'&&state.agencyFilter)qs.set('agency_id',state.agencyFilter);return qs.toString();};
const flS=()=>state.fl||(state.fl={tab:'team',days:30,sort:{k:'delivered',dir:-1},sel:[],driver:null,dtab:'overview',zone:'',text:'',pick:null,msel:[]});
const flTxt=(s,v)=>Object.entries(v||{}).reduce((a,[k,x])=>a.replace('{'+k+'}',x),s);
const pct=v=>v==null?'—':String(v).replace('.',',')+' %';
async function flLoad(){
  const f=flS();
  if(f.driver){state.flDet=await api(`fleet/drivers/${f.driver}?`+flQ({days:f.days}));return;}
  if(f.tab==='assign'){const [u,d]=await Promise.all([api('fleet/unassigned?'+flQ()),api('fleet/drivers?'+flQ({days:f.days}))]);state.flUn=u;state.flData=d;return;}
  state.flData=await api('fleet/drivers?'+flQ({days:f.days}));
}
const flReload=()=>{state.flData=null;state.flUn=null;state.flDet=null;render();flLoad().then(render).catch(e=>toast(e.message,'err'));};
const flGo=patch=>{Object.assign(flS(),patch);flReload();};
const flAct=(fn,msg)=>act(async()=>{await fn();state.flData=null;state.flUn=null;state.flDet=null;},msg);
const flMessage=d=>askReason(L().flMsgTitle+' — '+d.name,true,text=>flAct(()=>api(`fleet/drivers/${d.id}/message`,{method:'POST',body:{text}}),L().flMsgSent));
const avatar=(name,size=44,tone='navy')=>`<span style="width:${size}px;height:${size}px;border-radius:50%;background:${tone==='navy'?'linear-gradient(135deg,var(--navy2),var(--navy))':'var(--accentSoft)'};color:${tone==='navy'?'#fff':'var(--of)'};display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:${Math.round(size*.34)}px;flex-shrink:0">${esc(initials(name))}</span>`;
const dsBadge=d=>{const s=d.active?(DS[d.status]||DS.off):null;return `<span style="${css(badge(s?s[2]:'n'))}"><span style="width:7px;height:7px;border-radius:50%;background:currentColor"></span>${esc(s?s[lang()==='ar'?1:0]:L().inactive)}</span>`;};

/* generic sortable table: cols = [{k, label, fmt(row), num, w}] ; click a header to sort */
function sortTable(id,cols,rows,{sort,onSort,onRow,minW=760}={}){
  const s=sort||{};
  const sorted=s.k?[...rows].sort((a,b)=>{const x=a[s.k],y=b[s.k];if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (typeof x==='string'?x.localeCompare(y,'fr'):x-y)*s.dir;}):rows;
  const grid=cols.map(c=>c.w||(c.num?'minmax(78px,1fr)':'minmax(0,1.8fr)')).join(' ');
  return `<div style="overflow-x:auto" data-table="${id}"><div style="min-width:${minW}px">
    <div style="display:grid;grid-template-columns:${grid};gap:10px;padding:10px 16px;font-size:11.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--mute);border-bottom:1px solid var(--line);background:var(--surface2)">
      ${each(cols,c=>`<button ${on(()=>onSort&&onSort({k:c.k,dir:s.k===c.k?-s.dir:(c.num?-1:1)}))} data-sort="${c.k}" style="all:unset;cursor:pointer;display:flex;gap:4px;align-items:center;${c.num?'justify-content:flex-end;text-align:end':''}">${esc(c.label)}${s.k===c.k?`<span style="color:var(--of)">${s.dir>0?'▲':'▼'}</span>`:''}</button>`)}</div>
    ${sorted.length?each(sorted,r=>`<div class="trow" ${onRow?on(()=>onRow(r)):''} style="display:grid;grid-template-columns:${grid};gap:10px;padding:11px 16px;border-bottom:1px solid var(--line);align-items:center;font-size:13px;${onRow?'cursor:pointer':''}">
      ${each(cols,c=>`<span style="min-width:0;${c.num?'text-align:end;font-variant-numeric:tabular-nums':''}">${c.fmt?c.fmt(r):esc(r[c.k]??'—')}</span>`)}</div>`):empty()}
  </div></div>`;
}
/* rate as a thin bar + value */
const rateBar=(v,tone='g')=>v==null?'<span style="color:var(--mute)">—</span>':`<span style="display:inline-flex;align-items:center;gap:8px;justify-content:flex-end;width:100%"><span style="flex:1;max-width:70px;height:6px;border-radius:4px;background:var(--surface2);overflow:hidden"><span style="display:block;height:100%;width:${Math.min(100,v)}%;background:var(--${tone}f);border-radius:4px"></span></span><b style="font-weight:700">${esc(pct(v))}</b></span>`;

function tplFleet(){
  const Lx=L(),f=flS();
  const need=f.driver?!state.flDet:f.tab==='assign'?!(state.flUn&&state.flData):f.tab==='reviews'?false:!state.flData;
  const key=JSON.stringify([f.driver,f.tab,f.days,state.agencyFilter]);
  if(need&&state._flReq!==key){state._flReq=key;flLoad().catch(e=>toast(e.message,'err')).finally(()=>{state._flReq=null;render();});}
  if(f.driver)return tplFleetDriver();
  const tabs=`<div class="no-print" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
    ${each([['team',Lx.flTeam,'users'],['perf',Lx.flPerf,'trend'],['assign',Lx.flAssign,'route'],['reviews',Lx.flReviewsTab,'star']],([k,l,i])=>`<button ${on(()=>flGo({tab:k,sel:[]}))} data-fltab="${k}" style="${css({...chip(f.tab===k),display:'inline-flex',alignItems:'center',gap:7})}">${ico(i,15)}${esc(l)}</button>`)}
    <span style="flex:1"></span>
    ${when(f.tab==='perf'||f.tab==='team',`<div style="display:flex;gap:4px;align-items:center;font-size:12.5px;color:var(--mute)">${ico('calendar',15)} ${each([7,30,90],n=>`<button ${on(()=>flGo({days:n}))} style="${css({...chip(f.days===n),padding:'5px 11px',fontSize:12})}">${esc(flTxt(Lx.flDaysN,{n}))}</button>`)}</div>`)}
  </div>`;
  if(f.tab==='reviews')return tabs+tplDriverCards();
  const spin_=`<div style="${CARD};padding:28px;display:flex;justify-content:center"><span class="spin"></span></div>`;
  if(f.tab==='assign')return tabs+(state.flUn&&state.flData?tplFleetAssign():spin_);
  const fd=state.flData;if(!fd)return tabs+spin_;
  const t=fd.totals,u=Lx.tnd;
  const kpis=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:var(--gap)">
    ${kpiCard(Lx.flActive,String(t.drivers),flTxt(Lx.flOnDuty)+' : '+t.on_duty,'users','i')}${kpiCard(Lx.flInHand,String(t.in_hand),null,'box','o')}
    ${kpiCard(Lx.flDeliveredToday,String(t.today_delivered),Lx.flFailedToday+' : '+t.today_failed,'checkCircle','g')}${kpiCard(Lx.flToRemit,fmt(t.to_remit),u,'wallet','w')}</div>`;
  if(f.tab==='perf'){
    const cols=[{k:'name',label:Lx.flCol,fmt:d=>`<span style="display:flex;gap:10px;align-items:center">${avatar(d.name,32)}<span style="display:flex;flex-direction:column;min-width:0"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</b><span style="font-size:11.5px;color:var(--mute)">${esc(d.zone_name||'—')}</span></span></span>`,w:'minmax(180px,2fr)'},
      {k:'assigned',label:Lx.flHandled,num:1},{k:'delivered',label:Lx.flDelivered,num:1,fmt:d=>`<b>${d.delivered}</b>`},{k:'failed',label:Lx.flFailed,num:1,fmt:d=>d.failed?`<span style="color:var(--rf);font-weight:700">${d.failed}</span>`:'0'},
      {k:'success_rate',label:Lx.flSuccess,num:1,fmt:d=>rateBar(d.success_rate),w:'minmax(130px,1.3fr)'},{k:'first_pass_rate',label:Lx.flFirst,num:1,fmt:d=>rateBar(d.first_pass_rate,'i'),w:'minmax(130px,1.3fr)'},
      {k:'avg_route_min',label:Lx.flRoute,num:1,fmt:d=>d.avg_route_min==null?'—':esc(d.avg_route_min+' '+Lx.flMin)},{k:'cod_period',label:Lx.flCod,num:1,fmt:d=>esc(fmt(d.cod_period))},
      {k:'problems',label:Lx.flProblems,num:1},{k:'calls',label:Lx.flCalls,num:1},{k:'rating',label:Lx.flRating,num:1,fmt:d=>d.rating==null?'—':`<span style="color:var(--orange)">★</span> ${esc(String(d.rating).replace('.',','))}`},{k:'claims',label:Lx.flClaims,num:1}];
    return tabs+kpis+`<div style="${CARD};overflow:hidden">${sortTable('perf',cols,fd.drivers,{sort:f.sort,onSort:s=>{f.sort=s;render();},onRow:d=>flGo({driver:d.id,dtab:'overview'}),minW:1240})}</div>`;
  }
  // team: live cards
  const banner=`<div style="${CARD};padding:16px 20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;background:linear-gradient(120deg,var(--surface),var(--accentSoft))">
    <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:4px"><b style="font-size:17px">${esc(Lx.flTeam)} · ${esc(scopeName())}</b><span style="color:var(--mute);font-size:13px">${esc(Lx.flTeamLead)}</span></div>
    <div class="hide-sm hero-illu" style="width:240px">${illu('fleet')}</div></div>`;
  if(!fd.drivers.length)return tabs+banner+`<div style="${CARD}">${emptyState(Lx.flEmptyTeam)}</div>`;
  return tabs+banner+kpis+`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:var(--gap)">
    ${each(fd.drivers,d=>`<div class="lift" data-driver="${d.id}" style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:14px;${d.active?'':'opacity:.55'}">
      <div style="display:flex;gap:12px;align-items:center">${avatar(d.name)}
        <div style="flex:1;display:flex;flex-direction:column;gap:3px;min-width:0"><b style="font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</b>
          <span style="font-size:12px;color:var(--mute);display:flex;gap:8px;flex-wrap:wrap"><span>${ico('pin',13)} ${esc(d.zone_name||'—')}</span>${d.battery!=null?`<span style="color:${d.battery<25?'var(--rf)':'inherit'}">${ico('battery',13)} ${d.battery} %</span>`:''}<span>${ico('clock',13)} ${esc(ago(d.last_seen))}</span></span></div>
        ${dsBadge(d)}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center">
        ${each([[d.active_count,Lx.flMissions,'ink'],[d.today_delivered,Lx.flDelivered,'gf'],[d.today_failed,Lx.flFailed,d.today_failed?'rf':'ink'],[d.in_hand,Lx.flInHand,'ink']],([v,l,c])=>`<div style="padding:8px 4px;border-radius:10px;background:var(--surface2);display:flex;flex-direction:column;gap:2px"><b style="font-size:19px;color:var(--${c})">${v}</b><span style="font-size:10.5px;color:var(--mute);line-height:1.2">${esc(l)}</span></div>`)}</div>
      <div style="display:flex;flex-direction:column;gap:6px;font-size:12.5px">
        <div style="display:flex;justify-content:space-between;gap:8px"><span style="color:var(--mute)">${esc(Lx.flSuccess)} (${esc(flTxt(Lx.flDaysN,{n:f.days}))})</span>${rateBar(d.success_rate)}</div>
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span style="color:var(--mute)">${esc(Lx.flToRemit)}</span><b style="color:${d.to_remit>0?'var(--of)':'inherit'}">${esc(fmt(d.to_remit,Lx.tnd))}</b></div></div>
      <div style="display:flex;gap:6px">
        <button ${on(()=>flGo({driver:d.id,dtab:'overview'}))} style="${BTN_PRIMARY};flex:1;min-height:38px;padding:7px 10px">${ico('user',15)}${esc(Lx.flProfile)}</button>
        <a href="${telHref(d.phone)}" title="${esc(Lx.flCall)}" style="${BTN_GHOST};min-height:38px;padding:7px 10px;text-decoration:none">${ico('phone',15)}</a>
        <button ${on(()=>flMessage(d))} title="${esc(Lx.flMessage)}" style="${BTN_GHOST};min-height:38px;padding:7px 10px">${ico('message',15)}</button></div>
    </div>`)}</div>`;
}

/* bulk assignment board: parcels waiting for a driver on the left, drivers with their load on the right */
function tplFleetAssign(){
  const Lx=L(),f=flS(),un=state.flUn.parcels,drivers=state.flData.drivers.filter(d=>d.active);
  const zones=[...new Set(un.map(p=>p.zone_name).filter(Boolean))].sort();
  const tx=(f.text||'').trim().toLowerCase();
  const list=un.filter(p=>(!f.zone||p.zone_name===f.zone)&&(!tx||[p.ref,p.client_name,p.address,p.client_phone,p.shop_name].some(v=>String(v||'').toLowerCase().includes(tx))));
  const sel=new Set(f.sel),allOn=list.length&&list.every(p=>sel.has(p.id));
  const toggle=id=>()=>{sel.has(id)?sel.delete(id):sel.add(id);f.sel=[...sel];render();};
  const pick=drivers.find(d=>d.id===f.pick);
  const assign=()=>flAct(async()=>{const r=await api('fleet/assign',{method:'POST',body:{order_ids:f.sel,driver_id:f.pick}});
    toast(flTxt(Lx.flAssigned,{n:r.done.length})+(r.errors.length?' · '+flTxt(Lx.flRefused,{n:r.errors.length})+' : '+r.errors.slice(0,2).join(' ; '):''),r.errors.length?'err':undefined);f.sel=[];});
  const tbox=on=>`<span style="width:18px;height:18px;border-radius:5px;border:1.5px solid ${on?'var(--orange)':'var(--line)'};background:${on?'var(--orange)':'var(--surface)'};color:#fff;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${on?ico('check',13):''}</span>`;
  return `<div class="split" style="display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,1fr);gap:var(--gap);align-items:start">
    <div style="${CARD};overflow:hidden;display:flex;flex-direction:column">
      <div style="padding:14px var(--pad);display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line)">
        <b style="font-size:15px;display:flex;gap:8px;align-items:center">${ico('boxes',18)}${esc(Lx.flToAssign)} <span style="${css(badge('o'))}">${un.length}</span></b><span style="flex:1"></span>
        <input class="fld" style="max-width:220px;min-height:38px" placeholder="${esc(Lx.flSearch)}" value="${esc(f.text||'')}" ${onInput(e=>{f.text=e.target.value;clearTimeout(state._flT);state._flT=setTimeout(render,250);},'fl-text')}>
        <select class="fld" style="max-width:180px;min-height:38px" ${onInput(e=>{f.zone=e.target.value;render();},'fl-zone')}><option value="">${esc(Lx.flAllZones)}</option>${each(zones,z=>`<option${z===f.zone?' selected':''}>${esc(z)}</option>`)}</select></div>
      <div style="display:flex;gap:10px;align-items:center;padding:9px var(--pad);background:var(--surface2);font-size:12.5px">
        <button ${on(()=>{list.forEach(p=>allOn?sel.delete(p.id):sel.add(p.id));f.sel=[...sel];render();})} data-flall style="all:unset;cursor:pointer;display:flex;gap:8px;align-items:center;font-weight:600">${tbox(allOn)}${esc(Lx.flSelectAll)}</button>
        <span style="flex:1"></span><b>${esc(flTxt(Lx.flSelected,{n:f.sel.length}))}</b>${when(f.sel.length,`<button ${on(()=>{f.sel=[];render();})} style="all:unset;cursor:pointer;color:var(--of);font-weight:600">${esc(Lx.flNone)}</button>`)}</div>
      <div style="max-height:62vh;overflow:auto">
      ${list.length?each(list,p=>`<div class="trow" ${on(toggle(p.id))} data-un="${esc(p.ref)}" style="display:flex;gap:12px;align-items:center;padding:11px var(--pad);border-bottom:1px solid var(--line);cursor:pointer;${sel.has(p.id)?'background:var(--accentSoft)':''}">
          ${tbox(sel.has(p.id))}
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-family:var(--mono);font-size:12.5px">${esc(p.ref)}</b><span style="${css(stB(p.status))}">${esc(stL(p.status))}</span>${p.kind==='pickup'?`<span style="${css(badge('i'))}">${ico('exchange',12)}</span>`:''}${p.attempts?`<span style="${css(badge('w'))}">#${p.attempts+1}</span>`:''}</span>
            <span style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.client_name)} · <span style="color:var(--mute)">${esc((p.zone_name?p.zone_name+' · ':'')+(p.address||''))}</span></span></div>
          <div style="text-align:end;display:flex;flex-direction:column;gap:2px"><b style="font-size:13px">${esc(p.payment_mode==='prepaid'?'—':fmt(p.cod))}</b><span style="font-size:11px;color:var(--mute)">${esc(p.shop_name||'')}</span></div>
        </div>`):emptyState(Lx.flNoAssign)}</div>
    </div>
    <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px;position:sticky;top:12px">
      <b style="font-size:15px;display:flex;gap:8px;align-items:center">${ico('scooter',18)}${esc(Lx.flPickDriver)}</b>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:48vh;overflow:auto">
      ${drivers.length?each(drivers,d=>`<button ${on(()=>{f.pick=d.id;render();})} data-pick="${d.id}" style="${css({display:'flex',gap:10,alignItems:'center',padding:'9px 10px',borderRadius:12,cursor:'pointer',textAlign:'start',border:f.pick===d.id?'1.5px solid var(--orange)':'1px solid var(--line)',background:f.pick===d.id?'var(--accentSoft)':'var(--surface)'})}">
          ${avatar(d.name,34)}<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><b style="font-size:13.5px">${esc(d.name)}</b><span style="font-size:11.5px;color:var(--mute)">${esc((d.zone_name||'—')+' · '+flTxt(Lx.flLoad,{n:d.active_count}))}</span></span>${dsBadge(d)}</button>`):emptyState(Lx.flEmptyTeam)}</div>
      <button ${on(assign)} data-flassign ${!f.sel.length||!pick?'disabled':''} style="${BTN_PRIMARY};min-height:46px">${spin()}${ico('route',17)}${esc(flTxt(Lx.flAssignBtn,{n:f.sel.length,d:pick?pick.name:'…'}))}</button>
    </div>
  </div>`;
}

/* driver profile */
function tplFleetDriver(){
  const Lx=L(),f=flS(),x=state.flDet,u=Lx.tnd;
  const back=`<button ${on(()=>flGo({driver:null}))} data-flback style="${BTN_GHOST};align-self:flex-start">${ico('arrowLeft',16)}${esc(Lx.flBack)}</button>`;
  if(!x)return back+`<div style="${CARD};padding:28px;display:flex;justify-content:center"><span class="spin"></span></div>`;
  const d=x.driver,p=x.perf;
  const head=`<div style="${CARD};padding:var(--pad);display:flex;gap:16px;align-items:center;flex-wrap:wrap;background:linear-gradient(120deg,var(--surface) 55%,var(--accentSoft))">
    ${avatar(d.name,60)}<div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px"><span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b style="font-size:20px;letter-spacing:-.01em">${esc(d.name)}</b>${dsBadge(d)}</span>
      <span style="font-size:12.5px;color:var(--mute);display:flex;gap:12px;flex-wrap:wrap"><span>${ico('phone',13)} ${esc(fmtPhone(d.phone))}</span><span>${ico('pin',13)} ${esc(d.zone_name||'—')}</span><span>${ico('scooter',13)} ${esc(d.vehicle||'—')}</span><span>${ico('clock',13)} ${esc(ago(d.last_seen))}</span>${d.battery!=null?`<span>${ico('battery',13)} ${d.battery} %</span>`:''}</span></div>
    <div style="display:flex;gap:6px"><a href="${telHref(d.phone)}" style="${BTN_GHOST};text-decoration:none">${ico('phone',16)}${esc(Lx.flCall)}</a><button ${on(()=>flMessage(d))} data-flmsg style="${BTN_PRIMARY}">${ico('message',16)}${esc(Lx.flMessage)}</button></div></div>`;
  const tabs=`<div style="display:flex;gap:6px;flex-wrap:wrap">${each([['overview',Lx.flOverview,'chart'],['missions',Lx.flMissions+' ('+x.missions.length+')','box'],['pickups',Lx.flPickups,'store'],['history',Lx.flHistory,'clock'],['cash',Lx.flCash,'wallet'],['reviews',Lx.flReviewsTab,'star']],
    ([k,l,i])=>`<button ${on(()=>{f.dtab=k;f.msel=[];render();})} data-fldtab="${k}" style="${css({...chip(f.dtab===k),display:'inline-flex',alignItems:'center',gap:7})}">${ico(i,15)}${esc(l)}</button>`)}</div>`;
  let body='';
  if(f.dtab==='overview'){
    const days=x.daily,mx=Math.max(1,...days.map(r=>r.delivered+r.failed));
    const chart=days.length?`<div style="display:flex;gap:14px;font-size:12px;color:var(--mute)"><span style="display:flex;gap:6px;align-items:center"><span style="width:10px;height:10px;border-radius:3px;background:var(--gf)"></span>${esc(Lx.flLegendOk)}</span><span style="display:flex;gap:6px;align-items:center"><span style="width:10px;height:10px;border-radius:3px;background:var(--rf)"></span>${esc(Lx.flLegendKo)}</span></div>
      <div data-daily style="display:flex;align-items:flex-end;gap:3px;height:150px;border-bottom:1px solid var(--line)">${each(days,r=>`<span title="${esc(r.day+' — '+Lx.flLegendOk+' : '+r.delivered+' · '+Lx.flLegendKo+' : '+r.failed)}" style="flex:1;min-width:6px;max-width:28px;display:flex;flex-direction:column;justify-content:flex-end;gap:2px;height:100%;cursor:default">
        ${r.failed?`<span style="height:${r.failed/mx*140}px;background:var(--rf);border-radius:4px 4px 0 0"></span>`:''}<span style="height:${Math.max(r.delivered?2:0,r.delivered/mx*140)}px;background:var(--gf);border-radius:${r.failed?'0':'4px 4px 0 0'}"></span></span>`)}</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--mute)"><span>${esc(days[0].day)}</span><span>${esc(days.at(-1).day)}</span></div>`:emptyState(Lx.flNoData);
    body=`<div style="display:flex;gap:4px;align-items:center;font-size:12.5px;color:var(--mute)">${ico('calendar',15)} ${each([7,30,90],n=>`<button ${on(()=>flGo({days:n}))} style="${css({...chip(f.days===n),padding:'5px 11px',fontSize:12})}">${esc(flTxt(Lx.flDaysN,{n}))}</button>`)}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:var(--gap)">
      ${kpiCard(Lx.flDelivered,String(p.delivered),Lx.flHandled+' : '+p.assigned,'checkCircle','g')}${kpiCard(Lx.flSuccess,pct(p.success_rate),Lx.flFailed+' : '+p.failed,'trend','g')}
      ${kpiCard(Lx.flFirst,pct(p.first_pass_rate),null,'zap','i')}${kpiCard(Lx.flRoute,p.avg_route_min==null?'—':p.avg_route_min+' '+Lx.flMin,null,'clock','i')}
      ${kpiCard(Lx.flCod,fmt(p.cod_period),u,'wallet','o')}${kpiCard(Lx.flToRemit,fmt(p.to_remit),u,'cash','w')}
      ${kpiCard(Lx.flRating,p.rating==null?'—':String(p.rating).replace('.',',')+' / 5',Lx.flClaims+' : '+p.claims,'star','o')}${kpiCard(Lx.flCalls,String(p.calls),Lx.flProblems+' : '+p.problems,'phone','n')}</div>
      <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:12px"><b>${esc(Lx.flDaily)}</b>${chart}</div>`;
  }else if(f.dtab==='missions'){
    const ms=new Set(f.msel),can=x.missions.filter(m=>m.status==='affecte');
    const unassign=()=>askReason(Lx.flUnassign,false,note=>flAct(async()=>{const r=await api('fleet/unassign',{method:'POST',body:{order_ids:f.msel,note}});f.msel=[];
      toast(flTxt(Lx.flUnassigned,{n:r.done.length})+(r.errors.length?' · '+r.errors[0]:''),r.errors.length?'err':undefined);}));
    const cols=[{k:'sel',label:'',w:'34px',fmt:m=>m.status==='affecte'?`<input type="checkbox" ${ms.has(m.id)?'checked':''} ${on(()=>{ms.has(m.id)?ms.delete(m.id):ms.add(m.id);f.msel=[...ms];render();})} aria-label="${esc(m.ref)}">`:''},
      {k:'ref',label:'Réf.',w:'minmax(110px,1fr)',fmt:m=>`<button ${on(()=>selectOrder(m.id))} style="all:unset;cursor:pointer;font-family:var(--mono);font-weight:600;color:var(--of)">${esc(m.ref)}</button>`},
      {k:'status',label:Lx.status||'Statut',w:'minmax(120px,1fr)',fmt:m=>`<span style="${css(stB(m.status))}">${esc(stL(m.status))}</span>`},
      {k:'client_name',label:Lx.client||'Client',w:'minmax(150px,1.5fr)',fmt:m=>`<span style="display:flex;flex-direction:column"><b>${esc(m.client_name)}</b><span style="font-size:11.5px;color:var(--mute)">${esc(m.zone_name||m.dest_city_name||'')}</span></span>`},
      {k:'shop_name',label:Lx.colShop||'Boutique',w:'minmax(110px,1fr)'},{k:'attempts',label:'#',num:1,w:'50px'},{k:'cod',label:'COD',num:1,fmt:m=>esc(m.payment_mode==='prepaid'?'—':fmt(m.cod))},{k:'updated_at',label:Lx.flSeen,num:1,fmt:m=>esc(ago(m.updated_at))}];
    body=`<div style="${CARD};overflow:hidden"><div style="display:flex;gap:10px;align-items:center;padding:10px var(--pad);flex-wrap:wrap"><span style="font-size:12.5px;color:var(--mute);flex:1">${esc(Lx.flOnlyAffecte)}</span>
      <button ${on(unassign)} data-flunassign ${f.msel.length?'':'disabled'} style="${BTN_GHOST}">${ico('undo',15)}${esc(Lx.flUnassign)} (${f.msel.length})</button></div>
      ${sortTable('missions',cols,x.missions,{sort:f.msort||{k:'updated_at',dir:1},onSort:s=>{f.msort=s;render();},minW:860})}</div>`;
    if(!can.length&&!x.missions.length)body=`<div style="${CARD}">${emptyState(Lx.noMissions)}</div>`;
  }else if(f.dtab==='pickups'){
    body=`<div style="${CARD};overflow:hidden">${x.pickups.length?each(x.pickups,m=>`<div class="trow" ${on(()=>selectBrd(m.id,m.type))} style="display:flex;gap:12px;align-items:center;padding:12px var(--pad);border-bottom:1px solid var(--line);cursor:pointer">
      <span style="width:36px;height:36px;border-radius:10px;background:var(--ib);color:var(--if);display:inline-flex;align-items:center;justify-content:center">${ico(m.type==='pickup'?'store':'file',18)}</span>
      <span style="flex:1;display:flex;flex-direction:column;gap:2px"><b style="font-family:var(--mono);font-size:13px">${esc(m.ref)}</b><span style="font-size:12px;color:var(--mute)">${esc((m.shop_name||'')+' · '+m.n+' '+Lx.parcels)}</span></span>
      ${stageBadge(m)}<span style="font-size:12px;color:var(--mute)">${esc(dtm(m.created_at))}</span></div>`):emptyState(Lx.flNoData)}</div>`;
  }else if(f.dtab==='history'){
    body=`<div style="${CARD};padding:var(--pad)"><div style="display:flex;flex-direction:column">${x.history.length?each(x.history,h=>`<div style="display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);align-items:start">
      <span style="width:12px;height:12px;border-radius:50%;margin-top:4px;background:var(--${(ST[h.status]||[0,0,'n'])[2]}f);box-shadow:0 0 0 4px var(--${(ST[h.status]||[0,0,'n'])[2]}b)"></span>
      <span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span><span style="${css(stB(h.status))}">${esc(stL(h.status))}</span> <button ${on(()=>selectOrder(h.order_id))} style="all:unset;cursor:pointer;font-family:var(--mono);font-weight:600;font-size:12.5px;color:var(--of)">${esc(h.ref)}</button> · ${esc(h.client_name)}</span>${h.note?`<span style="font-size:12px;color:var(--mute)">${esc(h.note)}</span>`:''}</span>
      <span style="font-size:12px;color:var(--mute);white-space:nowrap">${esc(dtm(h.created_at))}</span></div>`):emptyState(Lx.flNoData)}</div></div>`;
  }else if(f.dtab==='cash'){
    body=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:var(--gap)">${kpiCard(Lx.flCollected,fmt(p.collected_total),u,'wallet','o')}${kpiCard(Lx.flRemitted,fmt(p.remitted_total),u,'checkCircle','g')}${kpiCard(Lx.flToRemit,fmt(p.to_remit),u,'cash',p.to_remit>0?'w':'g')}</div>
      <div style="${CARD};overflow:hidden"><div style="display:flex;align-items:center;padding:12px var(--pad);border-bottom:1px solid var(--line)"><b style="flex:1">${esc(Lx.flRemits)}</b><button ${on(()=>goPage('cash'))} style="${BTN_GHOST}">${ico('wallet',15)}${esc(Lx.flGoCash)}</button></div>
      ${x.remits.length?each(x.remits,r=>`<div class="trow" style="display:flex;gap:12px;padding:11px var(--pad);border-bottom:1px solid var(--line);align-items:center;font-size:13px"><span style="flex:1;display:flex;flex-direction:column"><b>${esc(r.label||r.manifest_ref||'—')}</b><span style="font-size:11.5px;color:var(--mute)">${esc(dtm(r.created_at)+(r.by_name?' · '+Lx.flBy+' '+r.by_name:''))}</span></span><b style="color:var(--gf)">${esc(fmt(r.amount,u))}</b></div>`):emptyState(Lx.flNoData)}</div>`;
  }else{
    body=`<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column">${x.reviews.length?each(x.reviews,r=>`<div style="padding:10px 0;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:4px"><span style="display:flex;justify-content:space-between;gap:8px"><span style="color:var(--orange);letter-spacing:2px">${'★'.repeat(r.stars)}<span style="color:var(--line)">${'★'.repeat(5-r.stars)}</span></span><span style="font-size:12px;color:var(--mute)">${esc(r.ref+' · '+dtm(r.created_at))}</span></span>${r.comment?`<span style="font-size:13px">« ${esc(r.comment)} »</span>`:''}</div>`):emptyState(Lx.noReviews)}</div>`;
  }
  return back+head+tabs+body;
}

/* the former cards (ratings, last comment) are kept as the « Avis clients » view */
const tplDriverCards=tplDrivers;
tplDrivers=tplFleet;
