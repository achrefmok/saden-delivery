/* SADEN — single place to configure the visual identity.
   To replace the logo: put the new file in public/brand/logo-source.png (or .jpg) and run `npm run brand`
   (regenerates logo.png, logo-print.png, favicons and PWA icons). Names / colours below are used by the UI,
   the 10×15 labels and the PDF bordereaux. */
const BRAND={
  name:'SADEN',
  full:'SADEN Delivery',
  logo:'/brand/logo.png',              // colour, transparent background — always shown on a white badge
  logoPrint:'/brand/logo-print.png',   // black & white, high contrast — labels, PDF, printing
  favicon:'/brand/favicon-64.png',
  orange:'#F07E1B',
  navy:'#1b2a4e',
};
/* Logo on a white rounded badge (readable on dark and light themes). */
function brandLogo(size=36,radius){
  return `<span class="brand-logo" style="width:${size}px;height:${size}px;flex-shrink:0;border-radius:${radius??Math.round(size*0.24)}px;background:#fff;display:inline-flex;align-items:center;justify-content:center;overflow:hidden"><img src="${BRAND.logo}" alt="${BRAND.full}" width="${size}" height="${size}" style="width:94%;height:94%;object-fit:contain;display:block" decoding="async"></span>`;
}
/* Data URL of the print logo for jsPDF (cached). */
let _brandPrintData=null;
function brandPrintDataUrl(){
  if(_brandPrintData)return Promise.resolve(_brandPrintData);
  return fetch(BRAND.logoPrint).then(r=>{if(!r.ok)throw new Error('logo');return r.blob();})
    .then(b=>new Promise((ok,ko)=>{const fr=new FileReader();fr.onload=()=>ok(_brandPrintData=fr.result);fr.onerror=ko;fr.readAsDataURL(b);}))
    .catch(()=>null);
}
