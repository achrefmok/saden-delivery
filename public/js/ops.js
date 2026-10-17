/* SADEN — « Suivi colis » (operations follow-up): problems queue (calls, appointment, treatment), history, tasks,
   flagged / suspect / outstanding parcels; actions strip in the parcel detail; tasks counter in the top bar. */

const OPS_TABS=[['problems',['Problèmes','المشاكل']],['history',['Historique problèmes','سجل المشاكل']],['tasks',['Tâches','المهام']],
  ['flagged',['Colis signalés','طرود مُبلّغ عنها']],['suspects',['Colis suspects','طرود مشبوهة']],['outstanding',['En souffrance','طرود متأخرة']]];
const PB_TYPES=[['absent',['Client absent','الحريف غائب']],['injoignable',['Injoignable','تعذر الاتصال']],['ne_repond_pas',['Ne répond pas','لا يرد']],
  ['adresse_erronee',['Adresse erronée','عنوان خاطئ']],['numero_errone',['Numéro erroné','رقم خاطئ']],['rdv',['Rendez-vous','موعد']],['refus',['Refus / annulé','رفض / إلغاء']],
  ['non_serieux',['Client non sérieux','حريف غير جدي']],['montant_incorrect',['Montant incorrect','مبلغ غير صحيح']],['endommage',['Endommagé','تالف']],['autre',['Autre','أخرى']]];
const pbL=k=>(PB_TYPES.find(x=>x[0]===k)||[k,[k,k]])[1][li()];
const PB_TONE={absent:'o',injoignable:'r',ne_repond_pas:'w',adresse_erronee:'r',numero_errone:'r',rdv:'i',refus:'r',non_serieux:'r',montant_incorrect:'w',endommage:'r',autre:'n'};
const CALL_OUT=[['joint',['Client joint','تم الاتصال']],['ne_repond_pas',['Ne répond pas','لا يرد']],['injoignable',['Injoignable / éteint','تعذر الاتصال']],['numero_errone',['Numéro erroné','رقم خاطئ']],['rappeler',['À rappeler','إعادة الاتصال']]];
const TASK_TYPES=[['rdv',['Rendez-vous','موعد']],['rappel',['Rappel','تذكير']],['probleme',['Problème','مشكلة']],['verification',['Vérification','تحقق']],['autre',['Autre','أخرى']]];
const taskL=k=>(TASK_TYPES.find(x=>x[0]===k)||[k,[k,k]])[1][li()];
const opsAg=()=>role()==='admin'&&state.agencyFilter?'agency_id='+encodeURIComponent(state.agencyFilter):'';
const telLink=p=>p?`<a href="tel:${esc(String(p).replace(/[^\d+]/g,''))}" style="color:inherit">${esc(fmtPhone(p))}</a>`:'—';
const localDT=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,16);};

async function loadOps(){
  const tab=state.opsTab||'problems',f=state.opsF||{},qs=new URLSearchParams(opsAg());
  let data;
  if(tab==='problems'||tab==='history'){
    qs.set('status',tab==='history'?'treated':'open');
    for(const k of ['type','driver_id','attempts','q','from','to','false_problem','hide_delivered'])if(f[k])qs.set(k,f[k]);
    data=await api('problems?'+qs);
  }else if(tab==='tasks'){qs.set('status',f.tstatus||'open');if(f.due)qs.set('due',f.due);data=await api('tasks?'+qs);}
  else if(tab==='outstanding'){qs.set('days',f.days||3);qs.set('driver_days',f.driver_days||2);data=await api('parcels/outstanding?'+qs);}
  else data=await api(`parcels/${tab}?`+qs);
  if((state.opsTab||'problems')===tab)state.ops={tab,data};
}
const reloadOps=()=>{state.ops=null;render();loadOps().then(render).catch(e=>toast(e.message,'err'));};
async function loadTaskCount(){if(isStaff())try{state.taskCount=await api('tasks/count?'+opsAg());}catch{}}

function tplOps(){
  const Lx=L(),tab=state.opsTab||(state.opsTab='problems'),s=state.ops&&state.ops.tab===tab?state.ops:null;
  if(!s&&state._opsReq!==tab){state._opsReq=tab;loadOps().catch(e=>toast(e.message,'err')).finally(()=>{state._opsReq=null;render();});}
  const tc=state.taskCount;
  const tabs=`<div class="no-print" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px">${each(OPS_TABS,([k,l])=>`<button ${on(()=>{state.opsTab=k;state.ops=null;render();loadOps().then(render).catch(e=>toast(e.message,'err'));})} data-otab="${k}" style="${css(chip(tab===k))}">${esc(l[li()])}${k==='tasks'&&tc?.open?` <span style="background:var(--orange);color:var(--onOrange);border-radius:999px;padding:0 6px;font-size:11px">${tc.open}</span>`:''}</button>`)}</div>`;
  const body=!s?`<div style="${CARD};padding:24px"><span class="spin"></span></div>`:({problems:tplProblems,history:tplProblems,tasks:tplTasks,flagged:tplParcelList,suspects:tplParcelList,outstanding:tplParcelList}[tab])(s);
  return tabs+body+tplOpsModal();
}

