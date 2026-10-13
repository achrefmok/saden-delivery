/* SADEN — §9 QR codes, printable 10×15 label and camera scanner (BarcodeDetector, html5-qrcode fallback, manual entry).
   The scanner lives in its own layer outside #root so the camera survives the app's re-renders. */

const LIBS={
  qr:'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  html5qr:'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  jspdf:'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
};
const libLoads={};
function loadLib(k){
  return libLoads[k]||(libLoads[k]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=LIBS[k];s.async=true;s.onload=()=>res();s.onerror=()=>{delete libLoads[k];rej(new Error('Bibliothèque indisponible (hors connexion ?)'));};document.head.appendChild(s);}));
}

/** QR code as inline SVG (content = parcel reference). Loads the library on first use, then re-renders. */
function qrSvg(text,px=72){
  if(typeof qrcode==='undefined'){loadLib('qr').then(()=>render()).catch(()=>{});return `<div style="width:${px}px;height:${px}px;border:1px solid var(--line);border-radius:4px;background:repeating-linear-gradient(45deg,var(--stripe) 0 2px,transparent 2px 6px)"></div>`;}
  const q=qrcode(0,'M');q.addData(String(text));q.make();
  return `<div style="width:${px}px;height:${px}px;background:#fff;border-radius:4px;line-height:0">${q.createSvgTag({cellSize:4,margin:2,scalable:true})}</div>`;
}

