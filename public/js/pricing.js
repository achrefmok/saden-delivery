/* SADEN — « Tarifs » screen (§21): pricing rules CRUD + price simulator, and live quotes in order forms. */

const PAYMENT_MODES={cod:['Contre-remboursement','الدفع عند الاستلام'],prepaid:['Prépayé','مدفوع مسبقا'],sender_pays:['Frais payés par l’expéditeur','المرسل يدفع المعلوم']};
const PARCEL_TYPES={standard:['Standard','عادي'],fragile:['Fragile','قابل للكسر'],document:['Document','وثيقة'],volumineux:['Volumineux','كبير الحجم'],alimentaire:['Alimentaire','غذائي']};
const pmL=k=>(PAYMENT_MODES[k]||[k,k])[lang()==='ar'?1:0];
const ptL=k=>k?(PARCEL_TYPES[k]||[k,k])[lang()==='ar'?1:0]:'—';
const emptyRule=()=>({id:null,name:'',service:'local',agency_id:'',origin_city_id:'',dest_city_id:'',zone_id:'',shop_id:'',parcel_type:'',min_weight:'',max_weight:'',min_km:'',max_km:'',price:'',driver_share:'',saden_commission:'0',priority:'0',active:true});

/* live quote for order forms: debounced call to /pricing/simulate */
const quoteTimers={};
function requestQuote(key){
  clearTimeout(quoteTimers[key]);
  quoteTimers[key]=setTimeout(async()=>{
    const f=state[key];if(!f||!f.dest_city_id)return;
    const sig=JSON.stringify([f.origin_agency_id,f.dest_city_id,f.zone_id,f.shop_id,f.weight,f.parcel_type,f.cod,f.payment_mode,f.lat,f.lng]);
    if(state.quotes[key]?.sig===sig)return;
    try{const r=await api('pricing/simulate',{method:'POST',body:f});state.quotes[key]={sig,r};}
    catch(e){state.quotes[key]={sig,err:e.message};}
    render();
  },350);
}
function tplQuote(key){
  const Lx=L(),q=state.quotes[key];requestQuote(key);
  if(!q)return '';
  if(q.err)return `<div style="padding:10px;border-radius:var(--r);background:var(--rb);color:var(--rf);font-size:12.5px">${esc(q.err)}</div>`;
  const r=q.r,u=Lx.tnd;
  return `<div style="padding:10px 12px;border-radius:var(--r);background:var(--ib);color:var(--if);display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px">
    <span>${esc(Lx.deliveryFee)} <b>${esc(fmt(r.delivery_fee,u))}</b></span>
    <span>${esc(Lx.toRemit)} <b>${esc(fmt(r.amount_to_remit,u))}</b></span>
    <span style="opacity:.8">${esc(r.service==='intercity'?Lx.inter:Lx.local)}${r.km!=null?' · '+kmL(r.km):''} · ${esc(r.rule.name||('#'+r.rule.id))}</span>
  </div>`;
}

function ruleCriteria(r){
  const Lx=L(),c=[];
  if(r.shop_name)c.push(Lx.colShop+' '+r.shop_name);
  if(r.agency_name)c.push(r.agency_name);
  if(r.origin_city_name)c.push(Lx.from+' '+r.origin_city_name);
  if(r.dest_city_name)c.push('→ '+r.dest_city_name);
  if(r.zone_name)c.push(Lx.colZone+' '+r.zone_name);
  if(r.parcel_type)c.push(ptL(r.parcel_type));
  if(r.min_weight!=null||r.max_weight!=null)c.push((r.min_weight??0)+'–'+(r.max_weight??'∞')+' kg');
  if(r.min_km!=null||r.max_km!=null)c.push((r.min_km??0)+'–'+(r.max_km??'∞')+' km');
  return c.length?c.join(' · '):Lx.defaultRule;
}

