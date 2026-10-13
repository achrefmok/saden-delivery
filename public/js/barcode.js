/* SADEN — Code 128 barcodes (no dependency) and the A4 PDF builder shared by every bordereau.
   Code 128 set B covers every printable ASCII character of our references (SD-24187, EXP-GAF-0136…);
   long digit runs switch to set C (denser). Bars are black on white with 10-module quiet zones,
   readable by USB scanners (keyboard wedge) and phone cameras (BarcodeDetector / html5-qrcode). */

const C128=('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 '+
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 '+
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 '+
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 '+
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 '+
  '114131 311141 411131 211412 211214 211232 2331112').split(' ');

/** Symbol values (start, data, checksum, stop) for `text`. */
function code128Values(text){
  const s=String(text??'').replace(/[^\x20-\x7E]/g,'');
  if(!s)return null;
  const vals=[];let set=null,i=0;
  const digitsRun=k=>{let n=0;while(k+n<s.length&&/\d/.test(s[k+n]))n++;return n;};
  while(i<s.length){
    const run=digitsRun(i);
    // set C for >= 4 digits (or a whole even all-digit tail)
    if(run>=4&&(run%2===0||run>=5)){
      const n=run-(run%2);
      if(set!=='C'){vals.push(set?99:105);set='C';}
      for(let k=0;k<n;k+=2)vals.push(+s.substr(i+k,2));
      i+=n;continue;
    }
    if(set!=='B'){vals.push(set?100:104);set='B';}
    vals.push(s.charCodeAt(i)-32);i++;
  }
  let sum=vals[0];for(let k=1;k<vals.length;k++)sum+=vals[k]*k;
  vals.push(sum%103,106);
  return vals;
}
/** Bar/space module widths (starting with a bar). */
function code128Modules(text){const v=code128Values(text);if(!v)return null;return v.map(x=>C128[x]).join('').split('').map(Number);}

/** Inline SVG (crisp edges, human-readable text under the bars). opts: {h (px/mm units), module, text, font} */
function code128Svg(text,{h=40,module=2,showText=true,font=12}={}){
  const mods=code128Modules(text);if(!mods)return '';
  const q=10,total=mods.reduce((a,b)=>a+b,0)+2*q,W=total*module,H=h+(showText?font+4:0);
  let x=q*module,bars='';
  mods.forEach((w,k)=>{if(k%2===0)bars+=`<rect x="${x}" y="0" width="${w*module}" height="${h}"/>`;x+=w*module;});
  return `<svg class="c128" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges" role="img" aria-label="${esc(text)}">
    <rect width="${W}" height="${H}" fill="#fff"/><g fill="#000">${bars}</g>
    ${showText?`<text x="${W/2}" y="${h+font+1}" font-family="'IBM Plex Mono',monospace" font-size="${font}" text-anchor="middle" fill="#000">${esc(text)}</text>`:''}</svg>`;
}

/** Draws a Code 128 in jsPDF at (x, y) with bar height h (mm); returns the width used (quiet zones included). */
function pdfBarcode(doc,text,x,y,{module=0.25,h=8,showText=true,fontSize=7}={}){
  const mods=code128Modules(text);if(!mods)return 0;
  const q=10,total=mods.reduce((a,b)=>a+b,0)+2*q;
  doc.setFillColor(255,255,255);doc.rect(x,y,total*module,h+(showText?fontSize*0.45:0),'F');
  doc.setFillColor(0,0,0);
  let cx=x+q*module;
  mods.forEach((w,k)=>{if(k%2===0)doc.rect(cx,y,w*module,h,'F');cx+=w*module;});
  if(showText){doc.setFont('courier','normal');doc.setFontSize(fontSize);doc.setTextColor(0);doc.text(String(text),x+total*module/2,y+h+fontSize*0.38,{align:'center'});}
  return total*module;
}
const code128Width=(text,module=0.25)=>{const m=code128Modules(text);return m?(m.reduce((a,b)=>a+b,0)+20)*module:0;};

/* ------------------------------------------------------------------ A4 PDF builder
   spec = { title, ref, subtitle, cancelled:{reason,by,at}|null, info:[[label,value]], columns:[{t,w,align}], rows:[{cells:[], code}],
            totals:[text], notes:[text], signatures:[label], fileName }
   Every page: logo + title + document barcode, footer with page x / y. Rows (with their barcode) are never split. */
const pdfText=s=>String(s??'').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/→/g,'->').replace(/[–—]/g,'-').replace(/…/g,'...').replace(/[^\x20-\x7E\xA0-\xFF]/g,'');

