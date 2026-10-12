/* SADEN — « API partenaires » (§19, §20): partners, keys shown once, webhook settings and delivery log. */

function tplPartners(){
  const Lx=L(),P=state.partners,W=state.webhooks||[];
  if(!P)return `<div style="${CARD};padding:24px"><span class="spin"></span></div>`;
  if(!state.ptform)state.ptform={name:'',agency_id:String(homeAgency()?.id||''),shop_id:'',webhook_url:''};
  const shops=state.data?.shops||[];
  const reload=async()=>{[state.partners,state.webhooks]=await Promise.all([api('partners').then(r=>r.partners),api('webhooks').then(r=>r.deliveries)]);};
  const showSecret=(title,rows)=>setState({modal:{type:'secret',title,rows}});
  const create=()=>act(async()=>{const r=await api('partners',{method:'POST',body:state.ptform});state.ptform=null;await reload();showSecret(r.partner.name,[[Lx.apiKey,r.api_key],[Lx.webhookSecret,r.webhook_secret]]);},Lx.saved);
  const rotate=p=>()=>{if(!confirm(Lx.rotateConfirm))return;act(async()=>{const r=await api(`partners/${p.id}/rotate`,{method:'POST'});await reload();showSecret(p.name,[[Lx.apiKey,r.api_key]]);});};
  const secret=p=>()=>act(async()=>{const r=await api(`partners/${p.id}/secret`,{method:'POST'});showSecret(p.name,[[Lx.webhookSecret,r.webhook_secret]]);});
  const patch=(p,body)=>()=>act(async()=>{await api('partners/'+p.id,{method:'PATCH',body});await reload();},Lx.saved);
  const editUrl=p=>()=>{const u=prompt(Lx.webhookUrl,p.webhook_url||'https://');if(u!==null)patch(p,{webhook_url:u.trim()||null})();};
  const resend=w=>()=>act(async()=>{const r=await api(`webhooks/${w.id}/resend`,{method:'POST'});await reload();toast(r.ok?Lx.whDelivered:(Lx.whFailed+' : '+(r.last_error||'')),r.ok?'ok':'err');});
  const WS={pending:'w',delivered:'g',failed:'r'};
  return `<div class="split" style="display:grid;grid-template-columns:minmax(280px,380px) minmax(0,1fr);gap:var(--gap);align-items:start">
    <div style="display:flex;flex-direction:column;gap:var(--gap)">
      <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px">
        <b style="font-size:16px">${esc(Lx.newPartner)}</b>
        ${field(Lx.name2,input('pt-name','ptform','name','placeholder="Gafsa Mall"'))}
        ${field(Lx.originAgency,select('pt-ag','ptform','agency_id',agencyOptions()))}
        ${field(Lx.shopOpt,select('pt-shop','ptform','shop_id',[['',Lx.partnerMulti],...shops.map(s=>[s.id,s.shop_name])]))}
        ${field(Lx.webhookUrl,input('pt-url','ptform','webhook_url','placeholder="https://partenaire.tn/webhooks/saden" inputmode="url"'))}
        <button ${on(create)} style="${BTN_PRIMARY}">${spin()}${esc(Lx.createKey)}</button>
        <span style="font-size:12px;color:var(--mute)">${esc(Lx.keyOnce)} — <a href="https://github.com/achrefmok/saden-delivery/blob/main/docs/API.md" target="_blank" rel="noopener">docs/API.md</a></span>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:var(--gap);min-width:0">
      <div style="${CARD};overflow:hidden">
        <div style="padding:var(--pad)"><b>${esc(Lx.partnersList)}</b></div>
        ${P.length?each(P,p=>`<div style="padding:var(--pad);border-top:1px solid var(--line);display:flex;flex-direction:column;gap:6px;${p.active?'':'opacity:.6'}">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b style="font-size:15px">${esc(p.name)}</b><span style="${css(badge(p.active?'g':'n'))}">${esc(p.active?Lx.active:Lx.inactive)}</span></div>
          <span style="font-size:12.5px;color:var(--mute)">${esc(p.agency_name)}${p.shop_name?' · '+esc(p.shop_name):''} · <span style="font-family:var(--mono)">${esc(p.key_prefix)}…</span> · ${p.orders} ${esc(Lx.ordersN)} · ${esc(Lx.lastUse)} ${p.last_used_at?ago(p.last_used_at):'—'}</span>
          <span style="font-size:12.5px">${esc(Lx.webhookUrl)} : <span style="font-family:var(--mono)">${esc(p.webhook_url||'—')}</span>${p.failed_webhooks?` · <b style="color:var(--rf)">${p.failed_webhooks} ${esc(Lx.whFailedN)}</b>`:''}</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button ${on(editUrl(p))} style="${BTN_GHOST};padding:6px 10px;font-size:12px">✎ Webhook</button>
            <button ${on(rotate(p))} style="${BTN_GHOST};padding:6px 10px;font-size:12px">🔑 ${esc(Lx.rotateKey)}</button>
            <button ${on(secret(p))} style="${BTN_GHOST};padding:6px 10px;font-size:12px">${esc(Lx.newSecret)}</button>
            <button ${on(patch(p,{active:!p.active}))} style="${BTN_GHOST};padding:6px 10px;font-size:12px;color:${p.active?'var(--rf)':'var(--gf)'}">${esc(p.active?Lx.deactivate:Lx.activate)}</button>
          </div></div>`):empty()}
      </div>
      <div style="${CARD};overflow:hidden">
        <div style="padding:var(--pad)"><b>${esc(Lx.webhookLog)}</b> <span style="font-size:12px;color:var(--mute)">· ${esc(Lx.webhookRule)}</span></div>
        <div style="overflow-x:auto"><div style="min-width:680px">${W.length?each(W,w=>`
          <div style="display:grid;grid-template-columns:90px 110px minmax(0,1fr) 100px 60px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px var(--pad);border-top:1px solid var(--line);font-size:12.5px">
            <span style="font-family:var(--mono);color:var(--mute)">${dm(w.created_at)} ${hm(w.created_at)}</span><span>${esc(w.partner_name)}</span><span><b>${esc(w.event)}</b> · <span style="font-family:var(--mono)">${esc(w.ref||'')}</span></span>
            <span><span style="${css(badge(WS[w.status]||'n'))}">${esc(w.status)}</span></span><span>${w.attempts}/3</span>
            <span style="color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(w.last_error||'')}">${esc(w.last_status?'HTTP '+w.last_status:'')}${w.last_error?' · '+esc(w.last_error):''}</span>
            <button ${on(resend(w))} style="${BTN_GHOST};padding:5px 9px;font-size:12px">↻ ${esc(Lx.resend)}</button></div>`):empty()}</div></div>
      </div>
    </div>
  </div>`;
}