/* ---------------------------------------------------------------- problems + history */
function tplProblems(s){
  const Lx=L(),hist=s.tab==='history',d=s.data,list=d.problems,f=state.opsF||(state.opsF={});
  const drivers=(state.data?.drivers||[]);
  const typeChips=`<div style="display:flex;gap:6px;flex-wrap:wrap">${each(PB_TYPES.filter(([k])=>d.by_type[k]||(f.type||'').split(',').includes(k)),([k,l])=>{const onn=(f.type||'').split(',').includes(k);
    return `<button ${on(()=>{const set_=new Set((f.type||'').split(',').filter(Boolean));onn?set_.delete(k):set_.add(k);state.opsF={...f,type:[...set_].join(',')};reloadOps();})} style="${css(chip(onn))}">${esc(l[li()])} <b>${d.by_type[k]||0}</b></button>`;})}</div>`;
  const filters=`<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px">${typeChips}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px;align-items:end">
      ${field(Lx.searchK,input('of-q','opsF','q','placeholder="SD-… / client / tél."'))}
      ${field(Lx.driverK,select('of-d','opsF','driver_id',[['',Lx.any],...drivers.map(x=>[x.id,x.name])]))}
      ${field(Lx.attemptsK,select('of-a','opsF','attempts',[['',Lx.any],['0','0'],['1','1'],['2','2'],['3','3'],['4','+3']]))}
      ${field(Lx.periodFrom,input('of-from','opsF','from','type="date"'))}${field(Lx.periodTo,input('of-to','opsF','to','type="date"'))}
      ${hist?field(Lx.falseProblem,select('of-fp','opsF','false_problem',[['',Lx.any],['1',Lx.yes],['0',Lx.no]])):''}
      <label style="display:flex;gap:6px;align-items:center;font-size:12.5px"><input type="checkbox" ${f.hide_delivered?'checked':''} ${on(()=>{state.opsF={...f,hide_delivered:f.hide_delivered?'':'1'};reloadOps();})}> ${esc(Lx.hideDelivered)}</label>
      <button ${on(reloadOps)} style="${BTN_PRIMARY};min-height:42px">${esc(Lx.apply)}</button>
    </div></div>`;
  const cols=hist?'110px 120px minmax(0,1fr) 140px minmax(0,1.2fr) 70px 150px minmax(0,1.2fr)':'110px 120px minmax(0,1fr) 140px minmax(0,1.2fr) 60px minmax(0,1fr) 90px 150px';
  const head=hist?['Colis',Lx.problemK,Lx.client,Lx.phone,Lx.noteK,Lx.callsK,Lx.treatedBy,Lx.resolutionK]:['Colis',Lx.problemK,Lx.client,Lx.phone,Lx.noteK,Lx.attemptsShort,Lx.driverK,Lx.callsK,''];
  const rows=list.length?each(list,p=>`<div style="display:grid;grid-template-columns:${cols};gap:10px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line)" data-problem="${p.id}">
      <span ${on(()=>selectOrder(p.order_id))} style="font-family:var(--mono);font-size:12px;cursor:pointer;text-decoration:underline dotted">${esc(p.ref)}<br><span style="${css(stB(p.order_status))};font-family:var(--font)">${esc(stL(p.order_status))}</span></span>
      <span><span style="${css(badge(PB_TONE[p.type]||'n'))}">${esc(pbL(p.type))}</span>${p.rdv_at?`<br><span style="font-size:11.5px">📅 ${esc(dtm(p.rdv_at))}</span>`:''}</span>
      <span>${esc(p.client_name)}<br><span style="font-size:11.5px;color:var(--mute)">${esc(p.shop_name||'')} · ${esc(fmt(p.cod))}</span></span>
      <span style="font-size:12.5px">${telLink(p.client_phone)}</span>
      <span style="font-size:12.5px">${esc(p.note||'—')}<br><span style="font-size:11px;color:var(--mute)">${esc(dtm(p.created_at))}${p.created_by_name?' · '+esc(p.created_by_name):''}</span></span>
      ${hist?`<span>📞 ${p.calls}</span><span style="font-size:12.5px">${esc(p.treated_by_name||'')}<br><span style="font-size:11px;color:var(--mute)">${esc(dtm(p.treated_at))}</span></span>
        <span style="font-size:12.5px">${p.false_problem?`<span style="${css(badge('w'))}">${esc(Lx.falseProblem)}</span> `:''}${esc(p.resolution||'')}</span>`
      :`<span style="text-align:center;font-weight:700">${p.order_attempts}</span><span style="font-size:12.5px">${esc(p.driver_name||'—')}<br>${p.driver_phone?telLink(p.driver_phone):''}</span>
        <span><button ${on(()=>{state.opsModal={kind:'call',p,outcome:'joint',note:''};render();})} style="${BTN_GHOST};padding:5px 9px;font-size:12px">📞 ${p.calls}</button></span>
        <span style="display:flex;gap:4px;justify-content:flex-end"><button ${on(()=>{state.opsModal={kind:'treat',p,resolution:'',action:'replan',rdv_at:'',false_problem:false};render();})} style="${BTN_PRIMARY};padding:6px 10px;font-size:12px">${esc(Lx.treatK)}</button></span>`}
    </div>`):empty(hist?Lx.noHistory:Lx.noProblem);
  return `${filters}<div style="${CARD};overflow:hidden"><div style="padding:var(--pad);display:flex;justify-content:space-between"><b>${esc(hist?Lx.historyTitle:Lx.problemsTitle)} (${list.length})</b></div>
    <div style="overflow-x:auto"><div style="min-width:1000px"><div style="display:grid;grid-template-columns:${cols};gap:10px;padding:8px var(--pad);font-size:11.5px;color:var(--mute);background:var(--surface2);font-weight:600">${each(head,h=>`<span>${esc(h)}</span>`)}</div>${rows}</div></div></div>`;
}

