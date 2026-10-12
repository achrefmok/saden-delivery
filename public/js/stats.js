/* SADEN — « Statistiques » (§24): period presets or custom range, filters (agency, city, driver, shop), breakdowns. */

function statsQuery(){
  const f=state.stf||{},p=new URLSearchParams();
  if(f.from&&f.to){p.set('from',f.from);p.set('to',f.to);}else p.set('period',String(state.period||0));
  for(const k of ['city_id','driver_id','shop_id'])if(f[k])p.set(k,f[k]);
  if(role()==='admin'&&state.agencyFilter)p.set('agency_id',state.agencyFilter);
  return 'stats?'+p.toString();
}
async function loadStats(){state.stats=await api(statsQuery());}

function tplStats(){
  const Lx=L(),u=Lx.tnd,s=state.stats;
  if(!state.stf)state.stf={from:'',to:'',city_id:'',driver_id:'',shop_id:''};
  const f=state.stf,d=state.data;
  const reload=()=>{state.stats=null;render();loadStats().then(render).catch(e=>toast(e.message,'err'));};
  const preset=j=>()=>{state.period=j;state.stf={...state.stf,from:'',to:''};reload();};
  const filters=`<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${each(Lx.period,(p,j)=>`<button ${on(preset(j))} style="${css(chip(!f.from&&state.period===j))}">${esc(p)}</button>`)}
      <span style="color:var(--mute);font-size:12.5px;margin-inline-start:6px">${esc(Lx.customRange)}</span>
      <input type="date" class="fld" style="max-width:160px" ${onInput(e=>{state.stf={...state.stf,from:e.target.value};},'st-from')} value="${esc(f.from)}">
      <input type="date" class="fld" style="max-width:160px" ${onInput(e=>{state.stf={...state.stf,to:e.target.value};},'st-to')} value="${esc(f.to)}"></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:8px;align-items:end">
      ${field(Lx.city,select('st-city','stf','city_id',[['',Lx.any],...cityOptions()]))}
      ${field(Lx.driver,select('st-drv','stf','driver_id',[['',Lx.any],...(d.drivers||[]).map(x=>[x.id,x.name])]))}
      ${field(Lx.colShop,select('st-shop','stf','shop_id',[['',Lx.any],...(d.shops||[]).map(x=>[x.id,x.shop_name])]))}
      <button ${on(reload)} style="${BTN_PRIMARY};min-height:42px">${esc(Lx.apply)}</button>
    </div></div>`;
  if(!s)return filters+`<div style="${CARD};padding:24px"><span class="spin"></span></div>`;
  const k=s.kpis,mx=Math.max(1,...s.bars.map(b=>b.v));
  const pct=(a,b)=>b?(a/b*100).toFixed(1).replace('.',',')+' %':'—';
  const table=(title,cols,rows)=>`<div style="${CARD};overflow:hidden;min-width:0"><div style="padding:var(--pad)"><b>${esc(title)}</b></div><div style="overflow-x:auto"><div style="min-width:420px">
    <div style="display:grid;grid-template-columns:minmax(0,1.5fr) repeat(${cols.length-1},minmax(70px,1fr));gap:10px;padding:8px var(--pad);font-size:11.5px;text-transform:uppercase;color:var(--mute);background:var(--surface2)">${each(cols,(c,i)=>`<span style="${i?'text-align:end':''}">${esc(c)}</span>`)}</div>
    ${rows.length?each(rows,r=>`<div style="display:grid;grid-template-columns:minmax(0,1.5fr) repeat(${cols.length-1},minmax(70px,1fr));gap:10px;padding:8px var(--pad);border-top:1px solid var(--line)">${each(r,(v,i)=>`<span style="${i?'text-align:end':'font-weight:600'}">${esc(v)}</span>`)}</div>`):empty()}
  </div></div></div>`;
  return `${filters}
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:var(--gap)">
    ${kpiCard(Lx.revenue,fmt(k.revenue,u))}${kpiCard(Lx.sSaden,fmt(k.saden_revenue,u))}${kpiCard(Lx.parcelsTotal,String(k.total),k.delivered+' '+Lx.deliveredN)}
    ${kpiCard(Lx.rate,pct(k.delivered,k.finals))}${kpiCard(Lx.delay,k.avg_min!=null?k.avg_min+' min':'—')}${kpiCard(Lx.returns,String(k.returns),pct(k.returns,k.total))}${kpiCard(Lx.cancelledK,String(k.cancelled),k.incidents+' '+Lx.incidentsN)}
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:var(--gap)">
    <div class="span2" style="grid-column:span 2;min-width:0;${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:14px">
      <b>${esc(Lx.volume)} <span style="font-weight:400;color:var(--mute);font-size:12px">· ${esc(s.unit==='week'?Lx.perWeek:Lx.perDay)}</span></b>
      <div style="display:flex;align-items:flex-end;gap:6px;height:220px;overflow-x:auto">
        ${each(s.bars,(b,j)=>`<div style="flex:1;min-width:22px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px"><span style="font-size:10.5px;color:var(--mute)">${b.v}</span><span style="width:100%;max-width:34px;height:${b.v/mx*150}px;background:${j===s.bars.length-1?'var(--orange)':'var(--navy)'};border-radius:calc(var(--r) / 2) calc(var(--r) / 2) 0 0"></span><span style="font-size:10.5px;color:var(--mute);white-space:nowrap">${esc(b.l)}</span></div>`)}
      </div>
    </div>
    <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:12px">
      <b>${esc(Lx.byZone)}</b>
      ${s.zones.length?each(s.zones,z=>`<div style="display:flex;flex-direction:column;gap:4px"><div style="display:flex;justify-content:space-between"><span>${esc(z.name)} <span style="color:var(--mute);font-size:11.5px">(${z.n})</span></span><b>${z.v} %</b></div><div style="height:8px;background:var(--surface2);border-radius:999px;overflow:hidden"><div style="width:${z.v}%;height:100%;background:${z.v>90?'var(--navy)':'var(--orange)'};border-radius:999px"></div></div></div>`):`<span style="color:var(--mute)">${esc(Lx.empty)}</span>`}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:var(--gap)">
    ${table(Lx.byShop,[Lx.colShop,Lx.parcelsTotal,Lx.deliveredK,Lx.returns,Lx.revenue],s.shops.map(x=>[x.name,x.n,x.delivered+' ('+pct(x.delivered,x.n)+')',x.returns,fmt(x.revenue)]))}
    ${table(Lx.byCity,[Lx.city,Lx.parcelsTotal,Lx.deliveredK,Lx.revenue],s.cities.map(x=>[x.name,x.n,x.delivered+' ('+pct(x.delivered,x.n)+')',fmt(x.revenue)]))}
    ${table(Lx.topDrivers,[Lx.driver,Lx.deliveredK,Lx.rate,'★'],s.top.map(x=>[x.name,x.delivered,pct(x.delivered,x.finals),x.rating!=null?String(x.rating).replace('.',','):'—']))}
    ${table(Lx.ratingByAgency,[Lx.agencyLbl,'★',Lx.reviews],s.ratings.agencies.map(x=>[x.name,String(x.avg).replace('.',','),x.n]))}
    ${table(Lx.ratingByCity,[Lx.city,'★',Lx.reviews],s.ratings.cities.map(x=>[x.name,String(x.avg).replace('.',','),x.n]))}
  </div>`;
}

Object.assign(K,{
  customRange:['ou du … au …','أو من … إلى …'],apply:['Appliquer','تطبيق'],parcelsTotal:['Colis','الطرود'],cancelledK:['Annulés','الملغاة'],incidentsN:['incidents','حوادث'],
  perWeek:['par semaine','أسبوعيا'],perDay:['par jour','يوميا'],byShop:['Performance par boutique','الأداء حسب المتجر'],byCity:['Performance par ville','الأداء حسب المدينة'],
  ratingByAgency:['Note moyenne par agence (période)','متوسط التقييم حسب الوكالة'],ratingByCity:['Note moyenne par ville (période)','متوسط التقييم حسب المدينة'],
});