function tplPricing(){
  const Lx=L(),u=Lx.tnd,admin=role()==='admin',P=state.pricing;
  if(!P)return `<div style="${CARD};padding:24px"><span class="spin"></span></div>`;
  if(!state.pform)state.pform=emptyRule();
  if(!state.simf)state.simf={origin_agency_id:'',dest_city_id:String(homeAgency()?.city_id||''),zone_id:'',shop_id:'',weight:'',parcel_type:'',cod:'100',payment_mode:'cod'};
  const f=state.pform,sf=state.simf,shops=state.data?.shops||[];
  const opt=(pairs,blank='—')=>[['',blank],...pairs];
  const save=()=>act(async()=>{const cur=state.pform;if(cur.id)await api('pricing/'+cur.id,{method:'PATCH',body:cur});else await api('pricing',{method:'POST',body:cur});state.pform=emptyRule();state.pricing=await api('pricing');},Lx.saved);
  const edit=r=>()=>{state.pform=Object.fromEntries(Object.entries({...emptyRule(),...r}).map(([k,v])=>[k,v==null?'':typeof v==='number'?String(v):v]));render();scrollTo(0,0);};
  const toggle=r=>()=>act(async()=>{await api('pricing/'+r.id,{method:'PATCH',body:{active:!r.active}});state.pricing=await api('pricing');},Lx.saved);
  const simulate=()=>act(async()=>{state.simr=await api('pricing/simulate',{method:'POST',body:state.simf});});
  const grid='minmax(0,1.6fr) 90px 90px 90px 70px auto';
  const sr=state.simr;
  return `<div class="split" style="display:grid;grid-template-columns:minmax(280px,400px) minmax(0,1fr);gap:var(--gap);align-items:start">
    <div style="display:flex;flex-direction:column;gap:var(--gap)">
      ${when(admin,()=>`<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px">
        <b style="font-size:16px">${esc(f.id?Lx.editRule:Lx.newRule)}</b>
        ${field(Lx.name2,input('pr-name','pform','name','placeholder="Ex. Sousse express"'))}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${field(Lx.service,select('pr-svc','pform','service',[['local',Lx.local],['intercity',Lx.inter]]))}
          ${field(Lx.priority,input('pr-prio','pform','priority','inputmode="numeric"'))}
        </div>
        <span style="font-size:12px;color:var(--mute)">${esc(Lx.criteriaHint)}</span>
        ${field(Lx.agencyLbl,select('pr-ag','pform','agency_id',opt(agencyOptions(),Lx.any)))}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${field(Lx.from,select('pr-oc','pform','origin_city_id',opt(cityOptions(),Lx.any)))}
          ${field(Lx.to,select('pr-dc','pform','dest_city_id',opt(cityOptions(),Lx.any),true))}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${field(Lx.colZone,select('pr-z','pform','zone_id',opt(f.dest_city_id?zoneOptions(f.dest_city_id):[],Lx.any)))}
          ${field(Lx.colShop,select('pr-shop','pform','shop_id',opt(shops.map(s=>[s.id,s.shop_name]),Lx.any)))}
        </div>
        ${field(Lx.parcelType,select('pr-pt','pform','parcel_type',opt(Object.keys(PARCEL_TYPES).map(k=>[k,ptL(k)]),Lx.any)))}
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px">
          ${field('kg min',input('pr-w1','pform','min_weight','inputmode="decimal"'))}${field('kg max',input('pr-w2','pform','max_weight','inputmode="decimal"'))}
          ${field('km min',input('pr-k1','pform','min_km','inputmode="decimal"'))}${field('km max',input('pr-k2','pform','max_km','inputmode="decimal"'))}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          ${field(Lx.price+' ('+u+')',input('pr-price','pform','price','inputmode="decimal"'))}
          ${field(Lx.driverShare+' ('+u+')',input('pr-ds','pform','driver_share','inputmode="decimal"'))}
          ${field(Lx.codCommission+' %',input('pr-com','pform','saden_commission','inputmode="decimal"'))}
        </div>
        <div style="display:flex;gap:8px"><button ${on(save)} style="${BTN_PRIMARY};flex:1">${spin()}${esc(Lx.save)}</button>${when(f.id,()=>`<button ${on(()=>{state.pform=emptyRule();render();})} style="${BTN_GHOST}">${esc(Lx.cancel)}</button>`)}</div>
      </div>`)}
      <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px">
        <b style="font-size:16px">${esc(Lx.simulator)}</b>
        ${when(admin,()=>field(Lx.originAgency,select('sm-ag','simf','origin_agency_id',[['',Lx.auto],...agencyOptions()])))}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${field(Lx.destCity,select('sm-dc','simf','dest_city_id',cityOptions(),true))}
          ${field(Lx.colZone,select('sm-z','simf','zone_id',opt(zoneOptions(sf.dest_city_id))))}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${field(Lx.colShop,select('sm-shop','simf','shop_id',opt(shops.map(s=>[s.id,s.shop_name]))))}
          ${field(Lx.parcelType,select('sm-pt','simf','parcel_type',opt(Object.keys(PARCEL_TYPES).map(k=>[k,ptL(k)]))))}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          ${field(Lx.weight,input('sm-w','simf','weight','inputmode="decimal"'))}
          ${field(Lx.colAmount+' ('+u+')',input('sm-cod','simf','cod','inputmode="decimal"'))}
          ${field(Lx.payment,select('sm-pm','simf','payment_mode',Object.keys(PAYMENT_MODES).map(k=>[k,pmL(k)])))}
        </div>
        <button ${on(simulate)} style="${BTN_PRIMARY}">${spin()}${esc(Lx.simulate)}</button>
        ${when(sr,()=>`<div style="padding:12px;border-radius:var(--r);background:var(--surface2);display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <span style="grid-column:span 2;font-size:12px;color:var(--mute)">${esc(sr.rule.name||'#'+sr.rule.id)} · ${esc(sr.service==='intercity'?Lx.inter:Lx.local)}${sr.km!=null?' · '+kmL(sr.km):''}</span>
          ${each([[Lx.deliveryFee,sr.delivery_fee],[Lx.driverShare,sr.driver_share],[Lx.sSaden,sr.saden_revenue],[Lx.toRemit,sr.amount_to_remit]],([k,v])=>`<div style="display:flex;flex-direction:column"><span style="font-size:11.5px;color:var(--mute)">${esc(k)}</span><b>${esc(fmt(v,u))}</b></div>`)}
        </div>`)}
      </div>
    </div>
    <div style="min-width:0;${CARD};overflow:hidden">
      <div style="padding:var(--pad)"><b>${esc(Lx.pricingRules)}</b> <span style="color:var(--mute);font-size:12px">· ${esc(Lx.pricingHint)}</span></div>
      <div style="overflow-x:auto"><div style="min-width:680px">
        <div style="display:grid;grid-template-columns:${grid};gap:10px;padding:8px var(--pad);font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--mute);background:var(--surface2)"><span>${esc(Lx.criteria)}</span><span style="text-align:end">${esc(Lx.price)}</span><span style="text-align:end">${esc(Lx.driverShare)}</span><span style="text-align:end">${esc(Lx.codCommission)}</span><span style="text-align:end">${esc(Lx.priority)}</span><span></span></div>
        ${each(['local','intercity'],svc=>`<div style="padding:8px var(--pad);font-weight:700;border-top:1px solid var(--line)">${esc(svc==='local'?Lx.local:Lx.inter)}</div>`+each(P.rules.filter(r=>r.service===svc),r=>`
          <div style="display:grid;grid-template-columns:${grid};gap:10px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line);${r.active?'':'opacity:.5'}">
            <span style="display:flex;flex-direction:column;min-width:0"><b style="font-weight:600">${esc(r.name||'#'+r.id)}</b><span style="font-size:12px;color:var(--mute)">${esc(ruleCriteria(r))}</span></span>
            <span style="text-align:end;font-weight:700">${esc(fmt(r.price))}</span><span style="text-align:end">${esc(fmt(r.driver_share))}</span><span style="text-align:end">${r.saden_commission} %</span><span style="text-align:end">${r.priority}</span>
            <span style="display:flex;gap:4px;justify-content:flex-end">${when(admin,()=>`<button ${on(edit(r))} style="${BTN_GHOST};padding:5px 9px;font-size:12px">✎</button><button ${on(toggle(r))} style="${BTN_GHOST};padding:5px 9px;font-size:12px;color:${r.active?'var(--rf)':'var(--gf)'}">${esc(r.active?Lx.deactivate:Lx.activate)}</button>`)}</span>
          </div>`))}
      </div></div>
    </div>
  </div>`;
}