/* ---------------------------------------------------------------- tasks */
function tplTasks(s){
  const Lx=L(),list=s.data.tasks,f=state.opsF||(state.opsF={}),t=state.tform||(state.tform={ref:'',type:'rappel',message:'',due_at:''});
  const create=()=>act(async()=>{const c=state.tform;await api('tasks',{method:'POST',body:{ref:c.ref||undefined,type:c.type,message:c.message,due_at:c.due_at?new Date(c.due_at).toISOString():undefined,agency_id:state.agencyFilter||undefined}});
    state.tform={ref:'',type:'rappel',message:'',due_at:''};await loadOps();await loadTaskCount();},Lx.saved);
  const done=x=>()=>askReason(Lx.taskDoneTitle,false,note=>act(async()=>{await api(`tasks/${x.id}/done`,{method:'POST',body:{note}});await loadOps();await loadTaskCount();},Lx.saved));
  const late=x=>x.status==='open'&&x.due_at&&new Date(x.due_at)<new Date();
  return `<div style="display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:var(--gap)" class="split">
    <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px;align-self:start" data-task-form>
      <b>${esc(Lx.newTask)}</b>
      ${field(Lx.parcelOpt,input('tf-ref','tform','ref','placeholder="SD-…" style="font-family:var(--mono)"'))}
      ${field(Lx.kindK,select('tf-type','tform','type',TASK_TYPES.map(([k,l])=>[k,l[li()]])))}
      ${field(Lx.messageK,input('tf-msg','tform','message'))}
      ${field(Lx.dueK,input('tf-due','tform','due_at','type="datetime-local"'))}
      <button ${on(create)} style="${BTN_PRIMARY}">${spin()}${esc(Lx.createK)}</button>
    </div>
    <div style="${CARD};overflow:hidden;min-width:0">
      <div style="padding:var(--pad);display:flex;gap:6px;flex-wrap:wrap;align-items:center"><b style="flex:1">${esc(Lx.tasksTitle)} (${list.length})</b>
        ${each([['open','',Lx.openK],['open','today',Lx.dueToday],['done','',Lx.doneK],['all','',Lx.any]],([st,due,l])=>`<button ${on(()=>{state.opsF={...f,tstatus:st,due};reloadOps();})} style="${css(chip((f.tstatus||'open')===st&&(f.due||'')===due))}">${esc(l)}</button>`)}</div>
      ${list.length?each(list,x=>`<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line);${late(x)?'background:var(--rb)':''}" data-task="${x.id}">
        <span style="${css(badge(x.type==='rdv'?'i':x.type==='probleme'?'r':'n'))}">${esc(taskL(x.type))}</span>
        ${x.ref?`<span ${on(()=>selectOrder(x.order_id))} style="font-family:var(--mono);font-size:12px;cursor:pointer;text-decoration:underline dotted">${esc(x.ref)}</span>`:''}
        <span style="flex:1;min-width:200px">${esc(x.message)}<br><span style="font-size:11.5px;color:var(--mute)">${esc([x.client_name,x.agency_name,x.created_by_name,dtm(x.created_at)].filter(Boolean).join(' · '))}</span></span>
        <span style="font-size:12.5px;font-weight:600;color:${late(x)?'var(--rf)':'inherit'}">${x.due_at?'📅 '+esc(dtm(x.due_at)):''}</span>
        ${x.status==='open'?`<button ${on(done(x))} style="${BTN_GHOST};padding:5px 10px;font-size:12px">✓ ${esc(Lx.markDone)}</button>`:`<span style="font-size:12px;color:var(--gf)">✓ ${esc(x.done_by_name||'')} ${esc(dtm(x.done_at))}${x.done_note?' — '+esc(x.done_note):''}</span>`}
      </div>`):empty(Lx.noTask)}
    </div></div>`;
}