/* ---------- printable label 10×15 cm ---------- */
function labelHtml(o){
  const q=qrcode(0,'M');q.addData(o.ref);q.make();
  const qr=q.createSvgTag({cellSize:4,margin:0,scalable:true});
  const u=L().tnd,cod=o.payment_mode==='prepaid'?L().paid:fmt(o.cod,u);
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Étiquette ${esc(o.ref)}</title><style>
  @page{size:100mm 150mm;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}
  .l{width:100mm;height:150mm;padding:4mm;display:flex;flex-direction:column;gap:2.5mm;overflow:hidden}
  .row{display:flex;justify-content:space-between;align-items:center;gap:3mm}.box{border:0.4mm solid #000;border-radius:1.5mm;padding:2.5mm}
  .k{font-size:7pt;text-transform:uppercase;letter-spacing:.06em;color:#333}.v{font-size:10pt;font-weight:700}.big{font-size:15pt;font-weight:800}
  .qr{width:34mm;height:34mm}.qr svg{width:100%;height:100%}
  .bc{display:flex;justify-content:center}.bc svg{width:72mm;height:auto;display:block}
  @media screen{body{background:#ddd}.l{margin:10px auto;background:#fff;box-shadow:0 2px 10px #0003}}
  </style></head><body><div class="l">
  <div class="row"><div style="display:flex;flex-direction:column;gap:1mm"><div style="display:flex;align-items:center;gap:2mm"><img src="${BRAND.logoPrint}" alt="" style="width:13mm;height:13mm;object-fit:contain"><b style="font-size:13pt;letter-spacing:.06em">${esc(BRAND.full.toUpperCase())}</b></div><div style="font-family:monospace;font-size:17pt;font-weight:700">${esc(o.ref)}</div>
    <div style="font-size:8pt">${esc(dm(o.created_at))} · ${esc(o.intercity?'INTER-VILLES':'LOCAL')}${o.external_ref?' · '+esc(o.external_ref):''}</div></div>
    <div class="qr">${qr}</div></div>
  <div class="bc">${code128Svg(o.ref,{h:46,module:2,font:13})}</div>
  <div class="box" style="border-width:0.7mm"><div class="k">Destinataire</div><div class="big">${esc(o.client_name)}</div><div class="v">${esc(fmtPhone(o.client_phone))}</div>
    <div style="font-size:9.5pt;margin-top:1mm">${esc(o.address)}</div><div class="big" style="margin-top:1mm">${esc(o.dest_city_name||'')}${o.zone_name?' — '+esc(o.zone_name):''}</div></div>
  <div class="box"><div class="k">Expéditeur</div><div class="v">${esc(o.sender_name||o.shop_name||'')}</div><div style="font-size:8.5pt">${esc(o.sender_phone?fmtPhone(o.sender_phone):'')} ${esc(o.sender_address||'')}</div></div>
  <div class="row"><div class="box" style="flex:1;text-align:center"><div class="k">À encaisser (COD)</div><div class="big">${esc(cod)}</div></div>
    <div class="box" style="text-align:center;min-width:24mm"><div class="k">Colis</div><div class="v">${o.pieces||1} pc${o.weight?' · '+o.weight+' kg':''}</div></div></div>
  <div style="font-size:8pt">${esc(o.description||'')}${o.notes?' — '+esc(o.notes):''}</div>
  <div style="margin-top:auto;display:flex;justify-content:space-between;font-size:7.5pt;border-top:0.3mm solid #000;padding-top:1.5mm"><span>${esc(o.origin_agency_name||'')} → ${esc(o.dest_agency_name||'')}</span><span>${esc(location.host)}/?t=${esc(o.ref)}</span></div>
  </div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`;
}
function printLabel(o){
  const w=window.open('','_blank','width=460,height=680');   // opened synchronously (popup blockers)
  if(!w)return toast(L().popupBlocked,'err');
  w.document.write('<p style="font-family:sans-serif">…</p>');
  loadLib('qr').then(()=>{w.document.open();w.document.write(labelHtml(o));w.document.close();}).catch(e=>{w.close();toast(e.message,'err');});
}

/* ---------- scanner ---------- */
const SCAN_ACTIONS={
  staff:[['reception',['Réception en agence','استلام في الوكالة']],['return',['Retour en agence','إرجاع إلى الوكالة']],['inventory',['Inventaire','الجرد']]],
  driver:[['delivery',['Ouvrir la mission','فتح المهمة']]],
};
let SC=null,camStream=null,camLoop=null,h5=null;

function openScanner(action,extra={}){
  const acts=role()==='driver'?SCAN_ACTIONS.driver:SCAN_ACTIONS.staff;
  SC={action:action||acts[0][0],agency_id:role()==='manager'?myAgency()?.id:(state.agencyFilter||''),results:[],manual:'',camera:'starting',last:{},expected:null,scanned:[],report:null,...extra};
  let layer=document.getElementById('scanlayer');
  if(!layer){
    layer=document.createElement('div');layer.id='scanlayer';
    layer.innerHTML='<div id="scanbox"><div id="scancam"></div><div id="scanui"></div></div>';
    document.body.appendChild(layer);
    layer.addEventListener('click',scanClick);layer.addEventListener('input',e=>{if(e.target.dataset.sin)SC[e.target.dataset.sin]=e.target.value;});
    layer.addEventListener('change',e=>{if(e.target.dataset.sch){SC[e.target.dataset.sch]=e.target.value;onScanSettings();}});
    layer.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.sin==='manual'){e.preventDefault();submitManual();}});
  }
  layer.dataset.sd='1';layer.dataset.theme=state.prefs.theme;layer.dataset.d=state.prefs.dir;layer.dir=lang()==='ar'?'rtl':'ltr';
  layer.style.display='flex';
  onScanSettings();startCamera();
}
function closeScanner(){
  stopCamera();SC=null;const l=document.getElementById('scanlayer');if(l)l.style.display='none';
  if(isStaff())refresh(true);
}
async function onScanSettings(){
  if(SC.action==='inventory'){
    SC.expected=null;SC.scanned=[];SC.report=null;renderScan();
    if(!SC.agency_id){renderScan();return;}
    try{SC.expected=(await api('inventory?agency_id='+encodeURIComponent(SC.agency_id))).expected;}catch(e){toast(e.message,'err');}
  }
  renderScan();
}
async function startCamera(){
  const box=document.getElementById('scancam');SC.camera='starting';renderScan();
  if('BarcodeDetector' in window&&navigator.mediaDevices?.getUserMedia){
    try{
      const supported=await BarcodeDetector.getSupportedFormats();
      const det=new BarcodeDetector({formats:['qr_code','code_128','code_39','ean_13'].filter(f=>supported.includes(f))});
      camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      const v=document.createElement('video');v.playsInline=true;v.muted=true;v.srcObject=camStream;box.replaceChildren(v);await v.play();
      camLoop=setInterval(async()=>{try{const c=await det.detect(v);if(c[0])onCode(c[0].rawValue);}catch{}},300);
      SC.camera='on';renderScan();return;
    }catch{stopCamera();}
  }
  try{
    await loadLib('html5qr');if(!SC)return;
    box.innerHTML='<div id="scancam-in"></div>';
    h5=new Html5Qrcode('scancam-in',{verbose:false});
    await h5.start({facingMode:'environment'},{fps:10,qrbox:{width:220,height:220}},txt=>onCode(txt),()=>{});
    if(SC)SC.camera='on';
  }catch{if(h5){try{h5.clear();}catch{}h5=null;}if(SC)SC.camera='error';}
  if(SC)renderScan();
}
function stopCamera(){
  clearInterval(camLoop);camLoop=null;
  if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null;}
  if(h5){const inst=h5;h5=null;try{Promise.resolve(inst.stop()).catch(()=>{}).finally(()=>{try{inst.clear();}catch{}});}catch{try{inst.clear();}catch{}}}
  const box=document.getElementById('scancam');if(box)box.replaceChildren();
}
function submitManual(){const v=(SC.manual||'').trim();if(v){SC.manual='';onCode(v,true);}}

async function onCode(raw,manual){
  if(!SC)return;
  const m=String(raw).match(/[?&]t=([^&#]+)/);let ref=m?m[1]:String(raw);try{ref=decodeURIComponent(ref);}catch{}ref=ref.trim().toUpperCase();
  if(!ref)return;
  const now=Date.now();if(!manual&&SC.last[ref]&&now-SC.last[ref]<2500)return;SC.last[ref]=now;
  navigator.vibrate?.(60);
  if(SC.handler){
    // screen-specific scan (stock entry, bordereau…): the screen decides what a code means
    try{const r=await SC.handler(ref)||{};SC.results.unshift({ref,ok:!r.extra&&!r.error,msg:r.message||'OK'});if(r.extra)navigator.vibrate?.([40,60,40]);}
    catch(e){SC.results.unshift({ref,ok:false,msg:e.message});navigator.vibrate?.([40,60,40]);}
    SC.results=SC.results.slice(0,30);renderScan();return;
  }
  if(SC.action==='inventory'&&!SC.scanned.includes(ref))SC.scanned.unshift(ref);
  const body={code:ref,action:SC.action,agency_id:SC.agency_id||undefined,manifest_id:SC.manifest_id||undefined,lat:state.myPos?.[0],lng:state.myPos?.[1]};
  try{
    const r=await api('scan',{method:'POST',body});
    SC.results.unshift({ref,ok:true,msg:r.message,client:r.order.client_name});
    if(SC.action==='delivery'){closeScanner();state.curId=r.order.id;state.lv='detail';await refresh(true);return;}
    if(SC.onScan)SC.onScan(r);
  }catch(e){SC.results.unshift({ref,ok:false,msg:e.message});navigator.vibrate?.([40,60,40]);}
  SC.results=SC.results.slice(0,30);renderScan();
}
async function finishInventory(){
  try{SC.report=await api('inventory/report',{method:'POST',body:{agency_id:SC.agency_id,scanned:SC.scanned}});}catch(e){toast(e.message,'err');}
  renderScan();
}
function scanClick(e){
  const el=e.target.closest('[data-sact]');if(!el)return;
  const a=el.dataset.sact;
  if(a==='close')closeScanner();
  else if(a==='manual')submitManual();
  else if(a==='retry')startCamera();
  else if(a==='finish')finishInventory();
}

function renderScan(){
  const ui=document.getElementById('scanui');if(!ui||!SC)return;
  const Lx=L(),li=lang()==='ar'?1:0,staff=isStaff();
  const acts=role()==='driver'?SCAN_ACTIONS.driver:SCAN_ACTIONS.staff;
  const opt=(v,l,cur)=>`<option value="${esc(v)}"${String(v)===String(cur)?' selected':''}>${esc(l)}</option>`;
  const inv=SC.action==='inventory';
  const exp=SC.expected||[],expRefs=exp.map(o=>o.ref);
  const missing=exp.filter(o=>!SC.scanned.includes(o.ref)),unexpected=SC.scanned.filter(r=>!expRefs.includes(r));
  const needAgency=staff&&!SC.handler&&(inv||['reception','return'].includes(SC.action))&&role()==='admin';
  ui.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:17px">📷 ${esc(Lx.scanner)}</b><button data-sact="close" class="sbtn">✕</button></div>
    ${SC.title?`<div style="font-weight:600">${esc(SC.title)}</div>`:''}
    ${staff&&!SC.handler?`<label class="slab">${esc(Lx.scanAction)}<select class="fld" data-sch="action">${acts.map(([k,l])=>opt(k,l[li],SC.action)).join('')}</select></label>`:''}
    ${SC.extraUi?SC.extraUi():''}
    ${needAgency?`<label class="slab">${esc(Lx.agencyLbl)}<select class="fld" data-sch="agency_id">${opt('',inv?Lx.choose:Lx.auto,SC.agency_id)}${G().agencies.filter(a=>a.active).map(a=>opt(a.id,a.name,SC.agency_id)).join('')}</select></label>`:''}
    <div style="font-size:12.5px;color:${SC.camera==='error'?'var(--rf)':'var(--mute)'}">${esc(SC.camera==='on'?Lx.camOn:SC.camera==='error'?Lx.camErr:Lx.camStarting)}${SC.camera==='error'?` <button data-sact="retry" class="sbtn">↻</button>`:''}</div>
    <div style="display:flex;gap:6px"><input class="fld" data-sin="manual" value="${esc(SC.manual)}" placeholder="${esc(Lx.manualRef)}" autocapitalize="characters" style="font-family:var(--mono)"><button data-sact="manual" class="sbtn" style="background:var(--orange);color:var(--onOrange);border:none">OK</button></div>
    ${inv?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center">
        <div class="scell"><b>${SC.expected?exp.length:'…'}</b><span>${esc(Lx.invExpected)}</span></div><div class="scell"><b>${SC.scanned.length}</b><span>${esc(Lx.invScanned)}</span></div><div class="scell" style="color:${missing.length?'var(--rf)':'var(--gf)'}"><b>${SC.expected?missing.length:'…'}</b><span>${esc(Lx.invMissing)}</span></div></div>
      ${SC.report?`<div style="padding:10px;border-radius:var(--r);background:var(--gb);color:var(--gf);font-size:12.5px">${esc(Lx.invSaved)} · ${SC.report.missing.length} ${esc(Lx.invMissing)} · ${SC.report.unexpected.length} ${esc(Lx.invUnexpected)}</div>`
        :`<button data-sact="finish" class="sbtn" style="background:var(--navy);color:#fff;border:none" ${SC.agency_id?'':'disabled'}>${esc(Lx.invFinish)}</button>`}
      ${missing.length?`<details><summary style="cursor:pointer;font-size:12.5px">${esc(Lx.invMissing)} (${missing.length})</summary><div class="slist">${missing.map(o=>`<span>${esc(o.ref)} · ${esc(o.client_name)}</span>`).join('')}</div></details>`:''}
      ${unexpected.length?`<details open><summary style="cursor:pointer;font-size:12.5px;color:var(--wf)">${esc(Lx.invUnexpected)} (${unexpected.length})</summary><div class="slist">${unexpected.map(r=>`<span>${esc(r)}</span>`).join('')}</div></details>`:''}`:''}
    <div class="slist">${SC.results.map(r=>`<span style="color:${r.ok?'var(--gf)':'var(--rf)'}">${r.ok?'✓':'✕'} <b style="font-family:var(--mono)">${esc(r.ref)}</b> ${esc(r.client?'· '+r.client+' · ':'· ')}${esc(r.msg)}</span>`).join('')||`<span style="color:var(--mute)">${esc(Lx.scanHint)}</span>`}</div>`;
}

/* styles of the scanner layer (outside the themed root: reuse the theme tokens through data-sd) */
(function(){const st=document.createElement('style');st.textContent=`
#scanlayer{position:fixed;inset:0;z-index:3000;background:oklch(0.1 0.03 262 / .7);display:none;align-items:flex-start;justify-content:center;padding:max(12px,env(safe-area-inset-top)) 10px 12px;overflow:auto}
#scanbox{width:100%;max-width:440px;background:var(--surface,#fff);color:var(--ink,#111);border-radius:14px;overflow:hidden;font-family:var(--font,sans-serif);font-size:14px}
#scancam{background:#000;min-height:220px;display:flex;align-items:center;justify-content:center}#scancam video,#scancam-in{width:100%;max-height:46vh;object-fit:cover}
#scanui{padding:14px;display:flex;flex-direction:column;gap:10px}
.sbtn{padding:8px 12px;border-radius:8px;border:1px solid var(--line,#ccc);background:var(--surface,#fff);color:inherit;font-weight:700;cursor:pointer}
.slab{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--mute,#666)}.slist{display:flex;flex-direction:column;gap:4px;font-size:12.5px;max-height:26vh;overflow:auto}
.scell{display:flex;flex-direction:column;padding:8px;border-radius:8px;background:var(--surface2,#eee)}.scell b{font-size:20px}.scell span{font-size:11px;color:var(--mute,#666)}`;document.head.appendChild(st);})();

Object.assign(K,{
  scanner:['Scanner','الماسح'],scanAction:['Action du scan','نوع العملية'],camOn:['Caméra active — visez le QR code du colis.','الكاميرا تعمل — وجّهها نحو رمز الطرد.'],camStarting:['Ouverture de la caméra…','تشغيل الكاميرا…'],
  camErr:['Caméra indisponible : saisissez la référence.','الكاميرا غير متاحة: أدخل المرجع.'],manualRef:['Saisie manuelle : SD-…','إدخال يدوي: SD-…'],scanHint:['Les colis scannés apparaissent ici.','تظهر الطرود الممسوحة هنا.'],
  invExpected:['attendus','متوقعة'],invScanned:['scannés','ممسوحة'],invMissing:['manquants','ناقصة'],invUnexpected:['non attendus','غير متوقعة'],invFinish:['Terminer l’inventaire','إنهاء الجرد'],invSaved:['Inventaire enregistré','تم حفظ الجرد'],
  label:['Étiquette','الملصق'],popupBlocked:['Autorisez les fenêtres pop-up pour imprimer.','اسمح بالنوافذ المنبثقة للطباعة.'],scanBtn:['Scanner','مسح'],
});
