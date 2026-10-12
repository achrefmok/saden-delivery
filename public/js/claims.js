/* SADEN — « Réclamations » (§27): forward-only status changes, explicit reopening, internal note, history;
   dashboard card with the average rating per agency / city. */

function tplClaims(){
  const Lx=L(),li=lang()==='ar'?1:0,d=state.data,r=d.ratings;
  const dist=[5,4,3,2,1].map(s=>({s,p:r.n?Math.round(r['s'+s]/r.n*100):0}));
  if(!state.claimNotes)state.claimNotes={};
  const save=(c,status,reopen)=>()=>{
    const note=(state.claimNotes[c.id]||'').trim();
    if(reopen&&!note)return toast(Lx.reopenReason,'err');
    act(async()=>{await api('claims/'+c.id,{method:'PATCH',body:{status,internal_note:note||undefined,reopen}});state.claimNotes[c.id]='';if(state.claimHist?.[c.id])state.claimHist[c.id]=(await api(`claims/${c.id}/history`)).events;},Lx.saved);
  };
  const hist=c=>()=>{state.claimHist=state.claimHist||{};if(state.claimHist[c.id]){delete state.claimHist[c.id];render();return;}
    api(`claims/${c.id}/history`).then(h=>{state.claimHist[c.id]=h.events;render();}).catch(e=>toast(e.message,'err'));};
  return `<div class="split" style="display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:var(--gap)">
    <div style="min-width:0;${CARD};overflow:hidden">
      ${d.claims.length?each(d.claims,c=>`<div style="padding:var(--pad);border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="font-family:var(--mono);font-size:12px">RC-${pad4(c.id)}</span><b>${esc(CATS[c.category]?.[li]||'—')}</b><span style="color:var(--mute);font-size:12.5px">${esc(c.order_ref)} · ${esc(c.driver_name||'—')}</span></div>
          <span style="${css(badge(CS[c.status][2]))}">${esc(CS[c.status][li])}</span>
        </div>
        ${when(c.text,()=>`<div style="line-height:1.45;text-wrap:pretty">${esc(c.text)}</div>`)}
        <div style="font-size:12px;color:var(--mute)">${esc(c.client_name)} · ${dm(c.created_at)}${c.updated_at?' · '+esc(Lx.updated)+' '+dm(c.updated_at):''}</div>
        ${when(c.internal_note,()=>`<div style="font-size:12.5px;padding:8px 10px;border-radius:var(--r);background:var(--surface2)">🔒 ${esc(c.internal_note)}</div>`)}
        <div class="no-print" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <input class="fld" style="flex:1;min-width:180px" placeholder="${esc(c.status===3?Lx.reopenReason:Lx.internalNote)}" value="${esc(state.claimNotes[c.id]||'')}" ${onInput(e=>{state.claimNotes[c.id]=e.target.value;},'cn-'+c.id)}>
          ${c.status<3?each(CS.slice(c.status+1),(x,j)=>`<button ${on(save(c,c.status+1+j,false))} style="${BTN_GHOST};padding:6px 10px;font-size:12px">→ ${esc(x[li])}</button>`)+`<button ${on(save(c,c.status,false))} style="${BTN_GHOST};padding:6px 10px;font-size:12px">${esc(Lx.addNote)}</button>`
            :`<button ${on(save(c,1,true))} style="${BTN_GHOST};padding:6px 10px;font-size:12px;color:var(--of)">↺ ${esc(Lx.reopen)}</button>`}
          <button ${on(hist(c))} style="background:none;border:none;color:var(--of);font-weight:600;cursor:pointer;font-size:12px">${esc(Lx.historyShort)}</button>
        </div>
        ${when(state.claimHist?.[c.id],()=>`<div style="display:flex;flex-direction:column;gap:4px;font-size:12px;padding-inline-start:10px;border-inline-start:2px solid var(--line)">${state.claimHist[c.id].length?each(state.claimHist[c.id],e=>`<span><span style="font-family:var(--mono);color:var(--mute)">${dm(e.created_at)} ${hm(e.created_at)}</span> · <b>${esc(e.user_name||'—')}</b> · ${esc(CS[e.old_status]?.[li]||'')} → ${esc(CS[e.new_status]?.[li]||'')}${e.note?' — « '+esc(e.note)+' »':''}</span>`):`<span style="color:var(--mute)">—</span>`}</div>`)}
      </div>`):empty()}
    </div>
    <div style="display:flex;flex-direction:column;gap:var(--gap)">
      <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px">
        <span style="font-size:12px;color:var(--mute)">${esc(Lx.rating)} · 30 j</span>
        <div style="display:flex;align-items:baseline;gap:8px"><span style="font-family:var(--disp);font-size:44px;font-weight:700;line-height:1">${r.n?String(r.avg).replace('.',','):'—'}</span><span style="color:var(--orange);font-size:20px">${'★'.repeat(Math.round(r.avg||0))}<span style="color:var(--line)">${'★'.repeat(5-Math.round(r.avg||0))}</span></span></div>
        <span style="font-size:12px;color:var(--mute)">${r.n} ${esc(Lx.reviews)}</span>
        ${each(dist,x=>`<div style="display:grid;grid-template-columns:22px 1fr 38px;gap:8px;align-items:center;font-size:12px"><span>${x.s}★</span><div style="height:8px;background:var(--surface2);border-radius:999px;overflow:hidden"><div style="width:${x.p}%;height:100%;background:var(--orange)"></div></div><span style="text-align:end;color:var(--mute)">${x.p} %</span></div>`)}
      </div>
      ${tplRatingsCard()}
      <div style="${CARD};padding:var(--pad);font-size:12.5px;line-height:1.5;color:var(--mute);text-wrap:pretty">${esc(Lx.claimRule2)}</div>
    </div>
  </div>`;
}

/** Average driver rating per agency and per city (30 days, inside the user's perimeter). */
function tplRatingsCard(){
  const Lx=L(),rb=state.data?.ratingsBy;
  if(!rb)return '';
  const list=(title,rows)=>`<b style="font-size:12.5px">${esc(title)}</b>${rows.length?each(rows,x=>`<div style="display:flex;justify-content:space-between;font-size:12.5px"><span>${esc(x.name)}</span><span><b>★ ${String(x.avg).replace('.',',')}</b> <span style="color:var(--mute)">(${x.n})</span></span></div>`):`<span style="color:var(--mute);font-size:12px">—</span>`}`;
  return `<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:6px"><span style="font-size:12px;color:var(--mute)">${esc(Lx.rating)} · 30 j</span>${list(Lx.agencies,rb.agencies)}${list(Lx.cities,rb.cities)}</div>`;
}

Object.assign(K,{
  internalNote:['Note interne (non visible du client)…','ملاحظة داخلية…'],addNote:['Ajouter la note','إضافة ملاحظة'],reopen:['Rouvrir','إعادة الفتح'],reopenReason:['Motif de réouverture (obligatoire)','سبب إعادة الفتح (إجباري)'],
  historyShort:['Historique','السجل'],claimRule2:['Les évaluations sont liées à une livraison réelle et ne peuvent être ni modifiées ni supprimées par le livreur. Une réclamation avance sans retour en arrière ; une réclamation fermée peut être rouverte avec un motif, tracé dans l’historique.','التقييمات مرتبطة بتوصيل حقيقي. تتقدم الشكوى دون رجوع؛ يمكن إعادة فتح شكوى مغلقة مع ذكر السبب.'],
});