/* ---------------------------------------------------------------- flagged / suspects / outstanding */
function tplParcelList(s){
  const Lx=L(),list=s.data.parcels,tab=s.tab,f=state.opsF||(state.opsF={});
  const unflag=x=>()=>act(async()=>{await api(`orders/${x.id}/unflag`,{method:'POST',body:{}});await loadOps();},Lx.saved);
  const top=tab==='outstanding'?`<div style="${CARD};padding:var(--pad);display:flex;gap:8px;align-items:end;flex-wrap:wrap">
      ${field(Lx.idleDays,`<input class="fld" type="number" min="1" max="90" style="max-width:120px" ${onInput(e=>{state.opsF={...state.opsF,days:e.target.value};},'of-days')} value="${esc(f.days||3)}">`)}
      ${field(Lx.driverDays,`<input class="fld" type="number" min="1" max="90" style="max-width:120px" ${onInput(e=>{state.opsF={...state.opsF,driver_days:e.target.value};},'of-dd')} value="${esc(f.driver_days||2)}">`)}
      <button ${on(reloadOps)} style="${BTN_PRIMARY}">${esc(Lx.apply)}</button><span style="font-size:12px;color:var(--mute);flex:1">${esc(Lx.outstandingHint)}</span></div>`
    :`<div style="font-size:12.5px;color:var(--mute)">${esc(tab==='suspects'?Lx.suspectHint:Lx.flaggedHint)}</div>`;
  const cols='110px minmax(0,1fr) 120px 70px 80px minmax(0,1fr) minmax(0,1.2fr) 100px';
  return `${top}<div style="${CARD};overflow:hidden"><div style="overflow-x:auto"><div style="min-width:900px">
    <div style="display:grid;grid-template-columns:${cols};gap:10px;padding:8px var(--pad);font-size:11.5px;color:var(--mute);background:var(--surface2);font-weight:600">${each(['Colis',Lx.client,Lx.statusK,Lx.attemptsShort,Lx.problemsShort,Lx.driverK,tab==='flagged'?Lx.flagReason:tab==='outstanding'?Lx.idleK:Lx.agencyLbl,''],h=>`<span>${esc(h)}</span>`)}</div>
    ${list.length?each(list,x=>`<div style="display:grid;grid-template-columns:${cols};gap:10px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line)" data-parcel="${esc(x.ref)}">
      <span ${on(()=>selectOrder(x.id))} style="font-family:var(--mono);font-size:12px;cursor:pointer;text-decoration:underline dotted">${esc(x.ref)}</span>
      <span>${esc(x.client_name)}<br><span style="font-size:11.5px;color:var(--mute)">${telLink(x.client_phone)} · ${esc(x.shop_name||'')}</span></span>
      <span style="${css(stB(x.status))}">${esc(stL(x.status))}</span><span style="text-align:center;font-weight:700;color:${x.attempts>=3?'var(--rf)':'inherit'}">${x.attempts}</span>
      <span style="text-align:center">${x.open_problems}/${x.problems}</span><span style="font-size:12.5px">${esc(x.driver_name||'—')}</span>
      <span style="font-size:12.5px">${tab==='flagged'?esc(x.flag_reason||'')+`<br><span style="font-size:11px;color:var(--mute)">${esc(x.flagged_by_name||'')} · ${esc(dtm(x.flagged_at))}</span>`
        :tab==='outstanding'?`<b>${x.idle_days} j</b> · ${esc(x.reason==='driver'?Lx.heldByDriver:Lx.noMovement)}`:esc(x.agency_name||'')}</span>
      <span style="text-align:end">${tab==='flagged'?`<button ${on(unflag(x))} style="${BTN_GHOST};padding:4px 8px;font-size:12px">${esc(Lx.unflagK)}</button>`:''}</span></div>`):empty()}
    </div></div></div>`;
}

