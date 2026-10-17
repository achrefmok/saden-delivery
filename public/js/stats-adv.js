/* SADEN — advanced statistics (tab of « Statistiques »): delivery by attempts, return / exchange rates, problems,
   claims, drivers, agencies comparison, top shippers, governorates, daily volume. One hue per chart, values in ink. */

async function loadStatsAdv(){
  const f=state.sa||{},qs=new URLSearchParams();
  if(f.from&&f.to){qs.set('from',f.from);qs.set('to',f.to);}
  if(f.shop_id)qs.set('shop_id',f.shop_id);
  if(role()==='admin'&&state.agencyFilter)qs.set('agency_id',state.agencyFilter);
  state.statsAdv=await api('stats/advanced?'+qs);
}
/* single-series horizontal bars (no legend: the title names the series); hover shows the exact value */
function hbars(rows,{label,value,fmtV=v=>String(v),tone='var(--navy)'}){
  const mx=Math.max(1,...rows.map(value));
  return rows.length?`<div style="display:flex;flex-direction:column;gap:7px">${each(rows,r=>`<div style="display:grid;grid-template-columns:minmax(90px,38%) 1fr auto;gap:8px;align-items:center;font-size:12.5px" title="${esc(label(r)+' : '+fmtV(value(r)))}">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label(r))}</span>
      <span style="height:12px;background:var(--surface2);border-radius:4px;overflow:hidden"><span style="display:block;height:100%;width:${value(r)/mx*100}%;background:${tone};border-radius:0 4px 4px 0"></span></span>
      <b style="font-weight:600;min-width:42px;text-align:end">${esc(fmtV(value(r)))}</b></div>`)}</div>`:`<span style="color:var(--mute)">${esc(L().empty)}</span>`;
}
function tplStatsAdv(){
  const Lx=L(),s=state.statsAdv,f=state.sa||(state.sa={from:'',to:'',shop_id:''}),d=state.data||{};
  const reload=()=>{state.statsAdv=null;render();loadStatsAdv().then(render).catch(e=>toast(e.message,'err'));};
  if(!s&&!state._saReq){state._saReq=true;loadStatsAdv().catch(e=>toast(e.message,'err')).finally(()=>{state._saReq=false;render();});}
  const filters=`<div style="${CARD};padding:var(--pad);display:flex;flex-wrap:wrap;gap:8px;align-items:end">
    ${field(Lx.periodFrom,input('sa-from','sa','from','type="date"'))}${field(Lx.periodTo,input('sa-to','sa','to','type="date"'))}
    ${field(Lx.colShop,select('sa-shop','sa','shop_id',[['',Lx.any],...(d.shops||[]).map(x=>[x.id,x.shop_name])]))}
    <button ${on(reload)} style="${BTN_PRIMARY};min-height:42px">${esc(Lx.apply)}</button>
    <span style="font-size:12px;color:var(--mute);flex:1;min-width:180px">${esc(f.from&&f.to?'':Lx.last90)}</span></div>`;
  if(!s)return filters+`<div style="${CARD};padding:24px"><span class="spin"></span></div>`;
  const k=s.kpis,P=v=>v==null?'—':String(v).replace('.',',')+' %';
  const card=(title,inner,extra='')=>`<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:12px;min-width:0;${extra}"><b>${esc(title)}</b>${inner}</div>`;
  const table=(cols,rows)=>`<div style="overflow-x:auto"><div style="min-width:440px"><div style="display:grid;grid-template-columns:minmax(0,1.5fr) repeat(${cols.length-1},minmax(70px,1fr));gap:8px;padding:7px 0;font-size:11.5px;color:var(--mute);border-bottom:1px solid var(--line)">${each(cols,(c,i)=>`<span style="${i?'text-align:end':''}">${esc(c)}</span>`)}</div>
    ${rows.length?each(rows,r=>`<div style="display:grid;grid-template-columns:minmax(0,1.5fr) repeat(${cols.length-1},minmax(70px,1fr));gap:8px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px">${each(r,(v,i)=>`<span style="${i?'text-align:end':'font-weight:600'}">${esc(v)}</span>`)}</div>`):empty()}</div></div>`;
  const days=s.days,mx=Math.max(1,...days.map(x=>x.n));
  const volume=days.length?`<div style="display:flex;align-items:flex-end;gap:2px;height:160px">${each(days,x=>`<span title="${esc(x.d+' : '+x.n)}" style="flex:1;min-width:3px;height:${Math.max(2,x.n/mx*150)}px;background:var(--navy);border-radius:4px 4px 0 0"></span>`)}</div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--mute)"><span>${esc(days[0].d)}</span><span>${esc(Lx.maxK)} ${mx}</span><span>${esc(days.at(-1).d)}</span></div>`:empty();
  return `${filters}
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:var(--gap)" data-adv-kpis>
    ${kpiCard(Lx.parcelsTotal,String(k.total),k.delivered+' '+Lx.deliveredN+' · '+P(k.delivery_rate))}
    ${kpiCard(Lx.firstPass,P(k.first_pass_pct),k.first_pass+' '+Lx.parcels)}
    ${kpiCard(Lx.multiPass,P(k.multi_pass_pct),Lx.avgAttempts+' '+(k.avg_attempts??'—'))}
    ${kpiCard(Lx.never3,P(k.never_3_pct),k.returns_3+' / '+k.returns+' '+Lx.returnsLow)}
    ${kpiCard(Lx.returnRate,P(k.return_rate),k.returns+' '+Lx.parcels)}
    ${kpiCard(Lx.exchangeRate,P(k.exchange_rate),k.exchanges+' '+Lx.exchangesLow)}
  </div>
  ${card(Lx.volumeTrend,volume)}
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:var(--gap)">
    ${card(Lx.problemsByType,hbars(s.problems,{label:r=>pbL(r.type),value:r=>r.n,tone:'var(--orange)'}))}
    ${card(Lx.claimsByType,hbars(s.claims,{label:r=>CATS[r.category]?.[li()]||String(r.category),value:r=>r.n,tone:'var(--orange)'}))}
    ${card(Lx.topShippers,hbars(s.shops,{label:r=>r.name,value:r=>r.n}))}
    ${card(Lx.byGovernorate,hbars(s.governorates,{label:r=>r.name,value:r=>r.n}))}
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:var(--gap)">
    ${card(Lx.driverPerf,table([Lx.driverK,Lx.assignedK,Lx.deliveredK,Lx.firstPassShort,Lx.avgAttempts],s.drivers.map(r=>[r.name,r.assigned,r.delivered,r.delivered?Math.round(r.first_pass/r.delivered*100)+' %':'—',r.avg_attempts??'—'])))}
    ${card(Lx.agencyCompare,table([Lx.agencyLbl,Lx.parcelsTotal,Lx.deliveredK,Lx.returns,Lx.avgDelay],s.agencies.map(r=>[r.name,r.total,r.delivered,r.returns,r.avg_days!=null?String(r.avg_days).replace('.',',')+' j':'—'])))}
  </div>`;
}
/* « Statistiques » gets two tabs: the existing view and the advanced one */
const _tplStatsBase=tplStats;
tplStats=function(){
  const Lx=L(),t=state.stTab||'base';
  return `<div class="no-print" style="display:flex;gap:6px">${each([['base',Lx.statsBase],['adv',Lx.statsAdv]],([k,l])=>`<button ${on(()=>{state.stTab=k;render();})} data-sttab="${k}" style="${css(chip(t===k))}">${esc(l)}</button>`)}</div>`+(t==='adv'?tplStatsAdv():_tplStatsBase());
};
Object.assign(K,{
  statsBase:['Vue générale','نظرة عامة'],statsAdv:['Performance avancée','أداء متقدم'],last90:['Par défaut : 90 derniers jours','افتراضيا: آخر 90 يوما'],
  firstPass:['Livré au 1er passage','سُلّم من أول محاولة'],multiPass:['Livré après plusieurs tentatives','سُلّم بعد عدة محاولات'],never3:['Jamais livrés (≥ 3 tentatives)','لم يُسلّم (≥3 محاولات)'],
  returnsLow:['retours','مرتجعات'],returnRate:['Taux de retour','نسبة الإرجاع'],exchangeRate:['Taux d’échange','نسبة التبديل'],exchangesLow:['échanges','تبديلات'],avgAttempts:['Tentatives moy.','متوسط المحاولات'],
  volumeTrend:['Évolution du volume (colis créés par jour)','تطور الحجم'],maxK:['max','الأقصى'],problemsByType:['Colis en problème par type','المشاكل حسب النوع'],claimsByType:['Réclamations par type','الشكاوى حسب النوع'],
  topShippers:['Top 10 expéditeurs','أفضل 10 مرسلين'],byGovernorate:['Répartition par gouvernorat','التوزيع حسب الولاية'],driverPerf:['Performance par livreur','أداء الموزعين'],
  assignedK:['Assignés','مسندة'],firstPassShort:['1er passage','أول محاولة'],agencyCompare:['Comparatif des agences','مقارنة الوكالات'],avgDelay:['Délai moyen','متوسط المدة'],
});