Object.assign(K,{
  pricing:['Tarifs','التعريفات'],newRule:['Nouvelle règle tarifaire','قاعدة تعريفة جديدة'],editRule:['Modifier la règle','تعديل القاعدة'],service:['Service','الخدمة'],priority:['Priorité','الأولوية'],
  criteriaHint:['Laissez « Tous » pour ne pas filtrer : la règle la plus précise qui correspond s’applique.','اترك « الكل » لعدم التصفية: تطبق القاعدة الأكثر دقة.'],any:['Tous','الكل'],
  parcelType:['Type de colis','نوع الطرد'],price:['Prix','السعر'],driverShare:['Part livreur','حصة الموزع'],codCommission:['Commission COD','عمولة التحصيل'],
  simulator:['Simulateur de prix','محاكي السعر'],simulate:['Calculer','احسب'],weight:['Poids (kg)','الوزن (كغ)'],payment:['Paiement','الدفع'],
  deliveryFee:['Frais de livraison','معلوم التوصيل'],toRemit:['À reverser à la boutique','المبلغ المرجع للمتجر'],pricingRules:['Règles tarifaires','قواعد التعريفة'],
  pricingHint:['montants figés sur chaque commande à sa création','تحفظ المبالغ في كل طلب عند إنشائه'],criteria:['Critères','المعايير'],defaultRule:['Règle par défaut (obligatoire)','القاعدة الافتراضية (إجبارية)'],
});