/* ---------------------------------------------------------------- modals (call / treat / report a problem) */
function tplOpsModal(){
  const m=state.opsModal;if(!m)return '';
  const Lx=L(),close=()=>{state.opsModal=null;render();};
  const upd=(k,v)=>{state.opsModal={...state.opsModal,[k]:v};};
  let title,body,submit;
  if(m.kind==='call'){
    title=Lx.callTitle+' · '+m.p.ref;
    body=`<div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(m.p.client_name)}</b><span style="font-size:16px">${telLink(m.p.client_phone)}</span></div>
      ${field(Lx.callResult,`<select class="fld" ${onInput(e=>upd('outcome',e.target.value),'om-out')}>${each(CALL_OUT,([k,l])=>`<option value="${k}"${m.outcome===k?' selected':''}>${esc(l[li()])}</option>`)}</select>`)}
      ${field(Lx.noteK,`<input class="fld" ${onInput(e=>upd('note',e.target.value),'om-note')} value="${esc(m.note||'')}">`)}`;
    submit=()=>act(async()=>{await api(`problems/${m.p.id}/call`,{method:'POST',body:{outcome:state.opsModal.outcome,note:state.opsModal.note}});state.opsModal=null;await loadOps();},Lx.saved);
  }else if(m.kind==='treat'){
    title=Lx.treatTitle+' · '+m.p.ref+' · '+pbL(m.p.type);
    body=`${field(Lx.resolutionK+' *',`<textarea class="fld" rows="3" ${onInput(e=>upd('resolution',e.target.value),'om-res')}>${esc(m.resolution||'')}</textarea>`)}
      ${field(Lx.nextStep,`<select class="fld" ${onInput(e=>{upd('action',e.target.value);render();},'om-act')}>${each([['replan',Lx.actReplan],['return',Lx.actReturn],['cancel',Lx.actCancel],['none',Lx.actNone]],([k,l])=>`<option value="${k}"${m.action===k?' selected':''}>${esc(l)}</option>`)}</select>`)}
      ${field(Lx.rdvOpt,`<input class="fld" type="datetime-local" ${onInput(e=>upd('rdv_at',e.target.value),'om-rdv')} value="${esc(m.rdv_at||'')}">`)}
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" ${m.false_problem?'checked':''} ${on(()=>{upd('false_problem',!state.opsModal.false_problem);render();})}> ${esc(Lx.falseProblem)}</label>`;
    submit=()=>act(async()=>{const c=state.opsModal;await api(`problems/${m.p.id}/treat`,{method:'POST',body:{resolution:c.resolution,action:c.action,rdv_at:c.rdv_at?new Date(c.rdv_at).toISOString():undefined,false_problem:c.false_problem}});
      state.opsModal=null;await loadOps();await loadTaskCount();},Lx.saved);
  }else if(m.kind==='report'){
    title=Lx.reportProblem+' · '+m.ref;
    body=`${field(Lx.problemK,`<select class="fld" ${onInput(e=>{upd('type',e.target.value);render();},'om-type')}>${each(PB_TYPES,([k,l])=>`<option value="${k}"${m.type===k?' selected':''}>${esc(l[li()])}</option>`)}</select>`)}
      ${field(Lx.noteK,`<input class="fld" ${onInput(e=>upd('note',e.target.value),'om-pnote')} value="${esc(m.note||'')}">`)}
      ${when(m.type==='rdv',()=>field(Lx.rdvK+' *',`<input class="fld" type="datetime-local" ${onInput(e=>upd('rdv_at',e.target.value),'om-prdv')} value="${esc(m.rdv_at||localDT(Date.now()+864e5))}">`))}`;
    submit=()=>act(async()=>{const c=state.opsModal;await api('problems',{method:'POST',body:{order_id:c.order_id,type:c.type,note:c.note,rdv_at:c.type==='rdv'?new Date(c.rdv_at||localDT(Date.now()+864e5)).toISOString():undefined}});
      state.opsModal=null;if(state.sel)state.selData=await api('orders/'+state.sel);},Lx.saved);
  }else if(m.kind==='task'){
    title=Lx.newTask+' · '+m.ref;
    body=`${field(Lx.kindK,`<select class="fld" ${onInput(e=>upd('type',e.target.value),'om-ttype')}>${each(TASK_TYPES,([k,l])=>`<option value="${k}"${m.type===k?' selected':''}>${esc(l[li()])}</option>`)}</select>`)}
      ${field(Lx.messageK+' *',`<input class="fld" ${onInput(e=>upd('message',e.target.value),'om-tmsg')} value="${esc(m.message||'')}">`)}
      ${field(Lx.dueK,`<input class="fld" type="datetime-local" ${onInput(e=>upd('due_at',e.target.value),'om-tdue')} value="${esc(m.due_at||'')}">`)}`;
    submit=()=>act(async()=>{const c=state.opsModal;await api('tasks',{method:'POST',body:{order_id:c.order_id,type:c.type,message:c.message,due_at:c.due_at?new Date(c.due_at).toISOString():undefined}});state.opsModal=null;await loadTaskCount();},Lx.saved);
  }
  return `<div class="no-print" style="position:fixed;inset:0;z-index:1500;background:oklch(0.1 0.03 262 / .55);display:flex;align-items:center;justify-content:center;padding:16px" data-ops-modal>
    <div style="${CARD};width:min(460px,100%);padding:18px;display:flex;flex-direction:column;gap:12px;max-height:90vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:16px">${esc(title)}</b><button ${on(close)} style="${BTN_GHOST};padding:4px 9px">✕</button></div>
      ${body}<button ${on(submit)} style="${BTN_PRIMARY};min-height:44px">${spin()}${esc(Lx.confirmAction)}</button></div></div>`;
}

