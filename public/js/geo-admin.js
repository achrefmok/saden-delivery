/* SADEN — admin screens « Agences » and « Villes / Zones » (§1, §5, §6). Uses globals from app.js. */

const emptyAgency=()=>({id:null,name:'',city_id:'',address:'',phone:'',lat:'',lng:'',manager_id:'',auto_assign:false,zone_ids:[]});
const geoSaveRefresh=async()=>{state.geo=await api('geo');};

function tplAgencies(){
  const Lx=L(),g=G();
  if(!state.agform)state.agform=emptyAgency();
  const f=state.agform;
  const managers=(state.users||[]).filter(u=>u.role==='manager');
  const cityZones=g.zones.filter(z=>z.city_id===+f.city_id);
  const save=()=>act(async()=>{
    const cur=state.agform;
    const body={name:cur.name,city_id:cur.city_id,address:cur.address,phone:cur.phone,lat:cur.lat===''?null:cur.lat,lng:cur.lng===''?null:cur.lng,manager_id:cur.manager_id||null,auto_assign:!!cur.auto_assign,zone_ids:cur.zone_ids};
    if(cur.id)await api('agencies/'+cur.id,{method:'PATCH',body});else await api('agencies',{method:'POST',body});
    state.agform=emptyAgency();await geoSaveRefresh();
  },Lx.saved);
  const edit=a=>()=>{state.agform={id:a.id,name:a.name,city_id:String(a.city_id),address:a.address||'',phone:a.phone||'',lat:a.lat??'',lng:a.lng??'',manager_id:a.manager_id?String(a.manager_id):'',auto_assign:a.auto_assign,zone_ids:[...a.zone_ids]};render();scrollTo(0,0);};
  const toggle=a=>()=>act(async()=>{await api('agencies/'+a.id,{method:'PATCH',body:{active:!a.active}});await geoSaveRefresh();},Lx.saved);
  const toggleZone=id=>()=>{const z=new Set(state.agform.zone_ids);z.has(id)?z.delete(id):z.add(id);state.agform={...state.agform,zone_ids:[...z]};render();};
  return `<div class="split" style="display:grid;grid-template-columns:minmax(280px,400px) minmax(0,1fr);gap:var(--gap);align-items:start">
    <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:12px">
      <b style="font-size:16px">${esc(f.id?Lx.editAgency:Lx.newAgency)}</b>
      ${field(Lx.name2,input('ag-name','agform','name','placeholder="Agence Sousse"'))}
      ${field(Lx.city,select('ag-city','agform','city_id',[['',Lx.choose],...cityOptions()],true))}
      ${field(Lx.address,input('ag-addr','agform','address'))}
      ${field(Lx.phone,input('ag-phone','agform','phone','type="tel" inputmode="tel"'))}
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
        ${field('Latitude',input('ag-lat','agform','lat','inputmode="decimal"'))}${field('Longitude',input('ag-lng','agform','lng','inputmode="decimal"'))}
        <button ${on(()=>useGps('agform'))} title="${esc(Lx.useGps)}" style="${BTN_GHOST};min-height:42px">◎</button>
      </div>
      ${field(Lx.vManager,select('ag-mgr','agform','manager_id',[['','—'],...managers.map(m=>[m.id,m.name])]))}
      <label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" ${onInput(e=>{state.agform={...state.agform,auto_assign:e.target.checked};},'ag-auto')} ${f.auto_assign?'checked':''}> ${esc(Lx.autoAssignMode)}</label>
      ${when(f.city_id,()=>`<div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:12px;color:var(--mute)">${esc(Lx.servedZones)}</span>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${cityZones.length?each(cityZones,z=>`<button ${on(toggleZone(z.id))} style="${css({...chip(f.zone_ids.includes(z.id)),fontSize:12.5,padding:'6px 11px',opacity:z.active?1:.5})}">${esc(z.name)}</button>`):`<span style="color:var(--mute)">${esc(Lx.noZones)}</span>`}</div></div>`)}
      <div style="display:flex;gap:8px"><button ${on(save)} style="${BTN_PRIMARY};flex:1">${spin()}${esc(Lx.save)}</button>${when(f.id,()=>`<button ${on(()=>{state.agform=emptyAgency();render();})} style="${BTN_GHOST}">${esc(Lx.cancel)}</button>`)}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:var(--gap)">
      ${g.agencies.length?each(g.agencies,a=>{const c=cityById(a.city_id);return `<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:8px;${a.active?'':'opacity:.6'}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div style="display:flex;flex-direction:column;gap:2px;min-width:0"><b style="font-size:15px">${esc(a.name)}</b><span style="color:var(--mute);font-size:12.5px">${esc(cityLabel(c))}</span></div>
          <span style="${css(badge(a.active?'g':'n'))}">${esc(a.active?Lx.active:Lx.inactive)}</span></div>
        <span style="font-size:12.5px">${esc(Lx.vManager)} : <b>${esc(a.manager_name||'—')}</b></span>
        <span style="font-size:12.5px;color:var(--mute)">${a.zone_ids.length} ${esc(Lx.zonesN)} · ${esc(a.auto_assign?Lx.autoOn:Lx.autoOff)}${a.phone?' · '+esc(a.phone):''}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button ${on(edit(a))} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">✎ ${esc(Lx.edit)}</button><button ${on(toggle(a))} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px;color:${a.active?'var(--rf)':'var(--gf)'}">${esc(a.active?Lx.deactivate:Lx.activate)}</button></div>
      </div>`;}):`<div style="${CARD}">${empty()}</div>`}
    </div>
  </div>`;
}

function tplGeo(){
  const Lx=L(),g=G();
  if(!state.geoSel)state.geoSel={gov:g.governorates[0]?.id||null,city:null};
  if(!state.gform)state.gform={name:''};
  if(!state.cform2)state.cform2={name:'',lat:'',lng:''};
  if(!state.zform)state.zform={name:'',lat:'',lng:''};
  const sel=state.geoSel;
  const cities=g.cities.filter(c=>c.governorate_id===sel.gov);
  if(sel.city&&!cities.some(c=>c.id===sel.city))sel.city=null;
  if(!sel.city&&cities[0])sel.city=cities[0].id;
  const zones=g.zones.filter(z=>z.city_id===sel.city);
  const ll=v=>v===''?null:v;
  const addGov=()=>act(async()=>{const r=await api('geo/governorates',{method:'POST',body:state.gform});state.gform={name:''};await geoSaveRefresh();state.geoSel={gov:r.governorate.id,city:null};},Lx.saved);
  const addCity=()=>act(async()=>{const f=state.cform2;const r=await api('geo/cities',{method:'POST',body:{governorate_id:sel.gov,name:f.name,lat:ll(f.lat),lng:ll(f.lng)}});state.cform2={name:'',lat:'',lng:''};await geoSaveRefresh();state.geoSel={...state.geoSel,city:r.city.id};},Lx.saved);
  const addZone=()=>act(async()=>{const f=state.zform;await api('geo/zones',{method:'POST',body:{city_id:sel.city,name:f.name,lat:ll(f.lat),lng:ll(f.lng)}});state.zform={name:'',lat:'',lng:''};await geoSaveRefresh();},Lx.saved);
  const patch=(kind,x,body)=>()=>act(async()=>{await api(`geo/${kind}/${x.id}`,{method:'PATCH',body});await geoSaveRefresh();},Lx.saved);
  const rename=(kind,x)=>()=>{const n=prompt(Lx.name2,x.name);if(n&&n.trim()&&n!==x.name)patch(kind,x,{name:n.trim()})();};
  const here=(kind,x)=>()=>{if(!navigator.geolocation)return toast(Lx.gpsOff,'err');navigator.geolocation.getCurrentPosition(p=>patch(kind,x,{lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6)})(),()=>toast(Lx.gpsOff,'err'),{enableHighAccuracy:true,timeout:15000});};
  const col=(title,body)=>`<div style="${CARD};overflow:hidden;display:flex;flex-direction:column;min-width:0"><div style="padding:var(--pad);border-bottom:1px solid var(--line)"><b>${esc(title)}</b></div>${body}</div>`;
  const row=(x,onSel,selected,kind,extra='')=>`<div style="display:flex;align-items:center;gap:8px;padding:9px var(--pad);border-bottom:1px solid var(--line);background:${selected?'var(--surface2)':'transparent'};${x.active===false?'opacity:.55':''}">
      <span ${onSel?on(onSel):''} style="flex:1;min-width:0;cursor:${onSel?'pointer':'default'};font-weight:${selected?700:500}">${esc(x.name)}${extra}</span>
      ${when(kind,()=>`<button ${on(rename(kind,x))} title="${esc(Lx.edit)}" style="border:none;background:none;cursor:pointer">✎</button>`)}
      ${when(kind&&kind!=='governorates',()=>`<button ${on(here(kind,x))} title="${esc(Lx.useGps)}" style="border:none;background:none;cursor:pointer;color:${x.lat!=null?'var(--gf)':'var(--mute)'}">◎</button>
        <button ${on(patch(kind,x,{active:!x.active}))} style="${BTN_GHOST};padding:4px 8px;font-size:12px;color:${x.active?'var(--rf)':'var(--gf)'}">${esc(x.active?Lx.deactivate:Lx.activate)}</button>`)}
    </div>`;
  const addForm=(key,obj,fn,withPos)=>`<div style="padding:var(--pad);display:flex;flex-direction:column;gap:8px;background:var(--surface2)">
      <div style="display:flex;gap:6px">${input(key+'-n',obj,'name',`placeholder="${esc(Lx.name2)}"`)}<button ${on(fn)} style="${BTN_PRIMARY};padding:8px 12px">+</button></div>
      ${when(withPos,()=>`<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:6px">${input(key+'-lat',obj,'lat','placeholder="Latitude" inputmode="decimal"')}${input(key+'-lng',obj,'lng','placeholder="Longitude" inputmode="decimal"')}<button ${on(()=>useGps(obj))} title="${esc(Lx.useGps)}" style="${BTN_GHOST};padding:6px 10px">◎</button></div>`)}
    </div>`;
  return `<div style="color:var(--mute);font-size:12.5px">${esc(Lx.geoHint)}</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--gap);align-items:start">
    ${col(Lx.governorates,each(g.governorates,x=>row(x,()=>{state.geoSel={gov:x.id,city:null};render();},x.id===sel.gov,'governorates',` <span style="color:var(--mute);font-size:12px">· ${g.cities.filter(c=>c.governorate_id===x.id).length}</span>`))+addForm('gv','gform',addGov,false))}
    ${col(Lx.cities,(cities.length?each(cities,x=>row(x,()=>{state.geoSel={...sel,city:x.id};render();},x.id===sel.city,'cities',` <span style="color:var(--mute);font-size:12px">· ${g.zones.filter(z=>z.city_id===x.id).length} ${esc(Lx.zonesN)}</span>`)):empty())+when(sel.gov,()=>addForm('ct','cform2',addCity,true)))}
    ${col(Lx.zonesTitle+(sel.city?' · '+(cityById(sel.city)?.name||''):''),(zones.length?each(zones,x=>row(x,null,false,'zones')):empty(Lx.noZones))+when(sel.city,()=>addForm('zn','zform',addZone,true)))}
  </div>`;
}

Object.assign(K,{
  newAgency:['Nouvelle agence','وكالة جديدة'],editAgency:['Modifier l’agence','تعديل الوكالة'],name2:['Nom','الاسم'],city:['Ville','المدينة'],save:['Enregistrer','حفظ'],edit:['Modifier','تعديل'],
  autoAssignMode:['Affectation automatique des colis','الإسناد الآلي للطرود'],servedZones:['Zones desservies','المناطق المخدومة'],noZones:['Aucune zone pour cette ville.','لا توجد مناطق لهذه المدينة.'],
  zonesN:['zones','مناطق'],autoOn:['affectation auto','إسناد آلي'],autoOff:['affectation manuelle','إسناد يدوي'],
  governorates:['Gouvernorats','الولايات'],cities:['Villes','المدن'],zonesTitle:['Zones','المناطق'],
  geoHint:['Ajoutez un gouvernorat, une ville ou une zone sans modifier le code. Une zone désactivée n’est plus proposée dans les formulaires ; ◎ enregistre votre position actuelle comme centre.','أضف ولاية أو مدينة أو منطقة دون تعديل البرمجة. ◎ يسجّل موقعك الحالي كمركز.'],
});
