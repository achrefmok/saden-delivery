/* SADEN — icon set (original line icons, 24×24, stroke = currentColor) and brand illustrations.
   ico(name, size) returns an inline SVG; illu(name) returns a scene drawn with the theme colours (light / dark). */

const ICONS={
  home:'<path d="M3.5 10.5 12 4l8.5 6.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  map:'<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z"/><path d="M9 4v14M15 6v14"/>',
  box:'<path d="M12 3 20 7.2v9.6L12 21l-8-4.2V7.2L12 3z"/><path d="M4 7.2 12 11.5l8-4.3M12 11.5V21"/>',
  boxes:'<path d="M3 13.5 7.5 11l4.5 2.5V18L7.5 20.5 3 18v-4.5zM12 13.5l4.5-2.5 4.5 2.5V18l-4.5 2.5L12 18"/><path d="M7.5 3.5 12 6v5l-4.5 2.5L3 11V6l4.5-2.5zM12 6l4.5-2.5L21 6v5"/>',
  truck:'<path d="M2.5 6.5h11v9h-11z"/><path d="M13.5 9.5h4l3 3.2v2.8h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  scooter:'<circle cx="6" cy="17" r="2.6"/><circle cx="18" cy="17" r="2.6"/><path d="M8.6 17h6.8l2-6.5H20M17.4 10.5l-1.2-4H14M6 14.4l3.2-4.9h4.5"/>',
  route:'<circle cx="6" cy="5.5" r="2"/><circle cx="18" cy="18.5" r="2"/><path d="M8 5.5h7.5a3 3 0 0 1 0 6h-7a3 3 0 0 0 0 6H16"/>',
  warehouse:'<path d="M3 9.5 12 4l9 5.5V20H3V9.5z"/><path d="M7 20v-7h10v7M7 16.5h10"/>',
  file:'<path d="M6.5 3h7.5L18.5 7.5V21h-12V3z"/><path d="M14 3v4.5h4.5M9 12h6M9 15.5h6"/>',
  layers:'<path d="M12 3.5 21 8l-9 4.5L3 8l9-4.5z"/><path d="m3 12 9 4.5 9-4.5M3 16l9 4.5 9-4.5"/>',
  users:'<circle cx="9" cy="8" r="3.3"/><path d="M2.8 20c.7-3.6 3.2-5.6 6.2-5.6s5.5 2 6.2 5.6"/><path d="M15.5 4.9a3.3 3.3 0 0 1 0 6.3M17.8 14.6c1.9.7 3.1 2.6 3.5 5.4"/>',
  user:'<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.5c.8-4 3.7-6.2 7.2-6.2s6.4 2.2 7.2 6.2"/>',
  store:'<path d="M4 9.5V20h16V9.5"/><path d="M3 9.5 4.8 4h14.4L21 9.5c0 1.6-1.3 2.8-2.9 2.8s-3-1.2-3-2.8c0 1.6-1.4 2.8-3.1 2.8S8.9 11.1 8.9 9.5c0 1.6-1.3 2.8-3 2.8S3 11.1 3 9.5z"/><path d="M9.5 20v-5h5v5"/>',
  building:'<path d="M4.5 21V4.5h10V21M14.5 9h5V21"/><path d="M8 8h3M8 11.5h3M8 15h3M3 21h18"/>',
  cash:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  wallet:'<path d="M4 7.5h14.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5.5A1.5 1.5 0 0 1 4 18.5V7.5z"/><path d="M4 7.5 15.5 4v3.5M16 14h2"/>',
  chart:'<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6.5"/>',
  trend:'<path d="m3.5 16.5 5.5-5.5 4 4 7.5-7.5"/><path d="M15 7.5h5.5V13"/>',
  alert:'<path d="M12 3.5 21.5 20h-19L12 3.5z"/><path d="M12 10v4.5M12 17.4v.1"/>',
  chat:'<path d="M4 5h16v11H9.5L5 19.5V16H4V5z"/><path d="M8 9.5h8M8 12.5h5"/>',
  list:'<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1"/><circle cx="4.8" cy="12" r="1"/><circle cx="4.8" cy="17.5" r="1"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  scan:'<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M7.5 9v6M10.5 9v6M13.5 9v6M16.5 9v6"/>',
  bell:'<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  check:'<path d="m4.5 12.5 4.8 4.8L19.5 7"/>',
  checkCircle:'<circle cx="12" cy="12" r="8.8"/><path d="m8 12.3 2.8 2.8L16.2 9.6"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  phone:'<path d="M6.5 3.5h3l1.5 4.2-2 1.3a11 11 0 0 0 6 6l1.3-2 4.2 1.5v3a2 2 0 0 1-2.2 2C10.4 19 5 13.6 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
  whatsapp:'<path d="M4.5 19.5 5.6 16A8.2 8.2 0 1 1 8.4 18.7l-3.9.8z"/><path d="M9 8.6c.3 2.8 2.7 5.4 5.6 6.1l1.1-1.5-1.8-1-.9.8a5 5 0 0 1-2.4-2.4l.8-.9-1-1.8-1.4 1.1z"/>',
  message:'<path d="M4 5.5h16v10.5H8.5L4 19.5V5.5z"/><circle cx="8.5" cy="10.8" r=".6"/><circle cx="12" cy="10.8" r=".6"/><circle cx="15.5" cy="10.8" r=".6"/>',
  navigate:'<path d="M3.5 11 20.5 3.5 13 20.5l-2.3-7.2L3.5 11z"/>',
  pin:'<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  clock:'<circle cx="12" cy="12" r="8.8"/><path d="M12 7v5.2l3.4 2"/>',
  calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  logout:'<path d="M10 4.5H5.5v15H10"/><path d="M14 8l4 4-4 4M18 12H9"/>',
  power:'<path d="M12 3.5v8"/><path d="M6.6 6.8a7.5 7.5 0 1 0 10.8 0"/>',
  moon:'<path d="M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.2 6.2 0 0 0 9.7 9.7z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  download:'<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15"/>',
  upload:'<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 19.5h15"/>',
  print:'<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="8" rx="1.8"/><path d="M7 14h10v6.5H7z"/>',
  filter:'<path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8L4 5z"/>',
  arrowRight:'<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
  arrowLeft:'<path d="M19 12H5M10.5 6.5 5 12l5.5 5.5"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',
  refresh:'<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4.5H15"/>',
  star:'<path d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-4 5.6-.8L12 3.8z"/>',
  shield:'<path d="M12 3.5 19.5 6v5.5c0 4.6-3.1 8.1-7.5 9.5-4.4-1.4-7.5-4.9-7.5-9.5V6L12 3.5z"/><path d="m8.8 12 2.3 2.3 4.2-4.3"/>',
  camera:'<path d="M3.5 8h4L9 5.5h6L16.5 8h4v11.5h-17V8z"/><circle cx="12" cy="13.5" r="3.6"/>',
  pen:'<path d="m14.5 5.5 4 4L8 20H4v-4L14.5 5.5z"/><path d="m12.5 7.5 4 4"/>',
  key:'<circle cx="8" cy="15.5" r="4"/><path d="m10.9 12.7 8.6-8.7M16.5 7l2.5 2.5M14 9.5l2 2"/>',
  tag:'<path d="M3.5 12.3V4h8.3l8.7 8.7-8.3 8.3-8.7-8.7z"/><circle cx="8" cy="8.5" r="1.4"/>',
  undo:'<path d="M9 7.5 4.5 12 9 16.5"/><path d="M4.5 12H15a5 5 0 0 1 0 10h-2"/>',
  exchange:'<path d="M4 8.5h14.5M15 5l3.5 3.5L15 12M20 15.5H5.5M9 12l-3.5 3.5L9 19"/>',
  barcode:'<path d="M4 5v14M7 5v14M10.5 5v14M13 5v14M16.5 5v14M20 5v14"/>',
  sparkle:'<path d="M12 3.5c.7 4.3 2.2 5.8 6.5 6.5-4.3.7-5.8 2.2-6.5 6.5-.7-4.3-2.2-5.8-6.5-6.5 4.3-.7 5.8-2.2 6.5-6.5z"/><path d="M19 15.5c.3 1.8.9 2.4 2.5 2.7-1.6.3-2.2.9-2.5 2.7-.3-1.8-.9-2.4-2.5-2.7 1.6-.3 2.2-.9 2.5-2.7z"/>',
  battery:'<rect x="3" y="7.5" width="16" height="9" rx="2"/><path d="M21 10.5v3M6 10.5v3M9 10.5v3"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  globe:'<circle cx="12" cy="12" r="8.8"/><path d="M3.2 12h17.6M12 3.2c2.4 2.5 3.6 5.4 3.6 8.8s-1.2 6.3-3.6 8.8c-2.4-2.5-3.6-5.4-3.6-8.8S9.6 5.7 12 3.2z"/>',
  receipt:'<path d="M5.5 3.5h13V21l-2.2-1.4-2.1 1.4-2.2-1.4L9.8 21l-2.1-1.4L5.5 21V3.5z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
  zap:'<path d="M13.5 3 5 13.5h6L10.5 21 19 10.5h-6L13.5 3z"/>',
  dot:'<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>',
};
/** Inline icon (decorative unless a label is given). */
function ico(name,size=18,label){
  const p=ICONS[name]||ICONS.dot;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${label?`role="img" aria-label="${esc(label)}"`:'aria-hidden="true"'} style="flex-shrink:0">${p}</svg>`;
}

/* ------------------------------------------------------------------ illustrations (theme colours through CSS variables) */
const ILLU={
  // login: a delivery route across a stylised city, the van and the destination pin
  hero:`<svg viewBox="0 0 480 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Illustration : une camionnette de livraison suit son itinéraire en ville">
    <defs><linearGradient id="hs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--orange)" stop-opacity=".16"/><stop offset="1" stop-color="transparent"/></linearGradient></defs>
    <circle cx="370" cy="88" r="46" fill="var(--orange)" opacity=".18"/><circle cx="370" cy="88" r="26" fill="var(--orange)" opacity=".35"/>
    <g fill="var(--illuB)" opacity=".9"><rect x="34" y="150" width="46" height="120" rx="6"/><rect x="88" y="118" width="58" height="152" rx="6"/><rect x="154" y="170" width="40" height="100" rx="6"/>
      <rect x="300" y="140" width="52" height="130" rx="6"/><rect x="360" y="176" width="44" height="94" rx="6"/><rect x="410" y="128" width="40" height="142" rx="6"/></g>
    <g fill="var(--illuC)">${Array.from({length:18},(_,i)=>`<rect x="${[44,56,98,112,126,162,174,310,324,338,368,382,418,430,98,112,310,324][i]}" y="${[166,166,136,136,136,186,186,156,156,156,192,192,146,146,164,164,182,182][i]}" width="7" height="9" rx="1.5"/>`).join('')}</g>
    <rect x="0" y="268" width="480" height="92" fill="url(#hs)"/>
    <path d="M24 300 C120 300 140 250 230 252 S360 300 456 278" fill="none" stroke="var(--illuRoad)" stroke-width="22" stroke-linecap="round"/>
    <path d="M24 300 C120 300 140 250 230 252 S360 300 456 278" fill="none" stroke="var(--surface)" stroke-width="2.5" stroke-dasharray="10 12" stroke-linecap="round"/>
    <g transform="translate(372 214)"><path d="M18 0C8 0 0 8 0 18c0 13 18 30 18 30s18-17 18-30C36 8 28 0 18 0z" fill="var(--orange)"/><circle cx="18" cy="18" r="7" fill="var(--surface)"/></g>
    <g transform="translate(150 214)"><rect x="0" y="10" width="62" height="34" rx="6" fill="var(--navy)"/><path d="M62 18h18l12 13v13H62z" fill="var(--navy)"/><path d="M66 22h12l8 9H66z" fill="var(--illuC)"/>
      <rect x="8" y="18" width="24" height="10" rx="2" fill="var(--orange)"/><circle cx="16" cy="46" r="7.5" fill="var(--ink)"/><circle cx="16" cy="46" r="3" fill="var(--surface)"/><circle cx="76" cy="46" r="7.5" fill="var(--ink)"/><circle cx="76" cy="46" r="3" fill="var(--surface)"/>
      <path d="M-16 22h10M-22 30h14M-14 38h8" stroke="var(--orange)" stroke-width="3" stroke-linecap="round"/></g>
    <g transform="translate(262 196)"><path d="M0 14 22 4l22 10v24L22 48 0 38z" fill="var(--orange)"/><path d="M0 14l22 10 22-10M22 24v24" fill="none" stroke="var(--onOrange)" stroke-opacity=".35" stroke-width="2"/></g>
  </svg>`,
  // empty state: an open parcel with sparkles
  empty:`<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="80" cy="96" rx="52" ry="7" fill="var(--surface2)"/>
    <path d="M44 46 80 32l36 14v38L80 98 44 84z" fill="var(--accentSoft)" stroke="var(--line)" stroke-width="1.5"/><path d="M44 46l36 14 36-14M80 60v38" fill="none" stroke="var(--line)" stroke-width="1.5"/>
    <path d="M44 46 30 36l36-14 14 10M116 46l14-10-36-14-14 10" fill="var(--surface)" stroke="var(--line)" stroke-width="1.5"/>
    <path d="M124 14c.8 4.6 2.4 6.2 7 7-4.6.8-6.2 2.4-7 7-.8-4.6-2.4-6.2-7-7 4.6-.8 6.2-2.4 7-7z" fill="var(--orange)"/><circle cx="36" cy="18" r="3" fill="var(--orange)" opacity=".5"/></svg>`,
  // driver app header: a rider on the road
  rider:`<svg viewBox="0 0 220 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="176" cy="34" r="20" fill="#fff" opacity=".12"/><path d="M0 104h220" stroke="#fff" stroke-opacity=".25" stroke-width="2" stroke-dasharray="8 10"/>
    <g transform="translate(58 30)"><circle cx="16" cy="62" r="11" fill="none" stroke="#fff" stroke-width="5"/><circle cx="88" cy="62" r="11" fill="none" stroke="#fff" stroke-width="5"/>
      <path d="M27 62h40l10-24h12M77 38l-6-18h-8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="18" y="20" width="30" height="24" rx="4" fill="var(--orange)"/><circle cx="64" cy="6" r="7" fill="#fff"/><path d="M60 13l-8 22h14l8 12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M-30 30h18M-38 44h24M-28 58h14" stroke="var(--orange)" stroke-width="4" stroke-linecap="round"/></g></svg>`,
  // success: parcel with a check badge
  success:`<svg viewBox="0 0 160 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="80" cy="124" rx="50" ry="7" fill="var(--surface2)"/>
    <path d="M40 52 80 36l40 16v46l-40 18-40-18z" fill="var(--accentSoft)" stroke="var(--orange)" stroke-width="2"/><path d="M40 52l40 16 40-16M80 68v48" fill="none" stroke="var(--orange)" stroke-width="2"/>
    <circle cx="116" cy="38" r="20" fill="var(--gf)"/><path d="m106 38 7 7 13-13" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // fleet: two vans and a scooter, for the drivers page header
  fleet:`<svg viewBox="0 0 260 90" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M0 80h260" stroke="var(--line)" stroke-width="2"/>
    <g transform="translate(12 30)"><rect width="56" height="32" rx="5" fill="var(--navy)"/><path d="M56 8h16l10 12v12H56z" fill="var(--navy)"/><rect x="8" y="8" width="22" height="9" rx="2" fill="var(--orange)"/><circle cx="16" cy="40" r="7" fill="var(--ink)"/><circle cx="68" cy="40" r="7" fill="var(--ink)"/></g>
    <g transform="translate(112 22)"><rect width="66" height="38" rx="6" fill="var(--orange)"/><path d="M66 10h18l12 14v14H66z" fill="var(--orange)"/><rect x="8" y="9" width="26" height="10" rx="2" fill="var(--surface)" opacity=".85"/><circle cx="18" cy="46" r="8" fill="var(--ink)"/><circle cx="82" cy="46" r="8" fill="var(--ink)"/></g>
    <g transform="translate(216 42)"><circle cx="6" cy="30" r="6" fill="none" stroke="var(--navy)" stroke-width="3.5"/><circle cx="36" cy="30" r="6" fill="none" stroke="var(--navy)" stroke-width="3.5"/><path d="M12 30h16l6-14h6" fill="none" stroke="var(--navy)" stroke-width="3.5" stroke-linecap="round"/><rect x="4" y="8" width="16" height="12" rx="2" fill="var(--orange)"/></g></svg>`,
};
const illu=name=>ILLU[name]||'';
/* Empty state with illustration (replaces the plain text one everywhere). */
function emptyState(msg){return `<div class="empty-state" style="padding:22px var(--pad);display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;color:var(--mute)"><div style="width:120px">${illu('empty')}</div><span>${esc(msg)}</span></div>`;}