/* ---------------------------------------------------------------- parcel detail strip (attempts, appointment, flag, problem, task) */
function tplOrderOps(o){
  if(!isStaff())return '';
  const Lx=L();
  const flag=()=>askReason(Lx.flagTitle+' · '+o.ref,true,reason=>act(async()=>{await api(`orders/${o.id}/flag`,{method:'POST',body:{reason}});state.selData=await api('orders/'+o.id);},Lx.saved));
  const unflag=()=>act(async()=>{await api(`orders/${o.id}/unflag`,{method:'POST',body:{}});state.selData=await api('orders/'+o.id);},Lx.saved);
  return `<div class="no-print" style="padding:var(--pad);border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:8px;align-items:center" data-order-ops>
    <span style="${css(badge(o.attempts>=3?'r':o.attempts?'w':'n'))}">${esc(Lx.attemptsK)} : ${o.attempts||0}</span>
    ${o.rdv_at?`<span style="${css(badge('i'))}">📅 ${esc(dtm(o.rdv_at))}</span>`:''}
    ${o.flagged_at?`<span style="${css(badge('r'))}" title="${esc(o.flag_reason||'')}">⚑ ${esc(Lx.flaggedK)}</span>`:''}
    <span style="flex:1"></span>
    <button ${on(()=>{state.opsModal={kind:'report',order_id:o.id,ref:o.ref,type:'injoignable',note:''};render();})} style="${BTN_GHOST};font-size:12px;padding:6px 10px">⚠ ${esc(Lx.reportProblem)}</button>
    <button ${on(()=>{state.opsModal={kind:'task',order_id:o.id,ref:o.ref,type:'rappel',message:''};render();})} style="${BTN_GHOST};font-size:12px;padding:6px 10px">＋ ${esc(Lx.taskK)}</button>
    ${o.kind!=='pickup'?`<button ${on(()=>askReason(Lx.genExchange+' · '+o.ref,false,desc=>act(async()=>{const r=await api(`orders/${o.id}/exchange`,{method:'POST',body:{description:desc}});toast(Lx.exchangeCreated+' : '+r.pickup.ref);},null)))} style="${BTN_GHOST};font-size:12px;padding:6px 10px">⇄ ${esc(Lx.genExchange)}</button>`:''}
    ${o.flagged_at?`<button ${on(unflag)} style="${BTN_GHOST};font-size:12px;padding:6px 10px">${esc(Lx.unflagK)}</button>`:`<button ${on(flag)} style="${BTN_GHOST};font-size:12px;padding:6px 10px;color:var(--rf)">⚑ ${esc(Lx.flagK)}</button>`}
  </div>${state.page!=='ops'?tplOpsModal():''}`;
}