Object.assign(K,{
  partners:['API partenaires','واجهة الشركاء'],newPartner:['Nouveau partenaire API','شريك جديد'],partnerMulti:['Plusieurs boutiques (nom envoyé par l’API)','عدة متاجر'],
  webhookUrl:['URL du webhook','رابط الإشعارات'],createKey:['Créer et générer la clé','إنشاء المفتاح'],keyOnce:['La clé et le secret ne sont affichés qu’une seule fois.','يظهر المفتاح مرة واحدة فقط.'],
  partnersList:['Partenaires','الشركاء'],ordersN:['commandes','طلبات'],lastUse:['dernier appel','آخر استعمال'],whFailedN:['webhooks en échec','إشعارات فاشلة'],
  rotateKey:['Nouvelle clé','مفتاح جديد'],newSecret:['Nouveau secret','سر جديد'],rotateConfirm:['L’ancienne clé cessera immédiatement de fonctionner. Continuer ?','سيتوقف المفتاح القديم فورا. متابعة؟'],
  webhookLog:['Journal des webhooks','سجل الإشعارات'],webhookRule:['signés HMAC-SHA256, 3 tentatives max','موقعة HMAC-SHA256، 3 محاولات'],resend:['Renvoyer','إعادة الإرسال'],
  whDelivered:['Webhook livré','تم إرسال الإشعار'],whFailed:['Échec du webhook','فشل الإشعار'],apiKey:['Clé API','مفتاح API'],webhookSecret:['Secret de signature des webhooks','سر توقيع الإشعارات'],
  secretOnce:['Copiez ces valeurs maintenant : elles ne seront plus jamais affichées.','انسخ هذه القيم الآن: لن تظهر مجددا.'],copy:['Copier','نسخ'],
});
