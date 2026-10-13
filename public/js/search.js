/* SADEN — §28 global search in the admin/manager header: server-side, grouped results, Enter or a scanned
   QR code opens the parcel record directly. */

let searchTimer=null;
function onSearchInput(e){
  state.q=e.target.value;state.searchOpen=!!state.q.trim();
  clearTimeout(searchTimer);
  if(state.q.trim().length<2){state.searchRes=null;render();return;}
  const term=state.q;
  searchTimer=setTimeout(async()=>{
    try{const af=role()==='admin'&&state.agencyFilter?'&agency_id='+state.agencyFilter:'';const r=await api('search?q='+encodeURIComponent(term)+af);if(state.q===term){state.searchRes=r;render();}}catch{}
  },250);
  render();
}
function openSearchResult(type,id){
  state.searchOpen=false;state.q='';state.searchRes=null;
  if(type==='order')selectOrder(id);
  else if(type==='manifest'){state.page='brd';selectBrd(id);}
  else if(type==='driver'){state.selDrv=id;goPage('map');}
  else if(type==='shop'){state.stf={...(state.stf||{}),shop_id:String(id)};state.stats=null;goPage('stats');}
}
async function searchEnter(){
  const term=(state.q||'').trim();if(!term)return;
  try{
    const af=role()==='admin'&&state.agencyFilter?'&agency_id='+state.agencyFilter:'';
    const r=await api('search?q='+encodeURIComponent(term)+af);
    if(r.exact)return openSearchResult(r.exact.type,r.exact.id);
    if(r.orders.length===1)return openSearchResult('order',r.orders[0].id);
    state.searchRes=r;state.searchOpen=true;render();
  }catch(e){toast(e.message,'err');}
}

function tplSearchBox(){
  const Lx=L(),r=state.searchRes,open=state.searchOpen&&r;
  const group=(title,items,fn)=>items.length?`<div style="padding:6px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mute);background:var(--surface2)">${esc(title)} (${items.length})</div>${each(items,fn)}`:'';
  const row=(type,id,main,sub)=>`<div ${on(()=>openSearchResult(type,id))} style="padding:8px 10px;border-top:1px solid var(--line);cursor:pointer;display:flex;flex-direction:column;gap:1px"><span style="font-weight:600">${main}</span><span style="font-size:12px;color:var(--mute)">${sub}</span></div>`;
  const total=r?r.orders.length+r.manifests.length+r.shops.length+r.drivers.length:0;
  return `<div class="sbox no-print" style="position:relative;flex:1;min-width:180px;max-width:420px;display:flex;gap:6px">
    <input type="search" class="fld" ${onInput(onSearchInput,'q')} value="${esc(state.q)}" placeholder="${esc(Lx.search)}" autocomplete="off" style="background:var(--surface)">
    <button ${on(()=>openScanner('lookup'))} title="${esc(Lx.scanOpen)}" style="${BTN_GHOST};padding:8px 10px">📷</button>
    ${when(open,()=>`<div style="position:absolute;top:calc(100% + 4px);inset-inline:0;z-index:900;${CARD};box-shadow:0 12px 30px oklch(0 0 0 / .18);max-height:70vh;overflow:auto">
      ${total?group(Lx.parcelsTotal,r.orders,o=>row('order',o.id,`<span style="font-family:var(--mono)">${esc(o.ref)}</span> · ${esc(o.client_name)}`,`${esc(stL(o.status))} · ${esc(fmtPhone(o.client_phone))}${o.external_ref?' · '+esc(o.external_ref):''} · ${esc(o.shop_name||o.sender_name||'')}`))
        +group(Lx.brd,r.manifests,m=>row('manifest',m.id,`<span style="font-family:var(--mono)">${esc(m.ref)}</span>`,`${esc(btL(m.type||'transfer'))} · ${esc(m.from_city)}${m.to_city!==m.from_city?' → '+esc(m.to_city):''}`))
        +group(Lx.rShop,r.shops,s=>row('shop',s.id,esc(s.shop_name||s.name),esc(fmtPhone(s.phone))))
        +group(Lx.drivers,r.drivers,d=>row('driver',d.id,esc(d.name),esc(fmtPhone(d.phone))))
        :`<div style="padding:12px;color:var(--mute)">${esc(Lx.noResult)}</div>`}
      <div ${on(()=>{state.searchOpen=false;goPage('orders');state.q=state.q;})} style="padding:8px 10px;border-top:1px solid var(--line);font-size:12px;color:var(--of);cursor:pointer;font-weight:600">${esc(Lx.filterList)} →</div>
    </div>`)}
  </div>`;
}

document.addEventListener('keydown',e=>{
  if(e.target?.dataset?.k!=='q')return;
  if(e.key==='Enter'){e.preventDefault();searchEnter();}
  else if(e.key==='Escape'){state.searchOpen=false;render();}
});
document.addEventListener('click',e=>{if(state.searchOpen&&!e.target.closest('.sbox')){state.searchOpen=false;render();}});

/* scanner action « open the record »: looks the code up instead of changing anything */
SCAN_ACTIONS.staff.unshift(['lookup',['Ouvrir la fiche','فتح البطاقة']]);
const baseOnCode=onCode;
onCode=async function(raw,manual){
  if(SC?.action!=='lookup')return baseOnCode(raw,manual);
  const m=String(raw).match(/[?&]t=([^&#]+)/);let ref=m?m[1]:String(raw);try{ref=decodeURIComponent(ref);}catch{}ref=ref.trim().toUpperCase();
  try{const r=await api('search?q='+encodeURIComponent(ref));
    if(r.exact){closeScanner();openSearchResult(r.exact.type,r.exact.id);return;}
    SC.results.unshift({ref,ok:false,msg:L().noResult});}catch(e){SC.results.unshift({ref,ok:false,msg:e.message});}
  renderScan();
};

Object.assign(K,{noResult:['Aucun résultat.','لا توجد نتائج.'],filterList:['Filtrer la liste des commandes','تصفية قائمة الطلبات'],scanOpen:['Scanner un QR pour ouvrir la fiche','امسح الرمز لفتح البطاقة']});