/* top bar: tasks counter (refreshed with the notifications) */
function tplTaskBadge(){
  if(!isStaff())return '';
  const tc=state.taskCount||{open:0,due:0};
  return `<button ${on(()=>{state.opsTab='tasks';state.ops=null;goPage('ops');})} title="${esc(L().tasksTitle)}" aria-label="${esc(L().tasksTitle)}" data-taskbadge style="${css({...seg(false),border:'1px solid oklch(1 0 0 / .18)',position:'relative'})}">✔︎${tc.open?`<span style="position:absolute;top:-6px;inset-inline-end:-6px;background:${tc.due?'var(--rf)':'var(--orange)'};color:#fff;font-size:10.5px;font-weight:800;min-width:18px;height:18px;border-radius:999px;display:flex;align-items:center;justify-content:center;padding:0 4px">${tc.open>99?'99+':tc.open}</span>`:''}</button>`;
}
/* shop space: pickup requests (demande d'enlèvement) */
function tplShopPickups(){
  const Lx=L(),list=state.shopPickups||[];
  const ask=()=>askReason(Lx.pickupRequest,false,comment=>act(async()=>{const r=await api('shop/pickups',{method:'POST',body:{comment}});toast(Lx.pickupRequested+' : '+r.manifest.ref+' ('+r.parcels+')');},null));
  const STG={0:Lx.pkWaiting,1:Lx.pkToCollect,2:Lx.pkCollected,4:Lx.pkReceived,5:'Annulé'};
  return `<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px" data-shop-pickups>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><b>${esc(Lx.pickupsTitle)}</b>
      <button ${on(ask)} style="${BTN_PRIMARY};padding:8px 14px">🚚 ${esc(Lx.pickupRequest)}</button></div>
    ${list.length?each(list.slice(0,5),x=>`<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12.5px;padding:6px 0;border-top:1px solid var(--line)">
      <b style="font-family:var(--mono)">${esc(x.ref)}</b><span style="${css(badge(x.stage===4?'g':x.stage===5?'r':x.stage>=1?'o':'n'))}">${esc(STG[x.stage]||'')}</span>
      <span>${x.n} ${esc(Lx.parcels)}${x.stage===4?' · '+x.received+' '+esc(Lx.received):''}</span><span style="color:var(--mute)">${esc(dtm(x.created_at))}${x.driver_name?' · '+esc(x.driver_name):''}</span></div>`):`<span style="font-size:12.5px;color:var(--mute)">${esc(Lx.noPickup)}</span>`}
  </div>`;
}
const _loadNotifsOps=loadNotifs;
loadNotifs=async function(){await _loadNotifsOps();await loadTaskCount();};

Object.assign(K,{
  ops:['Suivi colis','متابعة الطرود'],pickupsTitle:['Demandes d’enlèvement','طلبات الالتقاط'],pickupRequest:['Demander un enlèvement','طلب التقاط'],pickupRequested:['Demande envoyée','تم إرسال الطلب'],
  pkWaiting:['En attente','في الانتظار'],pkToCollect:['Livreur annoncé','تم تعيين موزع'],pkCollected:['Enlevé','تم الالتقاط'],pkReceived:['Reçu à l’agence','استلم في الوكالة'],noPickup:['Aucune demande.','لا طلبات.'],attemptsK:['Tentatives','المحاولات'],attemptsShort:['Tent.','محاولات'],problemK:['Problème','المشكلة'],noteK:['Note','ملاحظة'],callsK:['Appels','الاتصالات'],
  treatK:['Traiter','معالجة'],treatedBy:['Traité par','عالجه'],resolutionK:['Traitement','المعالجة'],falseProblem:['Faux problème','مشكلة خاطئة'],hideDelivered:['Masquer les livrés','إخفاء المسلمة'],
  yes:['Oui','نعم'],no:['Non','لا'],problemsTitle:['Problèmes à traiter','مشاكل للمعالجة'],historyTitle:['Historique des problèmes','سجل المشاكل'],noProblem:['Aucun problème en attente.','لا توجد مشاكل.'],
  noHistory:['Aucun problème traité.','لا يوجد سجل.'],newTask:['Nouvelle tâche','مهمة جديدة'],parcelOpt:['Colis (facultatif)','الطرد (اختياري)'],kindK:['Type','النوع'],messageK:['Message','الرسالة'],
  dueK:['Échéance','الموعد'],createK:['Créer','إنشاء'],tasksTitle:['Tâches','المهام'],dueToday:['À faire aujourd’hui','لليوم'],doneK:['Traitées','منجزة'],markDone:['Fait','تم'],
  noTask:['Aucune tâche.','لا توجد مهام.'],taskDoneTitle:['Tâche traitée — commentaire (facultatif)','تمت المهمة — تعليق'],idleDays:['Sans mouvement depuis (jours)','بدون حركة منذ (أيام)'],
  driverDays:['Chez un livreur depuis (jours)','لدى الموزع منذ (أيام)'],outstandingHint:['Colis actifs bloqués : aucun événement récent, ou gardés trop longtemps par un livreur.','طرود نشطة متوقفة.'],
  suspectHint:['Colis actifs à risque : 3 tentatives ou plus, 3 problèmes ou plus, ou client signalé non sérieux.','طرود نشطة مشبوهة.'],flaggedHint:['Colis signalés par un agent (anomalie à vérifier).','طرود أبلغ عنها عون.'],
  problemsShort:['Probl.','مشاكل'],flagReason:['Motif','السبب'],idleK:['Attente','الانتظار'],heldByDriver:['chez le livreur','لدى الموزع'],noMovement:['sans mouvement','بدون حركة'],
  unflagK:['Lever','إلغاء'],callTitle:['Appel client','اتصال بالحريف'],callResult:['Résultat de l’appel','نتيجة الاتصال'],treatTitle:['Traiter le problème','معالجة المشكلة'],
  nextStep:['Suite à donner','الإجراء التالي'],actReplan:['Nouvelle livraison (remettre en attente)','توصيل جديد'],actReturn:['Retour à l’expéditeur','إرجاع للمرسل'],actCancel:['Annuler la commande','إلغاء الطلب'],
  actNone:['Aucun changement de statut','بدون تغيير'],rdvOpt:['Rendez-vous (facultatif)','موعد (اختياري)'],rdvK:['Rendez-vous','الموعد'],reportProblem:['Signaler un problème','الإبلاغ عن مشكلة'],
  taskK:['Tâche','مهمة'],genExchange:['Générer échange','إنشاء تبديل'],exchangeCreated:['Échange créé','تم إنشاء التبديل'],flagK:['Signaler','إبلاغ'],flaggedK:['Signalé','مُبلّغ'],flagTitle:['Signaler le colis — motif','الإبلاغ عن الطرد'],
});