async function buildPdf(spec,{save=true}={}){
  await loadLib('jspdf');
  const logo=await brandPrintDataUrl();
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const W=210,H=297,M=12,bottom=H-18;
  const cols=spec.columns,tw=cols.reduce((a,c)=>a+c.w,0),scale=(W-2*M)/tw;
  cols.forEach(c=>c.ww=c.w*scale);
  const rowH=spec.rows.some(r=>r.code)?14:8;
  let y=0;
  const header=()=>{
    y=M;
    if(logo)doc.addImage(logo,'PNG',M,y,18,18);
    doc.setTextColor(0);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(pdfText(spec.title),M+22,y+7);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(pdfText(BRAND.full+(spec.subtitle?' - '+spec.subtitle:'')),M+22,y+12.5);
    doc.setFont('courier','bold');doc.setFontSize(11);doc.text(pdfText(spec.ref),M+22,y+17.5);
    const bw=code128Width(spec.ref,0.33);
    pdfBarcode(doc,spec.ref,W-M-bw,y,{module:0.33,h:13,fontSize:8});
    y+=23;
    if(spec.cancelled){
      doc.setFillColor(0);doc.rect(M,y,W-2*M,8,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(11);
      doc.text(pdfText(`ANNULÉ le ${spec.cancelled.at} par ${spec.cancelled.by} - motif : ${spec.cancelled.reason}`).slice(0,110),M+2,y+5.5);
      doc.setTextColor(0);y+=11;
    }
  };
  const tableHead=()=>{
    doc.setFillColor(30,30,30);doc.rect(M,y,W-2*M,7,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(8.5);
    let x=M;cols.forEach(c=>{const tx=c.align==='right'?x+c.ww-1.5:x+1.5;doc.text(pdfText(c.t),tx,y+4.8,{align:c.align==='right'?'right':'left'});x+=c.ww;});
    doc.setTextColor(0);doc.setFont('helvetica','normal');y+=8;
  };
  const newPage=withHead=>{doc.addPage();header();if(withHead)tableHead();};
  header();
  // info block (two columns)
  doc.setFontSize(9);
  const info=spec.info||[];
  for(let i=0;i<info.length;i+=2){
    for(let j=0;j<2&&i+j<info.length;j++){
      const [k,v]=info[i+j],x=M+j*((W-2*M)/2);
      doc.setFont('helvetica','bold');doc.text(pdfText(k)+' :',x,y+3);
      doc.setFont('helvetica','normal');doc.text(doc.splitTextToSize(pdfText(v||'-'),(W-2*M)/2-36)[0]||'-',x+34,y+3);
    }
    y+=5.2;
  }
  y+=3;
  if(cols.length){
    tableHead();
    spec.rows.forEach((r,i)=>{
      if(y+rowH>bottom)newPage(true);
      if(i%2){doc.setFillColor(243,243,243);doc.rect(M,y-1,W-2*M,rowH,'F');}
      let x=M;doc.setFontSize(8.5);doc.setFont('helvetica','normal');
      cols.forEach((c,j)=>{
        if(c.code){if(r.code)pdfBarcode(doc,r.code,x+0.5,y,{module:Math.min(0.3,(c.ww-1)/(code128Width(r.code,1))),h:8.5,fontSize:6.5});doc.setFont('helvetica','normal');doc.setFontSize(8.5);}
        else{const t=doc.splitTextToSize(pdfText(r.cells[j]),c.ww-3).slice(0,rowH>8?2:1);
          doc.text(t,c.align==='right'?x+c.ww-1.5:x+1.5,y+3.5,{align:c.align==='right'?'right':'left'});}
        x+=c.ww;
      });
      doc.setDrawColor(200);doc.line(M,y+rowH-1,W-M,y+rowH-1);y+=rowH;
    });
    if(!spec.rows.length){doc.setFontSize(9);doc.text('Aucune ligne.',M+2,y+4);y+=8;}
  }
  const blockH=(spec.totals?.length||0)*5.5+(spec.notes?.length||0)*5+(spec.signatures?.length?36:0)+6;
  if(y+blockH>bottom)newPage(false);
  y+=4;doc.setFont('helvetica','bold');doc.setFontSize(10);
  (spec.totals||[]).forEach(t=>{doc.text(pdfText(t),M,y);y+=5.5;});
  doc.setFont('helvetica','normal');doc.setFontSize(9);
  (spec.notes||[]).forEach(t=>{doc.text(doc.splitTextToSize(pdfText(t),W-2*M)[0],M,y);y+=5;});
  if(spec.signatures?.length){
    y+=3;const n=spec.signatures.length,gap=4,bw=(W-2*M-gap*(n-1))/n;
    spec.signatures.forEach((s,i)=>{const x=M+i*(bw+gap);doc.setDrawColor(0);doc.rect(x,y,bw,28);doc.setFontSize(9);doc.setFont('helvetica','bold');doc.text(pdfText(s),x+2,y+5);
      doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.text('Nom, date et signature',x+2,y+25.5);});
  }
  // footers + cancelled watermark on every page
  const n=doc.getNumberOfPages(),printed=new Date().toLocaleString('fr-FR');
  for(let p=1;p<=n;p++){
    doc.setPage(p);
    if(spec.cancelled){
      doc.saveGraphicsState?.();
      if(doc.GState)doc.setGState(new doc.GState({opacity:0.18}));
      doc.setTextColor(0);doc.setFont('helvetica','bold');doc.setFontSize(90);doc.text('ANNULÉ',W/2,H/2,{align:'center',angle:35});
      doc.restoreGraphicsState?.();
    }
    doc.setTextColor(0);doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setDrawColor(0);doc.line(M,H-12,W-M,H-12);
    doc.text(pdfText(`${BRAND.full} - ${spec.ref} - imprimé le ${printed}`),M,H-8);
    doc.text(`Page ${p} / ${n}`,W-M,H-8,{align:'right'});
  }
  if(save)doc.save((spec.fileName||spec.ref)+'.pdf');
  return doc;
}