/* dashboard: operations counters (pickups, returns, exchanges, preparation, stock, problems, tasks, attempts) */
function tplDashOps(){
  const Lx=L(),o=state.dops;
  if(!o)return '';
  const go=fn=>()=>{fn();};
  const tile=(label,v,fn,tone)=>`<button ${on(go(fn))} style="${CARD};padding:12px;display:flex;flex-direction:column;gap:4px;text-align:start;cursor:pointer;min-width:0;color:var(--ink)">
    <span style="font-size:12px;color:var(--mute)">${esc(label)}</span><b style="font-family:var(--disp);font-size:24px;${tone&&v?`color:var(--${tone}f)`:''}">${v}</b></button>`;
  const brd=t=>()=>{goPage('brd');goBrdType(t);};
  const colis=att=>()=>{state.pf={attempts:att};state.pTab='list';state.pl=null;goPage('colis');};
  const ops=t=>()=>{state.opsTab=t;state.ops=null;goPage('ops');};
  return `<div style="display:flex;flex-direction:column;gap:8px" data-dash-ops>
    <b style="font-size:14px">${esc(Lx.opsToday)}</b>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px">
      ${tile(Lx.dPickupReq,o.pickup_requests,brd('pickup'),'o')}${tile(Lx.dPickupProg,o.pickups_in_progress,brd('pickup'))}
      ${tile(Lx.dReturns,o.returns_in_stock,brd('restitution'),'w')}${tile(Lx.dExchanges,o.exchanges_to_collect,brd('exchange'))}
      ${tile(Lx.dPreparation,o.in_preparation,brd('dispatch'))}${tile(Lx.dToDeliver,o.to_deliver,()=>{state.stkTab='current';state.stk=null;goPage('stock');})}
      ${tile(Lx.dOut,o.out_for_delivery,()=>goPage('map'))}${tile(Lx.dReceived,o.received_today,()=>{state.stkTab='moves';state.stk=null;goPage('stock');})}
      ${tile(Lx.dProblems,o.open_problems,ops('problems'),'r')}${tile(Lx.dTasks,o.tasks_open+(o.tasks_due?` (${o.tasks_due} ${Lx.dueShortK})`:''),ops('tasks'),o.tasks_due?'r':null)}
    </div>
    <div style="${CARD};padding:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center"><span style="font-size:12.5px;color:var(--mute);margin-inline-end:6px">${esc(Lx.byAttempts)}</span>
      ${each([['0',o.att0],['1',o.att1],['2',o.att2],['3',o.att3],['4',o.att4]],([k,v])=>`<button ${on(colis(k))} style="${css(chip(false))}">${k==='4'?'+3':k} : <b>${v}</b></button>`)}</div>
  </div>`;
}
const _tplDashBase=tplDash;
tplDash=function(){return tplDashOps()+_tplDashBase();};
Object.assign(K,{
  opsToday:['Opérations','العمليات'],dPickupReq:['Demandes d’enlèvement','طلبات الالتقاط'],dPickupProg:['Enlèvements en cours','التقاطات جارية'],dReturns:['Retours à remettre aux boutiques','مرتجعات للمتاجر'],
  dExchanges:['Échanges à récupérer','تبديلات للاسترجاع'],dPreparation:['Colis en préparation (expédition)','طرود قيد التحضير'],dToDeliver:['Colis à livrer (en stock)','طرود للتوصيل'],
  dOut:['En cours de livraison','قيد التوصيل'],dReceived:['Reçus aujourd’hui','استلمت اليوم'],dProblems:['Problèmes ouverts','مشاكل مفتوحة'],dTasks:['Tâches ouvertes','مهام مفتوحة'],
  dueShortK:['dues','مستحقة'],byAttempts:['Colis actifs par tentative','الطرود حسب المحاولات'],
});
