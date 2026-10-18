/* SADEN Delivery — application core (vanilla JS). Loaded as a classic script; feature files share its globals. */
'use strict';
const L_=window.L; // Leaflet (captured before the i18n helper L() below)
/* =========================================================
   i18n
   ========================================================= */
const K={vAdmin:['Admin','الإدارة'],vDriver:['Livreur','الموزع'],vShop:['Boutique','المتجر'],vClient:['Client','الحريف'],light:['Clair','فاتح'],dark:['Sombre','داكن'],
dash:['Tableau de bord','لوحة القيادة'],phone2:['Téléphone 2','الهاتف 2'],missingFields:['Champs manquants','حقول ناقصة'],exchangeParcel:['Colis d’échange','طرد تبديل'],exchangeHint:['un article est récupéré chez le client à la livraison','تُسترجع سلعة من الحريف عند التسليم'],settings:['Paramètres','الإعدادات'],shops:['Boutiques','المتاجر'],newShopAccount:['Nouvelle boutique','متجر جديد'],inProgressK:['En cours','جارية'],dueShort:['Livré à reverser','للتحويل'],settleK:['Solde','تسوية'],shopsHint:['Chiffres calculés sur les 500 dernières commandes ; le solde exact se fait par bordereau de solde.','الأرقام محسوبة على آخر 500 طلب ؛ التسوية الدقيقة عبر بوليصة التسوية.'],map:['Carte live','الخريطة المباشرة'],orders:['Commandes & colis','الطلبات والطرود'],brd:['Bordereaux','البوليصات'],drivers:['Livreurs','الموزعون'],cash:['Caisse','الخزينة'],stats:['Statistiques','الإحصائيات'],claims:['Réclamations','الشكاوى'],accounts:['Comptes','الحسابات'],
agencyLbl:['Agence','الوكالة'],search:['Colis, téléphone, client, bordereau…','طرد، هاتف، حريف، بوليصة…'],newParcel:['Nouveau colis','طرد جديد'],
liveMap:['Carte live','الخريطة المباشرة'],alerts:['Alertes','التنبيهات'],recent:['Commandes récentes','الطلبات الأخيرة'],lastBrd:['Derniers bordereaux','آخر البوليصات'],seeAll:['Tout voir','عرض الكل'],
colRef:['Réf.','المرجع'],colClient:['Client','الحريف'],colShop:['Boutique','المتجر'],colZone:['Zone','المنطقة'],colStatus:['Statut','الحالة'],colAmount:['COD','المبلغ'],
detail:['Colis','طرد'],sender:['Expéditeur','المرسل'],recipient:['Destinataire','المرسل إليه'],phone:['Téléphone','الهاتف'],address:['Adresse','العنوان'],cod:['Contre-remboursement','الدفع عند الاستلام'],driver:['Livreur','الموزع'],
history:['Historique des statuts','سجل الحالات'],assign:['Affectation','الإسناد'],auto:['Auto','تلقائي'],manual:['Manuel','يدوي'],recommended:['Recommandé','موصى به'],assignBtn:['Affecter','إسناد'],autoAssignBtn:['Affecter le livreur recommandé','إسناد الموزع الموصى به'],inProgress:['en cours','جارية'],
lastPos:['Dernière position','آخر موقع'],battery:['Batterie','البطارية'],deliveriesToday:["Livraisons aujourd'hui",'توصيلات اليوم'],distance:['Distance agence','المسافة'],
parcels:['colis','طرود'],newBrd:['Nouveau bordereau','بوليصة جديدة'],print:['Imprimer','طباعة'],pdf:['Exporter PDF','تصدير PDF'],from:['Départ','الانطلاق'],to:['Destination','الوجهة'],responsible:['Responsable','المسؤول'],carrier:['Transporteur','الناقل'],date:['Date','التاريخ'],count:['Nombre de colis','عدد الطرود'],
reviews:['avis','تقييم'],claimsN:['réclamations','شكاوى'],rating:['Note moyenne livreurs','متوسط تقييم الموزعين'],
income:['Recettes du jour','مداخيل اليوم'],expenses:['Dépenses du jour','مصاريف اليوم'],balance:['Solde caisse','رصيد الخزينة'],toPay:['À reverser aux boutiques','مستحقات المتاجر'],split:['Répartition des encaissements du jour','توزيع مبالغ اليوم'],sClient:['Part boutiques','حصة المتاجر'],sSaden:['Revenu Saden','عائدات سادن'],sDriver:['Part livreurs','حصة الموزعين'],movements:['Mouvements du jour','حركات اليوم'],
volume:['Livraisons','التوصيلات'],byZone:['Taux de réussite par zone','نسبة النجاح حسب المنطقة'],topDrivers:['Meilleurs livreurs','أفضل الموزعين'],
claimRule:["Les évaluations sont liées à une livraison réelle et ne peuvent être ni modifiées ni supprimées par le livreur. Cliquez sur un statut pour faire avancer la réclamation.",'التقييمات مرتبطة بعملية توصيل حقيقية ولا يمكن للموزع تعديلها أو حذفها. اضغط على الحالة لتقدّم الشكوى.'],
hello:['Bonjour','مرحبا'],gpsShare:['Position partagée pendant le service','مشاركة الموقع أثناء العمل'],gpsOff:['GPS indisponible — activez la localisation','GPS غير متاح — فعّل تحديد الموقع'],missions:['Livraisons du jour','توصيلات اليوم'],toDeliver:['À livrer','للتوصيل'],done:['Terminées','منجزة'],toCollect:['À encaisser','للتحصيل'],
navigate:['Naviguer','الملاحة'],call:['Appeler','اتصال'],accept:['Accepter','قبول'],route:['En route','في الطريق'],arrived:['Arrivé','وصلت'],delivered:['Livré','تم التسليم'],absent:['Client absent','الحريف غائب'],refused:['Refusé','مرفوض'],postponed:['Reporté','مؤجل'],
problem:['Un problème ?','هل هناك مشكلة؟'],proof:['Preuve de livraison','إثبات التسليم'],otp:['Code OTP','رمز التحقق'],photo:['Photo','صورة'],sign:['Signature','توقيع'],confirm:['Confirmer la livraison','تأكيد التسليم'],collect:['Montant encaissé','المبلغ المحصل'],deliveredOk:['Livraison confirmée','تم تأكيد التسليم'],nextMission:['Livraison suivante','التوصيل التالي'],otpHint:['Demandez au client le code affiché sur sa page de suivi.','اطلب من الحريف الرمز الظاهر في صفحة التتبع.'],
photoHint:['[ toucher pour ouvrir la caméra ]','[ اضغط لفتح الكاميرا ]'],signHint:['Faites signer le client dans le cadre','اطلب من الحريف التوقيع داخل الإطار'],clear:['Effacer','مسح'],
shopSpace:['Espace boutique','فضاء المتجر'],shopPrivacy:['Vous ne voyez que les commandes de votre boutique.','تظهر لك طلبات متجرك فقط.'],myOrders:['Mes commandes','طلباتي'],create:['Créer une commande','إنشاء طلب'],useGps:['Utiliser ma position actuelle','استخدام موقعي الحالي'],submit:['Envoyer à Saden','إرسال إلى سادن'],name:['Nom du client','اسم الحريف'],
track:['Suivi de colis','تتبع الطرد'],yourDriver:['Votre livreur','موزعك'],eta:['Arrivée estimée','الوصول المتوقع'],rateTitle:['Comment s’est passée la livraison ?','كيف كانت عملية التوصيل؟'],commentPh:['Ponctualité, communication, comportement…','الالتزام بالموعد، التواصل، السلوك…'],send:['Envoyer','إرسال'],thanks:['Merci pour votre retour','شكرا على ملاحظاتك'],
reportOpen:['Signaler un problème','الإبلاغ عن مشكلة'],reportClose:['Annuler le signalement','إلغاء الإبلاغ'],
deliveryCode:['Code de livraison','رمز التسليم'],deliveryCodeHint:['À donner au livreur uniquement à la remise du colis.','أعطه للموزع فقط عند استلام الطرد.'],otherParcel:['Suivre un autre colis','تتبع طرد آخر'],exception:['Livraison non effectuée','لم يتم التوصيل'],exceptionHint:['L’agence va vous recontacter pour une nouvelle tentative.','ستتصل بك الوكالة لمحاولة جديدة.'],updated:['Mis à jour','آخر تحديث'],
tnd:['TND','د.ت'],gpsNotShared:['Position non partagée (pause / hors ligne)','الموقع غير مشارك (استراحة / غير متصل)'],gpsConsentTitle:['Partage de votre position','مشاركة موقعك'],gpsConsentText:['Pour vous proposer les livraisons les plus proches et permettre aux clients de suivre leur colis, SADEN utilise votre position GPS.','لاقتراح أقرب التوصيلات وتمكين الحرفاء من تتبع طرودهم، يستعمل سادن موقعك.'],gpsC1:['Uniquement pendant le service (Disponible ou En livraison).','فقط أثناء العمل (متاح أو قيد التوصيل).'],gpsC2:['Jamais en pause ni hors ligne : la transmission s’arrête.','لا يتم الإرسال أثناء الاستراحة أو عند عدم الاتصال.'],gpsC3:['Visible par votre agence et, pendant une livraison, par le client concerné.','مرئي لوكالتك وللحريف أثناء التوصيل.'],gpsAccept:['J’accepte et je passe « Disponible »','أوافق وأصبح متاحا'],gpsRefuse:['Refuser','رفض'],stalePos:['position ancienne','موقع قديم'],score:['Score','النقاط'],bkAvail:['dispo.','التوفر'],bkDist:['distance','المسافة'],bkZone:['zone','المنطقة'],bkLoad:['charge','الحمل'],bkVeh:['véhicule','المركبة'],wrongNumber:['Numéro incorrect','رقم خاطئ'],wrongAddress:['Adresse incorrecte','عنوان خاطئ'],damaged:['Endommagé','تالف'],reasonRequired:['Motif obligatoire.','السبب إجباري.'],reasonOptional:['Motif (facultatif).','السبب (اختياري).'],reasonPh:['Expliquez ce qui s’est passé…','اشرح ما حدث…'],confirmAction:['Confirmer','تأكيد'],cancelOrder:['Annuler la commande','إلغاء الطلب'],senderOverride:['modifier l’expéditeur','تعديل المرسل'],parcel:['Colis','الطرد'],description:['Description','الوصف'],descPh:['Ex. 2 paires de chaussures','مثال: زوجان من الأحذية'],pieces:['Pièces','عدد القطع'],piecesShort:['pièces','قطع'],externalRef:['Réf. externe (boutique)','مرجع المتجر'],notes:['Notes / instructions','ملاحظات'],source:['Origine','المصدر'],vManager:['Responsable d’agence','مسؤول الوكالة'],rManager:['Responsable','مسؤول'],agencies:['Agences','الوكالات'],geo:['Villes / Zones','المدن / المناطق'],allAgencies:['Toutes les agences','كل الوكالات'],tagline:['Plateforme logistique multi-agences','منصة لوجستية متعددة الوكالات'],choose:['— Choisir —','— اختر —'],originAgency:['Agence de départ','وكالة الانطلاق'],loginId:['Téléphone ou e-mail','الهاتف أو البريد الإلكتروني'],email:['E-mail','البريد الإلكتروني'],optional:['facultatif','اختياري'],
login:['Connexion','تسجيل الدخول'],staffTab:['Espace pro','الفضاء المهني'],trackTab:['Suivre mon colis','تتبع طردي'],loginSub:['Agence, livreurs et boutiques','الوكالة، الموزعون والمتاجر'],password:['Mot de passe','كلمة المرور'],signIn:['Se connecter','دخول'],
trackSub:['Entrez le numéro du colis et votre numéro de téléphone.','أدخل رقم الطرد ورقم هاتفك.'],parcelNo:['N° de colis','رقم الطرد'],trackBtn:['Suivre le colis','تتبع الطرد'],
setupTitle:['Compte administrateur','حساب المشرف'],setupSub:['Première utilisation : créez le compte de l’agence.','أول استعمال: أنشئ حساب الوكالة.'],fullName:['Nom complet','الاسم الكامل'],password2:['Confirmer le mot de passe','تأكيد كلمة المرور'],createAdmin:['Créer et se connecter','إنشاء والدخول'],pwdMismatch:['Les mots de passe ne correspondent pas.','كلمتا المرور غير متطابقتين.'],
logout:['Déconnexion','خروج'],install:['Installer l’app','تثبيت التطبيق'],
newAccount:['Créer un compte','إنشاء حساب'],role:['Rôle','الدور'],rDriver:['Livreur','موزع'],rShop:['Boutique','متجر'],rAdmin:['Admin','مشرف'],vehicle:['Véhicule','المركبة'],shopName:['Nom de la boutique','اسم المتجر'],contact:['Responsable','المسؤول'],createBtn:['Créer le compte','إنشاء الحساب'],
active:['Actif','نشط'],inactive:['Désactivé','معطل'],activate:['Activer','تفعيل'],deactivate:['Désactiver','تعطيل'],resetPwd:['Mot de passe','كلمة المرور'],resetPrompt:['Nouveau mot de passe (6 caractères min.) :','كلمة مرور جديدة (6 أحرف على الأقل):'],pwdChanged:['Mot de passe modifié','تم تغيير كلمة المرور'],
credsTitle:['Identifiants à transmettre','بيانات الدخول للإرسال'],credsHint:['Le compte se connecte avec ce téléphone et ce mot de passe sur l’écran de connexion.','يتم الدخول بهذا الهاتف وكلمة المرور.'],genPwd:['Générer','توليد'],allAccounts:['Tous les comptes','كل الحسابات'],
noAlerts:['Aucune alerte.','لا توجد تنبيهات.'],empty:['Aucun élément.','لا يوجد عناصر.'],replan:['Remettre en attente','إعادة للانتظار'],shareLink:['Lien de suivi','رابط التتبع'],copied:['Lien copié','تم نسخ الرابط'],viewProof:['Voir la preuve','عرض الإثبات'],otpCode:['Code OTP client','رمز الحريف'],
local:['Locale','محلي'],inter:['Inter-villes','بين المدن'],destCity:['Ville de destination','مدينة الوجهة'],cancel:['Annuler','إلغاء'],close:['Fermer','إغلاق'],label:['Libellé','البيان'],amount:['Montant','المبلغ'],type:['Type','النوع'],addMove:['Ajouter','إضافة'],
createBrd:['Créer le bordereau','إنشاء البوليصة'],brdHint:['Les colis en attente pour cette ville y sont ajoutés automatiquement.','تضاف الطرود المنتظرة لهذه المدينة تلقائيا.'],noBrd:['Aucun bordereau.','لا توجد بوليصات.'],
startShift:['Commencer le service','بدء العمل'],endShift:['Terminer le service','إنهاء العمل'],noMissions:['Aucune livraison pour le moment.','لا توجد توصيلات حاليا.'],
shopOpt:['Boutique (expéditeur)','المتجر (المرسل)'],agencyDirect:['Agence (sans boutique)','الوكالة (بدون متجر)'],orderCreated:['Colis créé','تم إنشاء الطرد'],accountCreated:['Compte créé','تم إنشاء الحساب'],saved:['Enregistré','تم الحفظ'],
errNetwork:['Connexion impossible au serveur.','تعذر الاتصال بالخادم.'],offlineNote:['Hors connexion — les données affichées peuvent être anciennes.','غير متصل — قد تكون البيانات قديمة.'],
period:[['14 jours','14 يوما'],['7 jours','7 أيام'],['Trimestre','الثلاثية']],revenue:["Chiffre d'affaires",'رقم المعاملات'],rate:['Taux de livraison','نسبة التسليم'],delay:['Délai moyen','متوسط المدة'],returns:['Retours','المرتجعات'],
ordersToday:["Commandes aujourd'hui",'طلبات اليوم'],deliveredK:['Livrées','تم تسليمها'],driversAvail:['Livreurs disponibles','موزعون متاحون'],codToday:['Encaissé (COD)','المبالغ المحصلة'],vsYesterday:['vs hier','مقارنة بالأمس'],
monthOrders:['Commandes du mois','طلبات الشهر'],inProgressK:['En cours','جارية'],toReceive:['COD livré ce mois','المبالغ المحصلة هذا الشهر'],noReviews:['Aucun avis pour le moment.','لا توجد تقييمات بعد.'],paid:['Payé','مدفوع'],
deliv:['liv.','توصيل']};
const ST={cree:['Créé','تم الإنشاء','n'],attente:['En attente','في الانتظار','w'],affecte:['Affecté','مُسند','i'],accepte:['Accepté','مقبول','i'],ramasse:['Ramassé','تم الاستلام','i'],transit:['En transit','في العبور','i'],arrive:['Arrivé agence dest.','وصل لوكالة الوجهة','i'],livraison:['En livraison','قيد التوصيل','o'],sur_place:['Livreur sur place','الموزع في المكان','o'],livre:['Livré','تم التسليم','g'],absent:['Client absent','الحريف غائب','r'],refuse:['Refusé','مرفوض','r'],reporte:['Reporté','مؤجل','w'],en_agence:['Reçu en agence','في الوكالة','i'],numero_incorrect:['Numéro incorrect','رقم خاطئ','r'],adresse_incorrecte:['Adresse incorrecte','عنوان خاطئ','r'],endommage:['Endommagé','تالف','r'],perdu:['Perdu','مفقود','r'],annule:['Annulé','ملغى','n'],retour:['En retour','في الإرجاع','w'],retour_agence:['Retour en agence','عاد إلى الوكالة','w'],restitue:['Restitué à l’expéditeur','أعيد إلى المرسل','n']};
const DS={dispo:['Disponible','متاح','g'],livraison:['En livraison','قيد التوصيل','o'],pause:['En pause','في استراحة','w'],off:['Hors ligne','غير متصل','n']};
const MS={affecte:['Nouvelle','جديدة','n'],accepte:['Acceptée','مقبولة','i'],livraison:['En route','في الطريق','o'],sur_place:['Arrivé','وصلت','o'],livre:['Livré','تم التسليم','g'],absent:['Client absent','الحريف غائب','r'],refuse:['Refusé','مرفوض','r'],reporte:['Reporté','مؤجل','w'],ramasse:['Ramassé','تم الاستلام','i'],numero_incorrect:['Numéro incorrect','رقم خاطئ','r'],adresse_incorrecte:['Adresse incorrecte','عنوان خاطئ','r'],endommage:['Endommagé','تالف','r'],annule:['Annulée','ملغاة','n'],retour:['En retour','في الإرجاع','w']};
const CS=[['Nouvelle','جديدة','r'],['En cours','قيد المعالجة','o'],['Traitée','تمت المعالجة','i'],['Fermée','مغلقة','g']];
const CATS=[['Retard','تأخير'],['Comportement du livreur','سلوك الموزع'],['Colis endommagé','طرد تالف'],["Problème d'encaissement",'مشكلة في الدفع'],["Problème d'adresse",'مشكلة في العنوان'],['Commande non livrée','طلب لم يُسلَّم'],['Autre','أخرى']];
const BST=[['Brouillon','مسودة'],['Validé','مؤكد'],['En transit','في العبور'],['Arrivé','وصل'],['Clôturé','مغلق']];
const CASH_TYPES={Encaissement:['التحصيل','g'],'Apport de fonds':['إيداع أموال','g'],'Paiement livreur':['خلاص موزع','i'],'Dépense':['مصروف','r'],'Règlement':['تسوية','o'],Transfert:['تحويل','i'],Correction:['تصحيح','w']};
const AGENCY_POS=[34.4250,8.7842]; // fallback map centre (Gafsa) when no agency has coordinates
const VEHICLES=['Moto','Scooter','Voiture','Vélo','Camionnette'];
const ACTIVE_ST=['affecte','accepte','ramasse','livraison','sur_place'],DRIVER_EXC=['absent','refuse','reporte','numero_incorrect','adresse_incorrecte','endommage'],EXC=[...DRIVER_EXC,'perdu'],RETURNS=['retour','retour_agence','restitue'];
// verbs for the status buttons computed by the server (GET /orders/:id → allowed)
const ACTION={attente:['Remettre en attente','إعادة للانتظار'],en_agence:['Reçu en agence','استلام في الوكالة'],retour:['Retour à l’expéditeur','إرجاع للمرسل'],retour_agence:['Retour reçu en agence','استلام الإرجاع'],restitue:['Restitué à l’expéditeur','تسليم للمرسل'],annule:['Annuler le colis','إلغاء الطرد'],perdu:['Déclarer perdu','التصريح بالضياع'],endommage:['Déclarer endommagé','التصريح بالتلف'],arrive:['Arrivé en agence','وصل إلى الوكالة']};

/* =========================================================
   helpers
   ========================================================= */
const UNITLESS=new Set(['fontWeight','opacity','flex','lineHeight','zIndex']);
const css=o=>Object.entries(o).map(([k,v])=>k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())+':'+(typeof v==='number'&&!UNITLESS.has(k)?v+'px':v)).join(';');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const each=(list,fn)=>list.map(fn).join('');
const when=(c,html)=>c?(typeof html==='function'?html():html):'';
let HANDLERS=[];
const on=fn=>{HANDLERS.push(fn);return `data-h="${HANDLERS.length-1}"`;};
const onInput=(fn,key)=>{HANDLERS.push(fn);return `data-i="${HANDLERS.length-1}" data-k="${key}"`;};
const badge=t=>({display:'inline-flex',alignItems:'center',padding:'3px 9px',borderRadius:999,fontSize:12,fontWeight:600,whiteSpace:'nowrap',background:`var(--${t}b)`,color:`var(--${t}f)`,border:'none'});
const DOT={g:'oklch(0.66 0.15 150)',o:'var(--orange)',w:'oklch(0.78 0.14 85)',n:'oklch(0.62 0.02 262)',i:'oklch(0.6 0.13 262)',r:'oklch(0.62 0.18 25)'};
const MAPC={g:'#3ea86a',o:'#ee8a3a',w:'#d9ad3c',n:'#8d94a5',i:'#5d7fd0',r:'#df5a4e',navy:'#22346b'};
const dot=(t,s=10)=>({width:s,height:s,borderRadius:'50%',background:DOT[t],flexShrink:0,marginTop:s<12?5:0,display:'inline-block'});
const fmt=(n,u)=>(Number(n)||0).toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3})+(u?' '+u:'');
const hm=iso=>iso?new Date(iso).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'';
const dm=iso=>iso?new Date(iso).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}):'';
const isToday=iso=>iso&&new Date(iso).toDateString()===new Date().toDateString();
const fmtPhone=p=>{const d=String(p||'').replace(/\D/g,'').slice(-8);return d.length===8?`+216 ${d.slice(0,2)} ${d.slice(2,5)} ${d.slice(5)}`:String(p||'—');};
const telHref=p=>'tel:+216'+String(p||'').replace(/\D/g,'').slice(-8);
const ago=iso=>{if(!iso)return '—';const s=Math.max(0,(Date.now()-new Date(iso))/1000);const ar=lang()==='ar';if(s<60)return ar?`منذ ${Math.round(s)} ث`:`il y a ${Math.round(s)} s`;if(s<3600)return ar?`منذ ${Math.round(s/60)} د`:`il y a ${Math.round(s/60)} min`;return isToday(iso)?hm(iso):dm(iso)+' '+hm(iso);};
const km=(a,b)=>{if(!a||!b)return null;const R=6371,r=x=>x*Math.PI/180,dLa=r(b[0]-a[0]),dLo=r(b[1]-a[1]);const h=Math.sin(dLa/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
const kmL=v=>v==null?'—':v.toLocaleString('fr-FR',{maximumFractionDigits:1})+' km';
const posOf=x=>x&&x.lat!=null&&x.lng!=null?[x.lat,x.lng]:null;
const STAFF_ROLES=['admin','manager'];
const isStaff=()=>STAFF_ROLES.includes(role());
/* geography (loaded from /api/geo: governorates → cities → zones, agencies) */
const G=()=>state.geo||{governorates:[],cities:[],zones:[],agencies:[]};
const cityById=id=>G().cities.find(c=>c.id===+id);
const zoneById=id=>G().zones.find(z=>z.id===+id);
const agencyById=id=>G().agencies.find(a=>a.id===+id);
const cityPos=c=>c&&c.lat!=null?[c.lat,c.lng]:null;
const agencyPos=a=>a?(a.lat!=null?[a.lat,a.lng]:cityPos(cityById(a.city_id))):null;
const myAgency=()=>state.session?.agency||null;
const homeAgency=()=>myAgency()||agencyById(state.agencyFilter)||G().agencies.find(a=>a.active)||null;
const homePos=()=>agencyPos(homeAgency())||AGENCY_POS;
const cityLabel=c=>{if(!c)return '—';const g=G().governorates.find(x=>x.id===c.governorate_id);return g&&g.name!==c.name?c.name+' ('+g.name+')':c.name;};
const cityOptions=()=>G().cities.filter(c=>c.active).map(c=>[c.id,cityLabel(c)]).sort((a,b)=>a[1].localeCompare(b[1]));
const zoneOptions=cityId=>G().zones.filter(z=>z.city_id===+cityId&&z.active).map(z=>[z.id,z.name]);
const agencyOptions=(pred=()=>true)=>G().agencies.filter(a=>a.active&&pred(a)).map(a=>[a.id,a.name]);
const orderPos=o=>posOf(o)||(o.zone_lat!=null?[o.zone_lat,o.zone_lng]:null)||cityPos(cityById(o.dest_city_id));
const destLabel=o=>o.intercity?'→ '+(o.dest_city_name||'?')+(o.zone_name?' · '+o.zone_name:''):(o.zone_name||'—');
const pad4=n=>String(n).padStart(4,'0');
const genPwd=()=>{const a='abcdefghjkmnpqrstuvwxyz23456789';let s='';const r=crypto.getRandomValues(new Uint32Array(8));for(const x of r)s+=a[x%a.length];return s;};

const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch{return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}},del(k){try{localStorage.removeItem(k);}catch{}}};

/* =========================================================
   state
   ========================================================= */
const prefersDark=()=>{try{return matchMedia('(prefers-color-scheme: dark)').matches;}catch{return false;}};
const emptyOrder=()=>({shop_id:'',origin_agency_id:'',sender_name:'',sender_phone:'',sender_address:'',client_name:'',client_phone:'',client_phone2:'',exchange:false,exchange_description:'',dest_city_id:'',zone_id:'',address:'',description:'',pieces:'1',external_ref:'',notes:'',cod:'',payment_mode:'cod',weight:'',parcel_type:'',lat:null,lng:null});
let state={
  prefs:{dir:'a',theme:prefersDark()?'dark':'light',lang:'fr',...store.get('saden.prefs',{})},
  session:store.get('saden.session',null), trackAuth:store.get('saden.track',null),
  boot:true, needsSetup:false, geo:null, pricing:null, quotes:{}, agencyFilter:store.get('saden.agencyFilter',''), offline:false, busy:false, toast:null, modal:null,
  loginTab:'staff', login:{phone:'',password:''}, setup:{name:'',email:'',phone:'',password:'',password2:''}, setupEmail:null, track:{ref:'',phone:''}, loginErr:null,
  // admin
  page:'dash', data:null, stats:null, users:null, filter:'all', q:'', sel:null, selData:null, amode:'auto', selDrv:null, selBrd:null, period:0,
  oform:emptyOrder(), uform:{role:'driver',name:'',email:'',phone:'',password:genPwd(),agency_id:'',zone_id:'',vehicle:'Moto',shop_name:'',address:''}, creds:null,
  cform:{label:'',type:'Encaissement',amount:''}, bform:{open:false,origin_agency_id:'',dest_agency_id:'',carrier:''},
  // shop
  shop:null, form:emptyOrder(), shopSent:null,
  // driver
  drv:null, lv:'home', curId:null, proofMode:'otp', otp:'', photo:null, sig:null, myPos:null, geoErr:false, doneInfo:null,
  // client
  trk:null, stars:0, comment:'', cClaim:false, cCat:null, cSent:null,
};
const lang=()=>state.prefs.lang;
const role=()=>state.session?.user?.role||(state.trackAuth?'client':null);
function setState(patch){state={...state,...(typeof patch==='function'?patch(state):patch)};render();}
const set=o=>()=>setState(o);
function setPref(p){state.prefs={...state.prefs,...p};store.set('saden.prefs',state.prefs);render();}

let toastTimer;
function toast(msg,kind='ok'){clearTimeout(toastTimer);state.toast={msg,kind};render();toastTimer=setTimeout(()=>{state.toast=null;render();},kind==='err'?5000:2800);}

/* =========================================================
   API
   ========================================================= */
async function api(path,{method='GET',body}={}){
  let r;
  try{
    r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json',...(state.session?{Authorization:'Bearer '+state.session.token}:{})},body:body?JSON.stringify(body):undefined});
  }catch{state.offline=true;throw new Error(L().errNetwork);}
  state.offline=false;
  let j={};try{j=await r.json();}catch{}
  if(r.status===401&&state.session&&!path.startsWith('auth/')){logout(false);throw new Error(j.error||'Session expirée');}
  if(!r.ok)throw Object.assign(new Error(j.error||('Erreur '+r.status)),{status:r.status,code:j.code});
  return j;
}
async function act(fn,okMsg){
  if(state.busy)return;
  state.busy=true;render();
  try{await fn();if(okMsg)toast(okMsg);await refresh(true);}
  catch(e){toast(e.message,'err');}
  finally{state.busy=false;render();}
}
async function refresh(silent){
  const r=role();
  try{
    if((r==='admin'||r==='manager'||r==='shop')&&!state.geo)state.geo=await api('geo');
    if(r==='admin'||r==='manager'){
      const af=r==='admin'&&state.agencyFilter?'agency_id='+encodeURIComponent(state.agencyFilter):'';
      const [d,extra]=await Promise.all([api('admin/overview'+(af?'?'+af:'')),
        curPage()==='stats'?api(statsQuery()):null,
      ]);
      state.data=d;if(extra)state.stats=extra;
      if(curPage()==='journal'){if(!state.users)state.users=(await api('users')).users;await loadJournal();}
      if(curPage()==='accounts'||curPage()==='agencies')state.users=(await api('users'+(af&&curPage()==='accounts'?'?'+af:''))).users;
      if(['agencies','geo'].includes(curPage()))state.geo=await api('geo');
      if(curPage()==='pricing')state.pricing=await api('pricing');
      if(curPage()==='cash')await loadCash();
      if(curPage()==='partners')[state.partners,state.webhooks]=await Promise.all([api('partners').then(r=>r.partners),api('webhooks').then(r=>r.deliveries)]);
      if(state.page==='stock')await loadStock().catch(()=>{});
      if(state.page==='ops')await loadOps().catch(()=>{});
      if(state.page==='colis')await loadParcels().catch(()=>{});
      if(state.page==='dash')state.dops=await api('dashboard/ops'+(af?'?'+af:'')).catch(()=>state.dops);
      if(state.page==='brd')await loadBrdList().catch(()=>{});
      if(state.sel)state.selData=await api('orders/'+state.sel).catch(()=>null);
    }else if(r==='driver'){state.drv=await api('driver/overview');startGeo();}
    else if(r==='shop'){state.shop=await api('shop/overview');state.shopPickups=(await api('shop/pickups').catch(()=>({pickups:[]}))).pickups;}
    else if(r==='client'){state.trk=await api('track',{method:'POST',body:state.trackAuth});}
    if(r&&r!=='client')await loadNotifs();
  }catch(e){if(!silent)toast(e.message,'err');}
  render();
}
function saveSession(s){state.session=s;store.set('saden.session',s);}
function resetMaps(){Object.keys(MAPS).forEach(k=>{try{MAPS[k].map.stop();MAPS[k].map.off();MAPS[k].map.remove();}catch{}delete MAPS[k];});}
function logout(doRender=true){
  stopGeo();resetMaps();
  state.session=null;state.trackAuth=null;state.data=state.drv=state.shop=state.trk=state.users=state.stats=state.geo=null;state.sel=null;state.selData=null;state.page='dash';state.lv='home';state.cSent=null;
  store.del('saden.session');store.del('saden.track');
  if(doRender)render();
}
async function afterLogin(){
  state.loginErr=null;
  if(role()==='driver')startGeo();
  await refresh();
}

/* =========================================================
   driver geolocation
   ========================================================= */
let geoWatch=null,lastSent=0,battery=null;
const geoSharing=()=>{const me=state.drv?.me;return !!me&&!!me.gps_consent_at&&['dispo','livraison'].includes(me.status);};
function startGeo(){
  // §12: the position is shared only while on duty (Disponible / En livraison) and after explicit consent
  if(!geoSharing()){stopGeo();return;}
  if(!('geolocation' in navigator)||geoWatch!=null){if(!('geolocation' in navigator))state.geoErr=true;return;}
  navigator.getBattery?.().then(b=>{battery=b;}).catch(()=>{});
  geoWatch=navigator.geolocation.watchPosition(p=>{
    state.myPos=[p.coords.latitude,p.coords.longitude];
    if(state.geoErr){state.geoErr=false;render();}
    const st=state.drv?.me?.status;
    if(Date.now()-lastSent>20000&&geoSharing()){lastSent=Date.now();api('me/location',{method:'POST',body:{lat:state.myPos[0],lng:state.myPos[1],battery:battery?Math.round(battery.level*100):null}}).catch(()=>{});}
  },()=>{state.geoErr=true;render();},{enableHighAccuracy:true,maximumAge:15000,timeout:30000});
}
function stopGeo(){if(geoWatch!=null){navigator.geolocation.clearWatch(geoWatch);geoWatch=null;}}

/* =========================================================
   misc actions
   ========================================================= */
async function shareTrack(ref){
  const url=location.origin+'/?t='+encodeURIComponent(ref);
  try{if(navigator.share){await navigator.share({title:'SADEN · '+ref,text:L().track+' '+ref,url});return;}await navigator.clipboard.writeText(url);toast(L().copied);}
  catch(e){if(e?.name!=='AbortError')prompt(L().shareLink,url);}
}
function useGps(key){
  if(!navigator.geolocation)return toast(L().gpsOff,'err');
  navigator.geolocation.getCurrentPosition(p=>{state[key]={...state[key],lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6)};render();},()=>toast(L().gpsOff,'err'),{enableHighAccuracy:true,timeout:15000});
}
function compressImage(file,max=1024,quality=0.7){return new Promise((res,rej)=>{const img=new Image();img.onload=()=>{const s=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);res(c.toDataURL('image/jpeg',quality));};img.onerror=rej;img.src=URL.createObjectURL(file);});}

/* =========================================================
   shared templates
   ========================================================= */
let _L=null;const L=()=>_L;
const CARD='background:var(--surface);border:1px solid var(--line);border-radius:var(--r)';
const BTN_PRIMARY='padding:11px 16px;border-radius:var(--r);border:none;background:var(--orange);color:var(--onOrange);font-weight:700;cursor:pointer';
const BTN_GHOST='padding:9px 14px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);color:var(--ink);font-weight:600;cursor:pointer';
const seg=on=>({whiteSpace:'nowrap',padding:'6px 11px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12.5,fontWeight:600,background:on?'var(--orange)':'transparent',color:on?'oklch(0.18 0.03 262)':'oklch(0.92 0.01 262)'});
const chip=on=>({whiteSpace:'nowrap',padding:'7px 13px',borderRadius:999,border:'1px solid var(--line)',cursor:'pointer',fontWeight:600,fontSize:13,background:on?'var(--navy)':'var(--surface)',color:on?'oklch(0.98 0.005 262)':'var(--ink)'});
const pill=on=>({padding:'5px 11px',borderRadius:999,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:on?'var(--navy)':'transparent',color:on?'oklch(0.98 0.005 262)':'var(--mute)'});
const segGroup=(list,cls='')=>`<div class="${cls}" style="display:flex;gap:2px;background:oklch(0.22 0.035 262);padding:3px;border-radius:8px">${each(list,v=>`<button ${on(v.go)} style="${css(v.st)}">${esc(v.label)}</button>`)}</div>`;
const kpiCard=(label,value,sub)=>`<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:6px;min-width:0"><span style="font-size:12px;color:var(--mute);font-weight:500">${esc(label)}</span><span style="font-family:var(--disp);font-size:var(--kpi);font-weight:700;line-height:1;overflow-wrap:anywhere">${esc(value)}</span>${when(sub!=null,`<span style="font-size:12px;color:var(--mute)">${esc(sub)}</span>`)}</div>`;
const field=(label,inner)=>`<label style="display:flex;flex-direction:column;gap:4px;min-width:0"><span style="font-size:12px;color:var(--mute)">${esc(label)}</span>${inner}</label>`;
// input that also refreshes the live price quote of an order form
const inputQ=(key,obj,prop,attrs='')=>`<input class="fld" ${onInput(e=>{state[obj]={...state[obj],[prop]:e.target.value};requestQuote(obj);},key)} value="${esc(state[obj][prop])}" ${attrs}>`;
const input=(key,obj,prop,attrs='')=>`<input class="fld" ${onInput(e=>{state[obj]={...state[obj],[prop]:e.target.value};},key)} value="${esc(state[obj][prop])}" ${attrs}>`;
const select=(key,obj,prop,opts,rerender=false)=>`<select class="fld" ${onInput(e=>{state[obj]={...state[obj],[prop]:e.target.value};if(rerender)render();},key)}>${each(opts,([v,l])=>`<option value="${esc(v)}"${String(v)===String(state[obj][prop])?' selected':''}>${esc(l)}</option>`)}</select>`;
const stL=k=>(ST[k]||[k,k])[lang()==='ar'?1:0],stB=k=>badge((ST[k]||[0,0,'n'])[2]);
const empty=msg=>`<div style="padding:18px var(--pad);color:var(--mute)">${esc(msg||L().empty)}</div>`;
const spin=()=>state.busy?'<span class="spin"></span> ':'';
const mapBox=(key,h,extra='')=>`<div class="map" data-map="${key}" style="height:${h};${extra}"></div>`;

function tplTopBar(){
  const Lx=L(),u=state.session?.user,r=role();
  const roleL={admin:Lx.vAdmin,manager:Lx.vManager,driver:Lx.vDriver,shop:Lx.vShop,client:Lx.vClient}[r]+(myAgency()?' · '+myAgency().name:'');
  return `<header class="topbar no-print" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;padding:10px 18px;padding-top:calc(10px + env(safe-area-inset-top));background:oklch(0.15 0.03 262);color:oklch(0.97 0.005 262)">
  <div style="display:flex;align-items:center;gap:8px;font-family:var(--disp);font-weight:700;font-size:18px;letter-spacing:0.04em">${brandLogo(34)}${esc(BRAND.name)}<span class="hide-sm" style="font-weight:500;font-size:13px;letter-spacing:0;color:oklch(0.8 0.02 262)">Delivery</span></div>
  ${when(r,`<div style="display:flex;flex-direction:column;line-height:1.2;min-width:0"><span style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${esc(u?(u.role==='shop'?u.shop_name:u.name):state.trackAuth?.ref)}</span><span style="font-size:11px;color:oklch(0.78 0.03 262)">${esc(roleL)}</span></div>`)}
  <div style="flex:1"></div>
  ${tplTaskBadge()}${tplBell()}
  ${when(installEvt,`<button ${on(doInstall)} style="${css(seg(true))}">⤓ <span class="hide-sm">${esc(Lx.install)}</span></button>`)}
  ${when(r==='admin'||r==='manager',segGroup([['a','A · Opérations'],['b','B · Aéré'],['c','C · Terrain']].map(([k,l])=>({label:l,st:seg(state.prefs.dir===k),go:()=>setPref({dir:k})})),'hide-sm'))}
  ${segGroup([['fr','FR'],['ar','عربي']].map(([k,l])=>({label:l,st:seg(lang()===k),go:()=>setPref({lang:k})})))}
  ${segGroup([['light','☀'],['dark','☾']].map(([k,l])=>({label:l,st:seg(state.prefs.theme===k),go:()=>setPref({theme:k})})))}
  ${when(r,`<button ${on(()=>logout())} title="${esc(Lx.logout)}" aria-label="${esc(Lx.logout)}" style="${css({...seg(false),border:'1px solid oklch(1 0 0 / .18)',display:'flex',alignItems:'center',gap:6})}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg><span class="hide-sm">${esc(Lx.logout)}</span></button>`)}
</header>
${when(state.offline,`<div class="no-print" style="background:var(--wb);color:var(--wf);padding:6px 18px;font-size:12.5px;font-weight:600">${esc(Lx.offlineNote)}</div>`)}`;
}

/* =========================================================
   login
   ========================================================= */
function tplLogin(){
  const Lx=L(),tab=state.loginTab;
  const err=when(state.loginErr,`<div style="padding:10px;border-radius:var(--r);background:var(--rb);color:var(--rf);font-weight:600">${esc(state.loginErr)}</div>`);
  const submitLogin=()=>act(async()=>{const r=await api('auth/login',{method:'POST',body:{login:state.login.phone,password:state.login.password}});saveSession(r);state.login={phone:'',password:''};await afterLogin();}).then(()=>{});
  const submitSetup=()=>{const s=state.setup;if(s.password!==s.password2)return toast(Lx.pwdMismatch,'err');act(async()=>{const r=await api('auth/setup',{method:'POST',body:s});saveSession(r);state.needsSetup=false;await afterLogin();});};
  const submitTrack=()=>act(async()=>{const r=await api('track',{method:'POST',body:state.track});state.trackAuth={ref:r.ref,phone:state.track.phone};store.set('saden.track',state.trackAuth);state.trk=r;});
  let body;
  if(tab==='staff'&&state.needsSetup) body=`<form data-form="setup" style="display:flex;flex-direction:column;gap:12px">
      <div><b style="font-size:17px">${esc(Lx.setupTitle)}</b><div style="color:var(--mute);margin-top:4px">${esc(Lx.setupSub)}</div></div>
      ${field(Lx.fullName,input('s-name','setup','name','autocomplete="name" required'))}
      ${field(Lx.email,input('s-email','setup','email',`type="email" autocomplete="email" autocapitalize="none" required${state.setupEmail?' readonly':''}`))}
      ${field(Lx.phone+' ('+Lx.optional+')',input('s-phone','setup','phone','type="tel" inputmode="tel" autocomplete="tel" placeholder="+216 …"'))}
      ${field(Lx.password,input('s-pw','setup','password','type="password" autocomplete="new-password" minlength="6" required'))}
      ${field(Lx.password2,input('s-pw2','setup','password2','type="password" autocomplete="new-password" minlength="6" required'))}
      <button ${on(submitSetup)} type="button" style="${BTN_PRIMARY};min-height:48px">${spin()}${esc(Lx.createAdmin)}</button></form>`;
  else if(tab==='staff') body=`<form data-form="login" style="display:flex;flex-direction:column;gap:12px">
      <div style="color:var(--mute)">${esc(Lx.loginSub)}</div>
      ${field(Lx.loginId,input('l-phone','login','phone','type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="+216 … / nom@exemple.com" required'))}
      ${field(Lx.password,input('l-pw','login','password','type="password" autocomplete="current-password" required'))}
      <button ${on(submitLogin)} type="button" data-submit style="${BTN_PRIMARY};min-height:48px">${spin()}${esc(Lx.signIn)}</button></form>`;
  else body=`<form data-form="track" style="display:flex;flex-direction:column;gap:12px">
      <div style="color:var(--mute)">${esc(Lx.trackSub)}</div>
      ${field(Lx.parcelNo,input('t-ref','track','ref','placeholder="SD-24187" autocapitalize="characters" style="font-family:var(--mono)" required'))}
      ${field(Lx.phone,input('t-phone','track','phone','type="tel" inputmode="tel" placeholder="+216 …" required'))}
      <button ${on(submitTrack)} type="button" data-submit style="${BTN_PRIMARY};min-height:48px">${spin()}${esc(Lx.trackBtn)}</button></form>`;
  const tabs=[['staff',Lx.staffTab],['track',Lx.trackTab]];
  return `<main style="flex:1;display:flex;align-items:center;justify-content:center;padding:28px 16px calc(28px + env(safe-area-inset-bottom))">
    <div style="width:100%;max-width:420px;display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;flex-direction:column;gap:6px;align-items:center;text-align:center">
        ${brandLogo(128,28)}
        <b style="font-family:var(--disp);font-size:26px;letter-spacing:0.03em">${esc(BRAND.full)}</b>
        <span style="color:var(--mute)">${esc(Lx.tagline)}</span>
      </div>
      <div style="${CARD};padding:18px;display:flex;flex-direction:column;gap:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;background:var(--surface2);padding:4px;border-radius:var(--r)">
          ${each(tabs,([k,l])=>`<button ${on(set({loginTab:k,loginErr:null}))} style="min-height:42px;border-radius:var(--r);border:none;font-weight:700;cursor:pointer;background:${tab===k?'var(--surface)':'transparent'};color:${tab===k?'var(--ink)':'var(--mute)'}">${esc(l)}</button>`)}
        </div>
        ${err}${body}
      </div>
    </div>
  </main>`;
}

/* =========================================================
   ADMIN
   ========================================================= */
const NAV=[['dash','TB'],['map','CA'],['orders','CO'],['colis','CL'],['ops','SC'],['stock','SK'],['brd','BR'],['drivers','LV'],['shops','BQ'],['agencies','AG','admin'],['cash','CS'],['stats','ST'],['claims','RC'],['journal','JR','admin'],['settings','PA']];
/* « Paramètres » groups the configuration screens (each still follows its own permissions) */
const SETTINGS=[['accounts'],['pricing'],['geo','admin'],['partners','admin']];
const settingsFor=()=>SETTINGS.filter(x=>!x[1]||x[1]===role()).map(x=>x[0]);
/* page actually displayed (settings → its active sub-page) */
const curPage=()=>state.page==='settings'?(settingsFor().includes(state.setTab)?state.setTab:'accounts'):state.page;
const navFor=()=>NAV.filter(n=>!n[2]||n[2]===role());
const scopeName=()=>role()==='manager'?myAgency()?.name||'—':(agencyById(state.agencyFilter)?.name||L().allAgencies);
function goPage(p){
  state.page=p;state.sel=null;state.selData=null;
  if(p!=='orders')state.q='';state.searchOpen=false;
  render();
  if(['stats','accounts','agencies','geo','pricing','partners','journal','settings','stock','ops','colis','dash'].includes(p))refresh(true);
  scrollTo(0,0);
}
function selectOrder(id){state.sel=id;state.selData=null;state.page='orders';render();api('orders/'+id).then(d=>{if(state.sel===id){state.selData=d;render();}}).catch(e=>toast(e.message,'err'));}

function tplNav(){
  const Lx=L(),d=state.data,dir=state.prefs.dir;
  const nWait=d?d.orders.filter(o=>o.status==='attente').length:0,nClaim=d?d.claims.filter(c=>c.status===0).length:0;
  const items=navFor().map(([k,code])=>{const onn=state.page===k,count=k==='orders'?nWait:k==='claims'?nClaim:0;return{k,code,label:Lx[k],count,on:onn};});
  const cnt=n=>when(n.count>0,`<span style="background:var(--orange);color:var(--onOrange);font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px">${n.count}</span>`);
  if(dir==='a')return `<nav class="nav-side no-print" style="width:232px;flex-shrink:0;background:var(--navy);color:oklch(0.97 0.005 262);padding:18px 12px;display:flex;flex-direction:column;gap:4px">
    <div class="nav-meta" style="padding:4px 12px 16px;display:flex;flex-direction:column;gap:2px"><div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:oklch(0.78 0.03 262)">${esc(Lx.agencyLbl)}</div><div style="font-weight:600;font-size:15px">${esc(scopeName())}</div></div>
    ${each(items,n=>`<button ${on(()=>goPage(n.k))} style="${css({display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,width:'100%',padding:'9px 12px',border:'none',borderInlineStart:n.on?'3px solid var(--orange)':'3px solid transparent',borderRadius:'var(--r)',background:n.on?'oklch(1 0 0 / 0.1)':'transparent',color:n.on?'oklch(0.99 0 0)':'oklch(0.86 0.02 262)',fontWeight:n.on?600:500,cursor:'pointer',textAlign:'start',whiteSpace:'nowrap'})}"><span>${esc(n.label)}</span>${cnt(n)}</button>`)}
    <div class="nav-meta" style="margin-top:auto;padding:12px;border-top:1px solid oklch(1 0 0 / 0.12);display:flex;flex-direction:column;gap:2px"><div style="font-weight:600">${esc(state.session.user.name)}</div><div style="font-size:12px;color:oklch(0.78 0.03 262)">${esc(role()==='manager'?Lx.vManager:Lx.vAdmin)}</div></div>
  </nav>`;
  if(dir==='c')return `<nav class="nav-rail no-print" style="width:88px;flex-shrink:0;background:var(--navy);color:oklch(0.97 0.005 262);padding:14px 8px;display:flex;flex-direction:column;gap:6px;align-items:stretch">
    <div class="nav-logo" style="height:40px;display:flex;align-items:center;justify-content:center;font-family:var(--disp);font-weight:700;font-size:13px;color:var(--orange)">${esc((role()==='manager'?myAgency()?.name:agencyById(state.agencyFilter)?.name||'ALL').replace(/^Agence\s+/i,'').slice(0,3).toUpperCase())}</div>
    ${each(items,n=>`<button ${on(()=>goPage(n.k))} style="${css({display:'flex',flexDirection:'column',alignItems:'center',gap:4,padding:'10px 4px',border:'none',borderRadius:'var(--r)',cursor:'pointer',background:n.on?'var(--orange)':'transparent',color:n.on?'oklch(0.18 0.03 262)':'oklch(0.88 0.02 262)',minWidth:64})}"><span style="font-family:var(--disp);font-size:20px;font-weight:700;line-height:1">${n.code}</span><span style="font-size:10.5px;line-height:1.15;text-align:center">${esc(n.label)}</span></button>`)}
  </nav>`;
  return `<nav class="no-print" style="display:flex;align-items:center;gap:6px;padding:10px 28px;background:var(--surface);border-bottom:1px solid var(--line);overflow-x:auto">
    <div style="font-weight:700;padding-inline-end:18px;white-space:nowrap">${esc(scopeName())}</div>
    ${each(items,n=>`<button ${on(()=>goPage(n.k))} style="${css({display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:999,border:'none',whiteSpace:'nowrap',cursor:'pointer',fontWeight:600,background:n.on?'var(--navy)':'transparent',color:n.on?'oklch(0.98 0.005 262)':'var(--mute)'})}">${esc(n.label)}${cnt(n)}</button>`)}
  </nav>`;
}

function driverRow(d){const t=DS[d.status]?.[2]||'n';return{...d,t,stLabel:(DS[d.status]||DS.off)[lang()==='ar'?1:0],pos:posOf(d),dist:km(posOf(d),agencyPos(agencyById(d.agency_id))||homePos())};}

function tplDash(){
  const Lx=L(),d=state.data,k=d.kpis,li=lang()==='ar'?1:0,u=Lx.tnd;
  const drivers=d.drivers.filter(x=>x.active).map(driverRow);
  const nWait=d.orders.filter(o=>o.status==='attente').length;
  const diff=k.yesterday?Math.round((k.today-k.yesterday)/k.yesterday*100):null;
  const alerts=[
    ...drivers.filter(x=>x.status==='pause'||(x.battery!=null&&x.battery<25&&x.status!=='off')).map(x=>['w',li?`${x.name} — ${x.stLabel}${x.battery!=null?'، البطارية '+x.battery+'٪':''}`:`${x.name} — ${x.stLabel.toLowerCase()}${x.battery!=null?', batterie '+x.battery+' %':''}`]),
    ...d.orders.filter(o=>o.status==='absent'&&isToday(o.updated_at)).map(o=>['r',li?`${o.ref} — الحريف غائب، يجب برمجة محاولة ثانية`:`${o.ref} — client absent, nouvelle tentative à planifier`,()=>selectOrder(o.id)]),
    ...d.manifests.filter(m=>m.stage===0).map(m=>['o',li?`${m.ref} — غير مؤكد`:`${m.ref} — bordereau non validé`,()=>selectBrd(m.id,m.type)]),
    ...(nWait?[['i',li?`${nWait} طلبات في انتظار الإسناد`:`${nWait} commande(s) en attente d’affectation`,()=>{state.filter='attente';goPage('orders');}]]:[]),
  ].slice(0,6);
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:var(--gap)">
      ${kpiCard(Lx.ordersToday,String(k.today),diff==null?'':(diff>=0?'+':'')+diff+' % '+Lx.vsYesterday)}
      ${kpiCard(Lx.deliveredK,String(k.delivered),k.today?Math.round(k.delivered/k.today*100)+' %':'')}
      ${kpiCard(Lx.driversAvail,drivers.filter(x=>x.status==='dispo').length+' / '+drivers.length,drivers.filter(x=>x.status==='livraison').length+' '+(li?'قيد التوصيل':'en livraison'))}
      ${kpiCard(Lx.codToday,fmt(k.cod_today),u)}
      ${kpiCard(Lx.returns,String(k.returns),k.today?Math.round(k.returns/k.today*100)+' %':'')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:var(--gap)">
      <div class="span2" style="grid-column:span 2;min-width:0;${CARD};overflow:hidden;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--pad)"><b>${esc(Lx.liveMap)}</b><button ${on(()=>goPage('map'))} style="background:none;border:none;color:var(--of);font-weight:600;cursor:pointer">${esc(Lx.seeAll)} →</button></div>
        ${mapBox('ops','320px')}
      </div>
      <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:10px">
        <b>${esc(Lx.alerts)}</b>
        ${alerts.length?each(alerts,a=>`<div ${a[2]?on(a[2]):''} style="display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:var(--r);background:var(--surface2);${a[2]?'cursor:pointer':''}"><span style="${css(dot(a[0]))}"></span><span style="text-wrap:pretty;line-height:1.4">${esc(a[1])}</span></div>`):`<span style="color:var(--mute)">${esc(Lx.noAlerts)}</span>`}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:var(--gap)">
      <div class="span2" style="grid-column:span 2;min-width:0;${CARD};overflow:hidden">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--pad)"><b>${esc(Lx.recent)}</b><button ${on(()=>goPage('orders'))} style="background:none;border:none;color:var(--of);font-weight:600;cursor:pointer">${esc(Lx.seeAll)} →</button></div>
        <div style="overflow-x:auto"><div style="min-width:600px">${d.orders.length?each(d.orders.slice(0,6),o=>`
          <div ${on(()=>selectOrder(o.id))} style="display:grid;grid-template-columns:96px minmax(0,1.3fr) minmax(0,1fr) 140px 110px;gap:12px;align-items:center;padding:10px var(--pad);border-top:1px solid var(--line);cursor:pointer">
            <span style="font-family:var(--mono);font-size:12px">${esc(o.ref)}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.client_name)}</span><span style="color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.shop_name||Lx.agencyLbl)}</span><span><span style="${css(stB(o.status))}">${esc(stL(o.status))}</span></span><span style="text-align:end;font-weight:600">${esc(fmt(o.cod,u))}</span>
          </div>`):empty()}</div></div>
      </div>
      <div style="${CARD};overflow:hidden">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--pad)"><b>${esc(Lx.lastBrd)}</b><button ${on(()=>goPage('brd'))} style="background:none;border:none;color:var(--of);font-weight:600;cursor:pointer">${esc(Lx.seeAll)} →</button></div>
        ${d.manifests.length?each(d.manifests.slice(0,4),m=>`<div ${on(()=>selectBrd(m.id,m.type))} style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px var(--pad);border-top:1px solid var(--line);cursor:pointer">
          <div style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-weight:600">${esc(btL(m.type))} · ${esc(brdTitle(m))}</span><span style="font-family:var(--mono);font-size:11.5px;color:var(--mute)">${esc(m.ref)} · ${m.n} ${esc(Lx.lines)}</span></div>
          ${stageBadge(m)}</div>`):empty(Lx.noBrd)}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:var(--gap)">${tplRatingsCard()}</div>`;
}

function tplMap(){
  const Lx=L(),drivers=state.data.drivers.filter(x=>x.active).map(driverRow);
  const selId=state.selDrv??drivers[0]?.id,d=drivers.find(x=>x.id===selId);
  const legend=Object.keys(DS).map(k=>({label:DS[k][lang()==='ar'?1:0],n:drivers.filter(x=>x.status===k).length,t:DS[k][2]}));
  return `<div class="split" style="display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:var(--gap)">
    <div style="position:relative;border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
      ${mapBox('opsBig','min(70vh,640px)','min-height:380px')}
      <div style="position:absolute;inset-inline-start:12px;bottom:12px;display:flex;flex-wrap:wrap;gap:6px;z-index:500">
        ${each(legend,g=>`<span style="display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);padding:5px 10px;border-radius:999px;font-size:12px;font-weight:600"><span style="${css(dot(g.t,9))};margin:0"></span>${esc(g.label)} · ${g.n}</span>`)}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:var(--gap)">
      ${d?`<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="display:flex;flex-direction:column;gap:2px"><b style="font-size:16px">${esc(d.name)}</b><span style="color:var(--mute)">${esc(d.zone||'—')} · ${esc(d.vehicle||'—')}</span></div><span style="${css(badge(d.t))}">${esc(d.stLabel)}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${each([[Lx.lastPos,ago(d.last_seen)],[Lx.distance,kmL(d.dist)],[Lx.battery,d.battery!=null?d.battery+' %':'—'],[Lx.deliveriesToday,d.today+' · '+d.active_count+' '+Lx.inProgress]],([k2,v])=>`<div style="background:var(--surface2);border-radius:var(--r);padding:10px;display:flex;flex-direction:column;gap:2px"><span style="font-size:11.5px;color:var(--mute)">${esc(k2)}</span><b>${esc(v)}</b></div>`)}
        </div>
        <a href="${telHref(d.phone)}" style="${BTN_GHOST};text-align:center;text-decoration:none">✆ ${esc(fmtPhone(d.phone))}</a>
      </div>`:''}
      <div style="${CARD};overflow:hidden">
        ${drivers.length?each(drivers,x=>`<div ${on(()=>{state.selDrv=x.id;const m=MAPS.opsBig;if(m&&x.pos)m.map.setView(x.pos,15);render();})} style="display:flex;align-items:center;gap:10px;padding:11px var(--pad);border-bottom:1px solid var(--line);cursor:pointer;background:${x.id===selId?'var(--surface2)':'transparent'}"><span style="${css(dot(x.t))};margin:0"></span><span style="flex:1;font-weight:600">${esc(x.name)}</span><span style="color:var(--mute);font-size:12px">${esc(x.pos?kmL(x.dist):'—')}</span></div>`):empty()}
      </div>
    </div>
  </div>`;
}

function tplOrderDetail(){
  const Lx=L(),u=Lx.tnd,li=lang()==='ar'?1:0,sd=state.selData;
  if(!sd)return `<div style="${CARD};padding:24px;align-self:start;color:var(--mute)"><span class="spin"></span></div>`;
  const o=sd.order;
  // §14 ranking computed by the server (same agency, fresh GPS, availability, zone, load, vehicle)
  const asg=sd.assignment,cand=asg?.candidates||[];
  const best=cand.find(x=>x.id===asg?.recommended);
  const list=state.amode==='auto'?cand.slice(0,3):cand;
  const canAssign=!!asg;
  const hAg=agencyById(asg?.agency_id);
  const toggleAuto=()=>act(async()=>{await api('agencies/'+hAg.id,{method:'PATCH',body:{auto_assign:!hAg.auto_assign}});state.geo=await api('geo');},Lx.saved);
  const BK={availability:Lx.bkAvail,distance:Lx.bkDist,zone:Lx.bkZone,load:Lx.bkLoad,vehicle:Lx.bkVeh};
  const assign=x=>()=>act(()=>api(`orders/${o.id}/assign`,{method:'POST',body:{driver_id:x.id}}),Lx.saved);
  const facts=[[Lx.sender,[o.sender_name||o.shop_name||Lx.agencyLbl,o.sender_phone?fmtPhone(o.sender_phone):''].filter(Boolean).join(' · ')],[Lx.recipient,o.client_name],[Lx.phone,fmtPhone(o.client_phone)],[Lx.address,(o.zone_name?o.zone_name+' · ':'')+o.address],[Lx.cod,fmt(o.cod,u)],[Lx.driver,o.driver_name||'—'],[Lx.otpCode,o.otp],[Lx.parcel,[o.description,o.pieces>1?o.pieces+' '+Lx.piecesShort:'',o.weight?o.weight+' kg':'',o.parcel_type?ptL(o.parcel_type):''].filter(Boolean).join(' · ')||'—'],[Lx.externalRef,o.external_ref||'—'],[Lx.source,o.source],[Lx.payment,pmL(o.payment_mode)],[Lx.deliveryFee,fmt(o.delivery_fee,u)],[Lx.toRemit,fmt(o.amount_to_remit,u)],[Lx.destCity,o.dest_city_name||'—'],[Lx.agencies,(o.origin_agency_name||'—')+(o.dest_agency_name&&o.dest_agency_id!==o.origin_agency_id?' → '+o.dest_agency_name:'')]];
  return `<div style="${CARD};display:flex;flex-direction:column;align-self:start;min-width:0">
    <div style="padding:var(--pad);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border-bottom:1px solid var(--line)">
      <div style="display:flex;flex-direction:column;gap:4px"><span style="font-size:12px;color:var(--mute)">${esc(Lx.detail)} · ${esc(o.intercity?Lx.inter:Lx.local)}</span><b style="font-family:var(--mono);font-size:17px">${esc(o.ref)}</b><span><span style="${css(stB(o.status))}">${esc(stL(o.status))}</span></span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
        ${qrSvg(o.ref,64)}
        <div style="display:flex;flex-direction:column;gap:6px">
          <button ${on(()=>printLabel(o))} style="${BTN_GHOST};font-size:12.5px">🏷 ${esc(Lx.label)}</button>
          <button ${on(()=>shareTrack(o.ref))} style="${BTN_GHOST};font-size:12.5px">🔗 ${esc(Lx.shareLink)}</button>
        </div>
        <button ${on(set({sel:null,selData:null}))} aria-label="${esc(Lx.close)}" style="${BTN_GHOST};font-size:12.5px;align-self:flex-start">✕</button>
      </div>
    </div>
    <div style="padding:var(--pad);display:grid;grid-template-columns:1fr 1fr;gap:12px;border-bottom:1px solid var(--line)">
      ${each(facts,([k2,v])=>`<div style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:11.5px;color:var(--mute)">${esc(k2)}</span><span style="font-weight:600;overflow-wrap:anywhere;${k2===Lx.otpCode?'font-family:var(--mono);letter-spacing:.15em':''}">${esc(v)}</span></div>`)}
    </div>
    ${tplOrderOps(o)}
    ${when((sd.allowed||[]).length,()=>`<div class="no-print" style="padding:var(--pad);border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:6px">${each(sd.allowed,a=>{const lbl=(ACTION[a.status]||ST[a.status]||[a.status,a.status])[li];const go=note=>act(()=>api(`orders/${o.id}/status`,{method:'POST',body:{status:a.status,note}}),Lx.saved);
      return `<button ${on(()=>a.note_required||a.status==='annule'?askReason(lbl+' · '+o.ref,a.note_required,go):go(''))} style="${BTN_GHOST};font-size:12.5px;padding:7px 11px;${['annule','perdu'].includes(a.status)?'color:var(--rf)':''}">${esc(lbl)}</button>`;})}</div>`)}
    ${when(canAssign,`<div style="padding:var(--pad);display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--line);background:var(--surface2)">
      <div style="display:flex;justify-content:space-between;align-items:center"><b>${esc(Lx.assign)}</b>
        <div style="display:flex;gap:2px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:2px">${each([['auto',Lx.auto],['manual',Lx.manual]],([k2,l])=>`<button ${on(set({amode:k2}))} style="${css(pill(state.amode===k2))}">${esc(l)}</button>`)}</div>
      </div>
      ${when(hAg&&(role()==='admin'||myAgency()?.id===hAg.id),()=>`<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;cursor:pointer"><input type="checkbox" ${hAg.auto_assign?'checked':''} ${on(toggleAuto)}> ${esc(Lx.autoAssignMode)} — ${esc(hAg.name)}</label>`)}
      ${list.length?each(list,x=>`<div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:var(--r);background:var(--surface);border:${x===best?'2px solid var(--orange)':'1px solid var(--line)'}">
        <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0"><span style="font-weight:600">${esc(x.name)} ${when(x===best,`<span style="background:var(--orange);color:var(--onOrange);font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:999px;margin-inline-start:4px">${esc(Lx.recommended)}</span>`)}${when(x.stale,`<span style="${css(badge('w'))};font-size:10.5px;padding:1px 6px;margin-inline-start:4px">${esc(Lx.stalePos)}</span>`)}</span>
          <span style="font-size:12px;color:var(--mute)">${esc(kmL(x.km))} · ${esc(x.zone_name||'—')} · ${x.active_count} ${esc(Lx.inProgress)} · ${esc((DS[x.status]||DS.off)[li])}${x.vehicle?' · '+esc(x.vehicle):''}</span>
          <span style="font-size:11px;color:var(--mute)" title="${esc(Object.entries(x.breakdown).map(([k,v])=>BK[k]+' '+(v>0?'+':'')+v).join(' · '))}">${esc(Lx.score)} <b style="color:var(--ink)">${x.score}</b> · ${esc(Object.entries(x.breakdown).filter(([,v])=>v).map(([k,v])=>BK[k]+' '+(v>0?'+':'')+v).join(' · '))}</span></div>
        <button ${on(assign(x))} style="padding:7px 12px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);font-weight:600;cursor:pointer">${esc(Lx.assignBtn)}</button></div>`):empty()}
      ${when(state.amode==='auto'&&best,`<button ${on(assign(best))} style="padding:11px;border-radius:var(--r);border:none;background:var(--navy);color:oklch(0.98 0.005 262);font-weight:700;cursor:pointer">${spin()}${esc(Lx.autoAssignBtn)}</button>`)}
    </div>`)}
    <div style="padding:var(--pad);display:flex;flex-direction:column">
      <b style="margin-bottom:10px">${esc(Lx.history)}</b>
      ${each([...sd.events].reverse(),(h,j)=>{const t=(ST[h.status]||[0,0,'n'])[2];return `<div style="display:grid;grid-template-columns:44px 14px 1fr;gap:8px;min-height:44px">
        <span style="font-family:var(--mono);font-size:12px;color:var(--mute)">${hm(h.created_at)}</span>
        <span style="display:flex;flex-direction:column;align-items:center"><span style="${css({...dot(t,12),marginTop:2,boxShadow:j===0?`0 0 0 4px var(--${t}b)`:'none'})}"></span><span style="flex:1;width:2px;background:var(--line)"></span></span>
        <span style="display:flex;flex-direction:column;gap:1px;padding-bottom:10px"><b style="font-weight:600">${esc(stL(h.status))} <span style="font-weight:400;color:var(--mute);font-size:12px">${h.old_status?'← '+esc(stL(h.old_status))+' · ':''}${isToday(h.created_at)?'':dm(h.created_at)}</span></b>${when(h.note,()=>`<span style="font-size:12.5px;font-style:italic">« ${esc(h.note)} »</span>`)}<span style="font-size:12px;color:var(--mute)">${esc(h.actor||'')}${h.lat!=null?' · GPS '+h.lat.toFixed(4)+', '+h.lng.toFixed(4):''}${h.proof_type?' · '+esc(h.proof_type.toUpperCase()):''}</span>
        ${when(h.proof_type&&h.proof_type!=='otp',`<button ${on(()=>api('events/'+h.id+'/proof').then(p=>setState({modal:{type:'proof',src:p.proof}})).catch(e=>toast(e.message,'err')))} style="align-self:flex-start;margin-top:4px;background:none;border:none;padding:0;color:var(--of);font-weight:600;cursor:pointer">${esc(Lx.viewProof)} →</button>`)}</span></div>`;})}
    </div>
  </div>`;
}

function tplOrders(){
  const Lx=L(),u=Lx.tnd,li=lang()==='ar'?1:0,d=state.data;
  const qq=state.q.trim().toLowerCase().replace(/\s/g,'');
  const mref=Object.fromEntries(d.manifests.map(m=>[m.id,m.ref.toLowerCase()]));
  const base=d.orders.filter(o=>!qq||[o.ref,o.client_name,o.client_phone,o.shop_name,o.driver_name,o.zone_name,o.dest_city_name,mref[o.manifest_id]].some(v=>String(v||'').toLowerCase().replace(/\s/g,'').includes(qq)));
  const FL=[['all','Tous','الكل',o=>true],['attente',ST.attente[0],ST.attente[1],o=>o.status==='attente'],['livraison',ST.livraison[0],ST.livraison[1],o=>['affecte','accepte','ramasse','livraison','sur_place','transit','arrive'].includes(o.status)],['livre',ST.livre[0],ST.livre[1],o=>o.status==='livre'],['exc','Exceptions','استثناءات',o=>EXC.includes(o.status)],['ret','Retours / annulés','الإرجاع / الملغاة',o=>RETURNS.includes(o.status)||o.status==='annule']];
  const flt=FL.find(f=>f[0]===state.filter)||FL[0];
  const rows=base.filter(flt[3]);
  const grid='96px minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) 140px 104px';
  return `<div style="display:flex;flex-wrap:wrap;gap:8px">${each(FL,f=>`<button ${on(set({filter:f[0]}))} style="${css(chip(state.filter===f[0]))}">${esc(f[1+li])} <span style="opacity:0.75">${base.filter(f[3]).length}</span></button>`)}</div>
  <div style="display:grid;grid-template-columns:${state.sel?'repeat(auto-fit,minmax(min(100%,400px),1fr))':'minmax(0,1fr)'};gap:var(--gap);align-items:start">
    <div style="min-width:0;${CARD};overflow-x:auto"><div style="min-width:760px">
      <div style="display:grid;grid-template-columns:${grid};gap:12px;padding:10px var(--pad);font-size:11.5px;text-transform:uppercase;letter-spacing:0.05em;color:var(--mute);background:var(--surface2)">
        <span>${esc(Lx.colRef)}</span><span>${esc(Lx.colClient)}</span><span>${esc(Lx.colShop)}</span><span>${esc(Lx.colZone)}</span><span>${esc(Lx.colStatus)}</span><span style="text-align:end">${esc(Lx.colAmount)}</span>
      </div>
      ${rows.length?each(rows,o=>`<div ${on(()=>selectOrder(o.id))} style="${css({display:'grid',gridTemplateColumns:grid,gap:12,alignItems:'center',padding:'10px var(--pad)',borderTop:'1px solid var(--line)',cursor:'pointer',background:state.sel===o.id?'var(--surface2)':'transparent',boxShadow:state.sel===o.id?'inset 3px 0 0 var(--orange)':'none'})}">
        <span style="display:flex;flex-direction:column"><span style="font-family:var(--mono);font-size:12px">${esc(o.ref)}</span><span style="font-size:11px;color:var(--mute)">${isToday(o.created_at)?hm(o.created_at):dm(o.created_at)}</span></span>
        <span style="display:flex;flex-direction:column;min-width:0"><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.client_name)}</span><span style="font-size:12px;color:var(--mute)">${esc(fmtPhone(o.client_phone))}</span></span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.shop_name||Lx.agencyLbl)}</span>
        <span style="color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(destLabel(o))}</span>
        <span><span style="${css(stB(o.status))}">${esc(stL(o.status))}</span></span>
        <span style="text-align:end;font-weight:600">${esc(fmt(o.cod,u))}</span></div>`):empty()}
    </div></div>
    ${when(state.sel,tplOrderDetail)}
  </div>`;
}

/* tplBrd (bordereaux) lives in js/manifests.js */

function tplDrivers(){
  const Lx=L(),drivers=state.data.drivers.map(driverRow);
  const stat=(v,l)=>`<div style="display:flex;flex-direction:column;gap:2px"><span style="font-family:var(--disp);font-size:22px;font-weight:700">${v}</span><span style="font-size:11.5px;color:var(--mute)">${esc(l)}</span></div>`;
  if(!drivers.length)return `<div style="${CARD}">${empty()}<div style="padding:0 var(--pad) var(--pad)"><button ${on(()=>goPage('accounts'))} style="${BTN_PRIMARY}">+ ${esc(Lx.newAccount)}</button></div></div>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr));gap:var(--gap)">
    ${each(drivers,d=>`<div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:12px;${d.active?'':'opacity:.55'}">
      <div style="display:flex;gap:12px;align-items:center">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--navy);color:oklch(0.98 0.005 262);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">${esc(d.name.split(' ').map(w=>w[0]).slice(0,2).join(''))}</div>
        <div style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0"><b>${esc(d.name)}</b><span style="font-size:12px;color:var(--mute)">${esc(d.zone||'—')} · ${esc(d.vehicle||'—')}</span></div>
        <span style="${css(badge(d.active?d.t:'n'))}">${esc(d.active?d.stLabel:Lx.inactive)}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        ${stat(`<span style="color:var(--orange)">★</span> ${d.rating!=null?esc(String(d.rating).replace('.',',')):'—'}`,d.reviews+' '+Lx.reviews)}${stat(d.today,Lx.deliveriesToday)}${stat(d.claims,Lx.claimsN)}
      </div>
      <div style="padding:10px;background:var(--surface2);border-radius:var(--r);font-size:12.5px;line-height:1.45;text-wrap:pretty">${d.last_comment?'« '+esc(d.last_comment)+' »':`<span style="color:var(--mute)">${esc(Lx.noReviews)}</span>`}</div>
      <a href="${telHref(d.phone)}" style="font-size:12.5px;font-weight:600;color:var(--of);text-decoration:none">✆ ${esc(fmtPhone(d.phone))}</a>
    </div>`)}
  </div>`;
}

/* tplCash lives in js/cash.js */

/* tplStats lives in js/stats.js */

/* tplClaims lives in js/claims.js */

function tplAccounts(){
  const Lx=L(),f=state.uform,users=state.users;
  const roles=role()==='admin'?[['driver',Lx.rDriver],['shop',Lx.rShop],['manager',Lx.rManager],['admin',Lx.rAdmin]]:[['driver',Lx.rDriver],['shop',Lx.rShop]];
  const roleB={admin:'i',manager:'w',driver:'o',shop:'g'};
  const agId=role()==='manager'?myAgency()?.id:+f.agency_id||homeAgency()?.id;
  const agCity=agencyById(agId)?.city_id;
  const create=()=>act(async()=>{const cur=state.uform;const r=await api('users',{method:'POST',body:{...cur,agency_id:cur.agency_id||agId}});state.creds={name:r.user.role==='shop'?r.user.shop_name:r.user.name,id:r.user.phone?fmtPhone(r.user.phone):r.user.email,password:cur.password,role:r.user.role};if(r.user.role==='manager')state.geo=await api('geo');state.uform={...cur,name:'',email:'',phone:'',shop_name:'',address:'',password:genPwd()};},Lx.accountCreated);
  const toggle=x=>()=>act(()=>api('users/'+x.id,{method:'PATCH',body:{active:!x.active}}),Lx.saved);
  const reset=x=>()=>{const p=prompt(Lx.resetPrompt,genPwd());if(p)act(()=>api('users/'+x.id,{method:'PATCH',body:{password:p}}).then(()=>{state.creds={name:x.role==='shop'?x.shop_name:x.name,id:x.phone?fmtPhone(x.phone):x.email,password:p,role:x.role};}),Lx.pwdChanged);};
  const copyCreds=c=>{const t=`SADEN Delivery\n${location.origin}\n${Lx.loginId} : ${c.id}\n${Lx.password} : ${c.password}`;(navigator.share?navigator.share({text:t}):navigator.clipboard.writeText(t).then(()=>toast(Lx.copied))).catch(()=>{});};
  return `<div class="split" style="display:grid;grid-template-columns:minmax(280px,380px) minmax(0,1fr);gap:var(--gap);align-items:start">
    <div style="display:flex;flex-direction:column;gap:var(--gap)">
      <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:12px">
        <b style="font-size:16px">${esc(Lx.newAccount)}</b>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${each(roles,([k,l])=>`<button ${on(()=>{state.uform={...state.uform,role:k};render();})} style="${css(chip(f.role===k))}">${esc(l)}</button>`)}</div>
        ${when(f.role==='shop',field(Lx.shopName,input('u-shop','uform','shop_name','placeholder="Électro Sud"')))}
        ${field(f.role==='shop'?Lx.contact:Lx.fullName,input('u-name','uform','name','autocomplete="off"'))}
        ${when(f.role==='admin',()=>field(Lx.email,input('u-email','uform','email','type="email" autocapitalize="none" autocomplete="off"')))}
        ${field(f.role==='admin'?Lx.phone+' ('+Lx.optional+')':Lx.phone,input('u-phone','uform','phone','type="tel" inputmode="tel" placeholder="+216 …" autocomplete="off"'))}
        ${field(Lx.password,`<div style="display:flex;gap:6px">${input('u-pw','uform','password','autocomplete="new-password" style="font-family:var(--mono)"')}<button ${on(()=>{state.uform={...state.uform,password:genPwd()};render();})} style="${BTN_GHOST};flex-shrink:0">${esc(Lx.genPwd)}</button></div>`)}
        ${when(f.role!=='admin'&&role()==='admin',()=>field(Lx.agencyLbl,select('u-ag','uform','agency_id',[['',L().choose],...agencyOptions()],true)))}
        ${when(f.role==='driver'||f.role==='shop',()=>field(Lx.colZone,select('u-zone','uform','zone_id',[['','—'],...zoneOptions(agCity)])))}
        ${when(f.role==='driver',field(Lx.vehicle,select('u-veh','uform','vehicle',VEHICLES.map(v=>[v,v]))))}
        ${when(f.role==='shop',field(Lx.address,input('u-addr','uform','address')))}
        <button ${on(create)} style="${BTN_PRIMARY};min-height:46px">${spin()}${esc(Lx.createBtn)}</button>
      </div>
      ${when(state.creds,()=>`<div style="padding:var(--pad);border-radius:var(--r);background:var(--gb);color:var(--gf);display:flex;flex-direction:column;gap:6px">
        <b>${esc(Lx.credsTitle)} — ${esc(state.creds.name)}</b>
        <span style="font-family:var(--mono)">${esc(state.creds.id)}<br>${esc(state.creds.password)}</span>
        <span style="font-size:12px">${esc(Lx.credsHint)}</span>
        <div style="display:flex;gap:8px"><button ${on(()=>copyCreds(state.creds))} style="${BTN_GHOST}">🔗 ${esc(Lx.shareLink)}</button><button ${on(set({creds:null}))} style="${BTN_GHOST}">${esc(Lx.close)}</button></div>
      </div>`)}
    </div>
    <div style="min-width:0;${CARD};overflow:hidden">
      <div style="padding:var(--pad)"><b>${esc(Lx.allAccounts)}</b></div>
      ${!users?`<div style="padding:var(--pad)"><span class="spin"></span></div>`:`<div style="overflow-x:auto"><div style="min-width:640px">${each(users,x=>`
        <div style="display:grid;grid-template-columns:minmax(0,1.3fr) 90px 130px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px var(--pad);border-top:1px solid var(--line);${x.active?'':'opacity:.6'}">
          <span style="display:flex;flex-direction:column;min-width:0"><b style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.role==='shop'?x.shop_name:x.name)}</b><span style="font-size:12px;color:var(--mute)">${esc(x.role==='shop'?x.name:(x.vehicle||''))}</span></span>
          <span><span style="${css(badge(roleB[x.role]))}">${esc({admin:Lx.rAdmin,manager:Lx.rManager,driver:Lx.rDriver,shop:Lx.rShop}[x.role])}</span></span>
          <span style="font-family:var(--mono);font-size:12px;overflow:hidden;text-overflow:ellipsis">${esc(x.phone?fmtPhone(x.phone):x.email||'—')}</span>
          <span style="color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc([x.agency_name,x.zone_name].filter(Boolean).join(' · ')||'—')}</span>
          <span style="display:flex;gap:6px;justify-content:flex-end">
            <button ${on(reset(x))} style="${BTN_GHOST};padding:6px 10px;font-size:12px">🔑 ${esc(Lx.resetPwd)}</button>
            ${x.id===state.session.user.id?'':`<button ${on(toggle(x))} style="${BTN_GHOST};padding:6px 10px;font-size:12px;color:${x.active?'var(--rf)':'var(--gf)'}">${esc(x.active?Lx.deactivate:Lx.activate)}</button>`}
          </span></div>`)}</div></div>`}
    </div>
  </div>`;
}

function tplOrderForm(key,withShop){
  const Lx=L(),u=Lx.tnd;
  // default destination: the city of the user's (or selected) agency
  if(!state[key].dest_city_id){const c=homeAgency()?.city_id||G().cities[0]?.id;if(c)state[key]={...state[key],dest_city_id:String(c)};}
  if(state[key].zone_id&&zoneById(state[key].zone_id)?.city_id!==+state[key].dest_city_id)state[key]={...state[key],zone_id:''};
  const f=state[key];
  const shops=state.data?.shops||[];
  // sender defaults shown as placeholders: the shop, else the origin agency
  const sh=role()==='shop'?state.session.user:shops.find(x=>x.id===+f.shop_id);
  const ag=role()==='admin'?agencyById(f.origin_agency_id)||homeAgency():myAgency();
  const dflt={name:sh?.shop_name||ag?.name||'',phone:sh?.phone?fmtPhone(sh.phone):'',address:sh?.address||''};
  // « validation intelligente »: the missing fields are listed before anything is sent
  const missing=()=>{const c=state[key];return [[!String(c.client_name||'').trim(),Lx.name],[String(c.client_phone||'').replace(/\D/g,'').length<8,Lx.phone],[!c.dest_city_id,Lx.destCity],[!String(c.address||'').trim(),Lx.address]].filter(x=>x[0]).map(x=>x[1]);};
  const submit=()=>{const miss=missing();if(miss.length)return toast(Lx.missingFields+' : '+miss.join(', '),'err');
    act(async()=>{const r=await api('orders',{method:'POST',body:state[key]});state[key]={...emptyOrder(),shop_id:state[key].shop_id};delete state.quotes[key];if(key==='oform')state.modal=null;state.shopSent=r.order.ref;toast(Lx.orderCreated+' : '+r.order.ref+(r.order.exchange_ref?' + '+r.order.exchange_ref:''));});};
  const sec=t=>`<div style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);border-bottom:1px solid var(--line);padding-bottom:4px;margin-top:4px">${esc(t)}</div>`;
  const two=(a,b)=>`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${a}${b}</div>`;
  return `<div style="display:flex;flex-direction:column;gap:12px">
    ${when(withShop&&role()==='admin',()=>field(Lx.originAgency,select(key+'-orig',key,'origin_agency_id',[['',L().auto],...agencyOptions()],true)))}
    ${when(withShop,()=>field(Lx.shopOpt,select(key+'-shop',key,'shop_id',[['',Lx.agencyDirect],...shops.filter(s=>s.active).map(s=>[s.id,s.shop_name])],true)))}
    ${sec(Lx.sender)}
    <details ${f.sender_name||f.sender_phone||f.sender_address?'open':''}><summary style="cursor:pointer;color:var(--mute);font-size:12.5px">${esc(dflt.name||'—')}${dflt.phone?' · '+esc(dflt.phone):''} — ${esc(Lx.senderOverride)}</summary>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
        ${two(field(Lx.name2,input(key+'-sn',key,'sender_name',`placeholder="${esc(dflt.name)}"`)),field(Lx.phone,input(key+'-sp',key,'sender_phone',`type="tel" inputmode="tel" placeholder="${esc(dflt.phone||'+216 …')}"`)))}
        ${field(Lx.address,input(key+'-sa',key,'sender_address',`placeholder="${esc(dflt.address)}"`))}
      </div></details>
    ${sec(Lx.recipient)}
    ${field(Lx.name,input(key+'-name',key,'client_name','placeholder="Ex. Salma Khemiri" autocomplete="off"'))}
    ${two(field(Lx.phone,input(key+'-tel',key,'client_phone','type="tel" inputmode="tel" placeholder="+216 …" autocomplete="off"')),field(Lx.phone2+' ('+Lx.optional+')',input(key+'-tel2',key,'client_phone2','type="tel" inputmode="tel" placeholder="+216 …" autocomplete="off"')))}
    ${two(field(Lx.destCity,select(key+'-city',key,'dest_city_id',cityOptions(),true)),field(Lx.colZone,select(key+'-zone',key,'zone_id',[['','—'],...zoneOptions(f.dest_city_id)],true)))}
    ${field(Lx.address,input(key+'-addr',key,'address','placeholder="Rue, quartier, repère"'))}
    <button ${on(()=>useGps(key))} style="padding:10px;border-radius:var(--r);border:1px dashed var(--line);background:transparent;font-weight:600;cursor:pointer;text-align:start;color:var(--ink)">◎ ${esc(f.lat!=null?'GPS · '+f.lat+', '+f.lng:Lx.useGps)}</button>
    ${sec(Lx.parcel)}
    ${field(Lx.description,input(key+'-desc',key,'description',`placeholder="${esc(Lx.descPh)}"`))}
    ${two(field(Lx.pieces,input(key+'-pcs',key,'pieces','inputmode="numeric"')),field(Lx.externalRef,input(key+'-ext',key,'external_ref','placeholder="CMD-1234"')))}
    ${two(field(Lx.weight,inputQ(key+'-w',key,'weight','inputmode="decimal" placeholder="—"')),field(Lx.parcelType,select(key+'-pt',key,'parcel_type',[['','—'],...Object.keys(PARCEL_TYPES).map(k=>[k,ptL(k)])],true)))}
    ${sec(Lx.payment)}
    ${two(field(Lx.payment,select(key+'-pm',key,'payment_mode',Object.keys(PAYMENT_MODES).map(k=>[k,pmL(k)]),true)),
      f.payment_mode==='prepaid'?field(Lx.cod+' ('+u+')',`<input class="fld" value="0,000" disabled>`):field(Lx.cod+' ('+u+')',inputQ(key+'-cod',key,'cod','inputmode="decimal" placeholder="0,000"')))}
    ${field(Lx.notes,`<textarea class="fld" rows="2" style="resize:vertical" ${onInput(e=>{state[key]={...state[key],notes:e.target.value};},key+'-notes')}>${esc(f.notes)}</textarea>`)}
    <label style="display:flex;gap:8px;align-items:center;cursor:pointer" data-exchange-box><input type="checkbox" ${f.exchange?'checked':''} ${on(()=>{state[key]={...state[key],exchange:!state[key].exchange};render();})}> <span><b>${esc(Lx.exchangeParcel)}</b> <span style="font-size:12px;color:var(--mute)">— ${esc(Lx.exchangeHint)}</span></span></label>
    ${when(f.exchange,()=>field(Lx.itemToCollect,input(key+'-exd',key,'exchange_description','placeholder="Ex. ancien modèle, taille 40"')))}
    ${tplQuote(key)}
    <button ${on(submit)} style="${BTN_PRIMARY};min-height:46px">${spin()}${esc(Lx.submit)}</button>
  </div>`;
}

function tplSettings(){
  const tabs=settingsFor(),cur=curPage();
  const go=k=>()=>{state.setTab=k;render();refresh(true);};
  return `<div class="no-print" style="display:flex;gap:6px;overflow-x:auto">${each(tabs,k=>`<button ${on(go(k))} data-settab="${k}" style="${css(chip(cur===k))}">${esc(L()[k])}</button>`)}</div>
    ${({accounts:tplAccounts,pricing:tplPricing,geo:tplGeo,partners:tplPartners}[cur])()}`;
}
/* « Boutiques »: activity of the agency's shops, shortcut to accounts and to their settlement (solde) */
function tplShops(){
  const Lx=L(),d=state.data,shops=d.shops||[];
  const stat=id=>{const os=d.orders.filter(o=>o.shop_id===id);return{n:os.length,live:os.filter(o=>!['livre','annule','restitue','perdu'].includes(o.status)).length,done:os.filter(o=>o.status==='livre').length,stock:os.filter(o=>o.in_stock).length,due:os.filter(o=>o.status==='livre').reduce((a,o)=>a+(o.amount_to_remit||0),0)};};
  const settle=x=>()=>{goPage('brd');goBrdType('settlement');state.bform={...state.bform,open:true,party:'shop',shop_id:String(x.id),agency_id:String(x.agency_id||'')};render();};
  const cols='minmax(0,1.4fr) 130px 80px 80px 80px 80px 120px 90px';
  return `<div style="${CARD};overflow:hidden"><div style="padding:var(--pad);display:flex;justify-content:space-between;align-items:center;gap:8px"><b>${esc(Lx.shops)} (${shops.length})</b>
    <button ${on(()=>{state.setTab='accounts';state.uform={...state.uform,role:'shop'};goPage('settings');})} style="${BTN_GHOST};padding:6px 10px">+ ${esc(Lx.newShopAccount)}</button></div>
    <div style="overflow-x:auto"><div style="min-width:760px">
    <div style="display:grid;grid-template-columns:${cols};gap:10px;padding:8px var(--pad);font-size:11.5px;color:var(--mute);background:var(--surface2);font-weight:600"><span>${esc(Lx.colShop)}</span><span>${esc(Lx.phone)}</span><span>${esc(Lx.parcelsTotal)}</span><span>${esc(Lx.inProgressK)}</span><span>${esc(Lx.deliveredK)}</span><span>${esc(Lx.stock)}</span><span style="text-align:end">${esc(Lx.dueShort)}</span><span></span></div>
    ${shops.length?each(shops,x=>{const t=stat(x.id);return `<div style="display:grid;grid-template-columns:${cols};gap:10px;align-items:center;padding:9px var(--pad);border-top:1px solid var(--line);${x.active?'':'opacity:.55'}">
      <span><b>${esc(x.shop_name)}</b><br><span style="font-size:11.5px;color:var(--mute)">${esc([x.name,agencyById(x.agency_id)?.name].filter(Boolean).join(' · '))}</span></span><span style="font-size:12.5px">${esc(fmtPhone(x.phone))}</span>
      <span>${t.n}</span><span>${t.live}</span><span>${t.done}</span><span>${t.stock}</span><span style="text-align:end;font-weight:600">${esc(fmt(t.due))}</span>
      <span style="text-align:end"><button ${on(settle(x))} style="${BTN_GHOST};padding:4px 8px;font-size:12px">${esc(Lx.settleK)}</button></span></div>`;}):empty()}
    </div></div><div style="padding:8px var(--pad);font-size:12px;color:var(--mute)">${esc(Lx.shopsHint)}</div></div>`;
}

function tplAdmin(){
  const Lx=L(),p=state.page;
  if(!state.data)return `<div style="padding:40px;text-align:center;color:var(--mute)"><span class="spin"></span></div>`;
  const page=({dash:tplDash,map:tplMap,orders:tplOrders,stock:tplStock,ops:tplOps,colis:tplParcels,brd:tplBrd,drivers:tplDrivers,shops:tplShops,cash:tplCash,stats:tplStats,claims:tplClaims,settings:tplSettings,accounts:tplAccounts,agencies:tplAgencies,geo:tplGeo,pricing:tplPricing,partners:tplPartners,journal:tplJournal}[p]||tplDash)();
  const dir=state.prefs.dir;
  return `<div class="shell" style="display:flex;flex-direction:${dir==='b'?'column':'row'};flex:1;min-height:0">
    ${tplNav()}
    <div style="flex:1;min-width:0;display:flex;flex-direction:column">
      <div class="hdr no-print" style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px 24px;background:var(--hdr);color:var(--hdrInk);border-bottom:1px solid var(--line)">
        <h1 style="margin:0;font-family:var(--disp);font-size:24px;font-weight:700;letter-spacing:-0.01em;flex:1;min-width:160px">${esc(Lx[p])}</h1>
        ${when(role()==='admin',()=>`<select class="fld no-print" ${onInput(e=>{state.agencyFilter=e.target.value;store.set('saden.agencyFilter',state.agencyFilter);state.sel=null;state.selData=null;state.stats=null;refresh();},'agf')} style="max-width:220px;background:var(--surface)" aria-label="${esc(Lx.agencyLbl)}">${each([['',Lx.allAgencies],...agencyOptions()],([v,l])=>`<option value="${esc(v)}"${String(v)===String(state.agencyFilter)?' selected':''}>${esc(l)}</option>`)}</select>`)}
        ${tplSearchBox()}
        <button ${on(()=>openScanner())} style="${BTN_GHOST};padding:9px 14px;white-space:nowrap">📷 <span class="hide-sm">${esc(Lx.scanBtn)}</span></button>
        <button ${on(()=>setState({modal:{type:'newOrder'},oform:{...emptyOrder(),shop_id:state.oform.shop_id}}))} style="${BTN_PRIMARY};padding:9px 16px;white-space:nowrap">+ ${esc(Lx.newParcel)}</button>
      </div>
      <div class="pg" style="padding:24px;display:flex;flex-direction:column;gap:var(--gap)">${page}</div>
    </div>
  </div>`;
}

/* =========================================================
   SHOP
   ========================================================= */
function tplShop(){
  const Lx=L(),u=Lx.tnd,s=state.shop;
  if(!s)return `<div style="padding:40px;text-align:center;color:var(--mute)"><span class="spin"></span></div>`;
  const k=s.kpis,me=s.me;
  const inProg=s.orders.filter(o=>!['livre','refuse','absent'].includes(o.status)).length;
  return `<div style="display:flex;flex-direction:column;flex:1">
    <div class="hdr" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:16px 28px;background:var(--hdr);color:var(--hdrInk);border-bottom:1px solid var(--line)">
      <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;opacity:0.85">${esc(Lx.shopSpace)} · ${esc(me.name)}</span><b style="font-family:var(--disp);font-size:24px">${esc(me.shop_name)}</b></div>
      <span style="font-size:12.5px;opacity:0.85">${esc(Lx.shopPrivacy)}</span>
    </div>
    <div class="pg" style="padding:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:var(--gap)">
      <div style="${CARD};padding:var(--pad);display:flex;flex-direction:column;gap:12px;align-self:start">
        <b style="font-size:16px">${esc(Lx.create)}</b>
        ${tplOrderForm('form',false)}
        ${when(state.shopSent,`<div style="padding:10px;border-radius:var(--r);background:var(--gb);color:var(--gf);font-weight:600;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between"><span>${esc(Lx.orderCreated)} : ${esc(state.shopSent)}</span><button ${on(()=>shareTrack(state.shopSent))} style="${BTN_GHOST};padding:6px 10px;font-size:12.5px">🔗 ${esc(Lx.shareLink)}</button></div>`)}
      </div>
      <div class="span2" style="grid-column:span 2;min-width:0;display:flex;flex-direction:column;gap:var(--gap)">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:var(--gap)">
          ${kpiCard(Lx.monthOrders,String(k.month))}${kpiCard(Lx.deliveredK,k.finals?Math.round(k.delivered/k.finals*100)+' %':'—')}${kpiCard(Lx.inProgressK,String(inProg))}${kpiCard(Lx.toReceive,fmt(k.cod,u))}
        </div>
        ${tplShopPickups()}
        <div style="${CARD};overflow:hidden">
          <div style="padding:var(--pad)"><b>${esc(Lx.myOrders)}</b></div>
          <div style="overflow-x:auto"><div style="min-width:640px">${s.orders.length?each(s.orders,o=>`
            <div style="display:grid;grid-template-columns:96px minmax(0,1.2fr) minmax(0,1fr) 140px 110px 96px;gap:12px;align-items:center;padding:10px var(--pad);border-top:1px solid var(--line)">
              <span style="display:flex;flex-direction:column"><span style="font-family:var(--mono);font-size:12px">${esc(o.ref)}</span><span style="font-size:11px;color:var(--mute)">${isToday(o.created_at)?hm(o.created_at):dm(o.created_at)}</span></span>
              <b style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.client_name)}</b><span style="color:var(--mute)">${esc(destLabel(o))}</span><span><span style="${css(stB(o.status))}">${esc(stL(o.status))}</span></span><span style="text-align:end;font-weight:600">${esc(fmt(o.cod,u))}</span>
              <span style="display:flex;gap:2px;justify-content:flex-end">${when(['cree','attente'].includes(o.status),()=>`<button ${on(()=>askReason(Lx.cancelOrder+' · '+o.ref,false,note=>act(()=>api('orders/'+o.id+'/cancel',{method:'POST',body:{note}}),Lx.saved)))} title="${esc(Lx.cancelOrder)}" style="border:none;background:none;cursor:pointer;font-size:15px;color:var(--rf)">✕</button>`)}<button ${on(()=>printLabel(o))} title="${esc(Lx.label)}" style="border:none;background:none;cursor:pointer;font-size:15px">🏷</button><button ${on(()=>shareTrack(o.ref))} title="${esc(Lx.shareLink)}" style="border:none;background:none;cursor:pointer;font-size:16px">🔗</button></span>
            </div>`):empty()}</div></div>
        </div>
      </div>
    </div>
  </div>`;
}

/* =========================================================
   DRIVER
   ========================================================= */
function tplDriver(){
  const Lx=L(),u=Lx.tnd,li=lang()==='ar'?1:0,dv=state.drv;
  if(!dv)return `<div style="padding:40px;text-align:center;color:var(--mute)"><span class="spin"></span></div>`;
  const me=dv.me,ms=dv.missions;
  const flow=state.prefs.dir==='a'?'liste':'guidé';
  const cm=ms.find(m=>m.id===state.curId);
  const msL=s=>(MS[s]||ST[s]||[s,s])[li],msB=s=>badge((MS[s]||ST[s]||[0,0,'n'])[2]);
  const codL=m=>m.cod?fmt(m.cod,u):Lx.paid;
  const doStatus=(m,st,extra={})=>act(async()=>{await api(`orders/${m.id}/status`,{method:'POST',body:{status:st,lat:state.myPos?.[0],lng:state.myPos?.[1],...extra}});if(EXC.includes(st))state.lv='home';});
  const EXL={absent:'absent',refuse:'refused',reporte:'postponed',numero_incorrect:'wrongNumber',adresse_incorrecte:'wrongAddress',endommage:'damaged'};
  let screen='';
  const lv=cm?state.lv:'home';
  if(lv==='home'){
    const pending=ms.filter(m=>ACTIVE_ST.includes(m.status));
    const status=me.status;
    const avail=status==='dispo'||status==='livraison';
    const toggle=()=>act(async()=>{const next=status==='off'||status==='pause'?'dispo':'pause';
      try{await api('me/status',{method:'POST',body:{status:next}});}
      catch(e){if(e.code==='gps_consent_required'){state.modal={type:'gpsConsent'};return;}throw e;}});
    screen=`<div style="background:var(--navy);color:oklch(0.98 0.005 262);padding:16px 20px 20px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-family:var(--disp);font-size:24px">${esc(Lx.hello)} ${esc(me.name.split(' ')[0])}</b>
        <button ${on(toggle)} style="${css({minHeight:36,padding:'0 14px',borderRadius:999,border:'none',fontWeight:700,cursor:'pointer',background:status==='off'?'oklch(0.85 0.01 262)':avail?'oklch(0.66 0.15 150)':'oklch(0.78 0.14 85)',color:'oklch(0.18 0.03 262)',whiteSpace:'nowrap'})}">${esc(status==='off'?Lx.startShift:(DS[status]||DS.off)[li])}</button></div>
      <span style="font-size:12px;display:flex;align-items:center;gap:6px;color:oklch(0.82 0.03 262)"><span style="width:8px;height:8px;border-radius:50%;background:${geoSharing()&&!state.geoErr?'oklch(0.72 0.17 150)':'oklch(0.6 0.02 262)'}"></span>${esc(!geoSharing()?Lx.gpsNotShared:state.geoErr?Lx.gpsOff:Lx.gpsShare)}</span>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        ${each([[pending.length,Lx.toDeliver],[ms.filter(m=>m.status==='livre').length,Lx.done],[pending.reduce((a,m)=>a+m.cod,0).toLocaleString('fr-FR'),Lx.toCollect+' ('+u+')']],([v,l])=>`<div style="background:oklch(1 0 0 / 0.08);border-radius:var(--r);padding:10px;display:flex;flex-direction:column;gap:2px"><span style="font-family:var(--disp);font-size:22px;font-weight:700">${esc(v)}</span><span style="font-size:11px;color:oklch(0.85 0.02 262)">${esc(l)}</span></div>`)}
      </div>
    </div>
    <div style="flex:1;padding:16px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>${esc(Lx.missions)}</b><button ${on(()=>openScanner('delivery'))} style="${BTN_GHOST};padding:8px 12px">📷 ${esc(Lx.scanBtn)}</button></div>
      ${ms.length?each(ms,m=>`<div ${on(()=>setState({curId:m.id,lv:m.status==='livre'?'done':'detail',doneInfo:null}))} style="${CARD};padding:14px;display:flex;flex-direction:column;gap:6px;cursor:pointer;${ACTIVE_ST.includes(m.status)?'':'opacity:.7'}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:15px">${esc(m.client_name)}</b><span style="${css(msB(m.status))}">${esc(msL(m.status))}</span></div>
        <span style="color:var(--mute);font-size:13px">${esc((m.zone_name?m.zone_name+' · ':'')+m.address)}</span>
        <div style="display:flex;justify-content:space-between;font-size:13px;gap:8px"><span>${esc(kmL(km(state.myPos||posOf(me),orderPos(m))))} · ${esc(m.shop_name||Lx.agencyLbl)}</span><b>${esc(codL(m))}</b></div>
      </div>`):`<div style="${CARD};padding:24px;text-align:center;color:var(--mute)">${esc(Lx.noMissions)}</div>`}
      ${when(status!=='off',`<button ${on(()=>act(()=>api('me/status',{method:'POST',body:{status:'off'}})))} style="margin-top:8px;background:none;border:none;color:var(--mute);text-decoration:underline;cursor:pointer;padding:8px">${esc(Lx.endShift)}</button>`)}
    </div>`;
  }else if(lv==='detail'){
    const NEXT={affecte:['accept','accepte'],accepte:['route','livraison'],ramasse:['route','livraison'],livraison:['arrived','sur_place'],sur_place:['delivered','proof']};
    const n=NEXT[cm.status];
    const goNext=()=>{if(!n)return;if(n[1]==='proof')setState({lv:'proof',otp:'',photo:null,sig:null});else doStatus(cm,n[1]);};
    const canIssue=['accepte','ramasse','livraison','sur_place'].includes(cm.status);
    const issue=k=>()=>askReason(Lx[EXL[k]]+' · '+cm.ref,true,note=>doStatus(cm,k,{note}));
    const ACTS=[['accept',cm.status==='affecte',()=>doStatus(cm,'accepte')],['route',cm.status==='accepte',()=>doStatus(cm,'livraison')],['arrived',cm.status==='livraison',()=>doStatus(cm,'sur_place')],['delivered',cm.status==='sur_place',goNext],...DRIVER_EXC.map(k=>[EXL[k],canIssue,issue(k)])];
    const STEPS=['affecte','accepte','livraison','sur_place','livre'];
    const dest=orderPos(cm);
    screen=`<div style="flex:1;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--surface)">
        <button ${on(set({lv:'home',curId:null}))} aria-label="←" style="min-width:44px;min-height:44px;border:none;background:var(--surface2);border-radius:var(--r);font-weight:700;cursor:pointer">←</button>
        <div style="display:flex;flex-direction:column"><span style="font-family:var(--mono);font-size:12px;color:var(--mute)">${esc(cm.ref)}</span><span style="${css(msB(cm.status))}">${esc(msL(cm.status))}</span></div>
      </div>
      ${mapBox('mission','180px')}
      <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;flex-direction:column;gap:2px"><b style="font-family:var(--disp);font-size:22px">${esc(cm.client_name)}</b><span style="color:var(--mute)">${esc((cm.zone_name?cm.zone_name+' · ':'')+cm.address)}</span><span style="color:var(--mute);font-size:12.5px">${esc(cm.sender_name||cm.shop_name||Lx.agencyLbl)} · ${esc(fmtPhone(cm.client_phone))}</span></div>
        ${when(cm.description||cm.pieces>1||cm.notes,()=>`<div style="padding:10px 12px;border-radius:var(--r);background:var(--surface2);display:flex;flex-direction:column;gap:3px;font-size:13px">${when(cm.description||cm.pieces>1,()=>`<span><b>${esc(cm.description||Lx.parcel)}</b>${cm.pieces>1?' · '+cm.pieces+' '+esc(Lx.piecesShort):''}${cm.weight?' · '+cm.weight+' kg':''}</span>`)}${when(cm.notes,()=>`<span style="color:var(--mute)">📝 ${esc(cm.notes)}</span>`)}</div>`)}
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:var(--r);background:var(--ob);color:var(--of)"><span style="font-weight:600">${esc(Lx.toCollect)}</span><b style="font-family:var(--disp);font-size:22px">${esc(codL(cm))}</b></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(posOf(cm)?cm.lat+','+cm.lng:cm.address+', '+(cm.zone_name||'')+', '+(cm.dest_city_name||''))}" target="_blank" rel="noopener" style="min-height:48px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);font-weight:700;color:var(--ink);text-decoration:none;display:flex;align-items:center;justify-content:center">➤ ${esc(Lx.navigate)}</a>
          <a href="${telHref(cm.client_phone)}" style="min-height:48px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);font-weight:700;color:var(--ink);text-decoration:none;display:flex;align-items:center;justify-content:center">✆ ${esc(Lx.call)}</a>
        </div>
        ${when(flow==='liste'&&ACTIVE_ST.includes(cm.status),`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${each(ACTS,([l,en,go],j)=>`<button ${en?on(go):''} ${en?'':'disabled'} style="${css({minHeight:j<4?60:48,gridColumn:'auto',borderRadius:'var(--r)',border:en&&j<4?'none':'1px solid var(--line)',background:en&&j<4?'var(--orange)':'var(--surface)',color:en&&j<4?'var(--onOrange)':'var(--ink)',fontWeight:700,fontSize:j<4?16:13.5,opacity:en?1:0.4,cursor:en?'pointer':'default'})}">${esc(Lx[l])}</button>`)}</div>`)}
        ${when(flow!=='liste',`<div style="display:flex;flex-direction:column;gap:10px">
          ${when(n,`<div style="display:flex;gap:4px">${each(STEPS,(k,j)=>`<span style="flex:1;height:5px;border-radius:3px;background:${j<=STEPS.indexOf(cm.status)?'var(--orange)':'var(--surface2)'}"></span>`)}</div>
            <button ${on(goNext)} style="min-height:68px;border-radius:var(--r);border:none;background:var(--orange);color:var(--onOrange);font-family:var(--disp);font-size:22px;font-weight:700;cursor:pointer">${spin()}${esc(n?Lx[n[0]]:'')} →</button>`)}
          ${when(canIssue,`<span style="font-size:12px;color:var(--mute)">${esc(Lx.problem)}</span>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${each(DRIVER_EXC.map(k=>[EXL[k],k]),([l,k])=>`<button ${on(issue(k))} style="min-height:48px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);font-weight:600;font-size:12.5px;cursor:pointer">${esc(Lx[l])}</button>`)}</div>`)}
        </div>`)}
      </div>
    </div>`;
  }else if(lv==='proof'){
    const pm=state.proofMode;
    const proofOk=pm==='otp'?state.otp.length===4:pm==='photo'?!!state.photo:!!state.sig;
    const confirm=()=>{if(!proofOk||state.busy)return;const body={status:'livre',proof_type:pm,lat:state.myPos?.[0],lng:state.myPos?.[1]};if(pm==='otp')body.otp=state.otp;else body.proof=pm==='photo'?state.photo:state.sig;
      act(async()=>{await api(`orders/${cm.id}/status`,{method:'POST',body});state.lv='done';state.doneInfo={ref:cm.ref,client:cm.client_name,cod:codL(cm)};});};
    const box=(okv)=>css({minHeight:220,borderRadius:'var(--r)',border:okv?'2px solid var(--gf)':'2px dashed var(--line)',background:okv?'var(--gb)':'repeating-linear-gradient(135deg,var(--stripe) 0 1px,transparent 1px 10px)',color:okv?'var(--gf)':'var(--mute)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--mono)',fontSize:12,cursor:'pointer',textAlign:'center',padding:8,overflow:'hidden'});
    screen=`<div style="flex:1;padding:16px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;gap:10px"><button ${on(set({lv:'detail'}))} style="min-width:44px;min-height:44px;border:none;background:var(--surface2);border-radius:var(--r);font-weight:700;cursor:pointer">←</button><b style="font-family:var(--disp);font-size:20px">${esc(Lx.proof)}</b></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:var(--surface2);padding:4px;border-radius:var(--r)">
        ${each([['otp',Lx.otp],['photo',Lx.photo],['sign',Lx.sign]],([k,l])=>`<button ${on(set({proofMode:k}))} style="min-height:44px;border-radius:var(--r);border:none;font-weight:600;cursor:pointer;background:${pm===k?'var(--surface)':'transparent'};color:${pm===k?'var(--ink)':'var(--mute)'}">${esc(l)}</button>`)}
      </div>
      ${when(pm==='otp',`<span style="color:var(--mute)">${esc(Lx.otpHint)}</span>
        <input ${onInput(e=>{const v=e.target.value.replace(/\D/g,'').slice(0,4);const ch=v.length===4||state.otp.length===4;state.otp=v;if(e.target.value!==v)e.target.value=v;if(ch)render();},'otp')} value="${esc(state.otp)}" inputmode="numeric" autocomplete="one-time-code" maxlength="4" placeholder="• • • •" style="padding:16px;border-radius:var(--r);border:2px solid var(--line);background:var(--surface);font-family:var(--mono);font-size:32px;letter-spacing:0.5em;text-align:center;width:100%">`)}
      ${when(pm==='photo',`<label style="${box(!!state.photo)}">${state.photo?`<img src="${state.photo}" alt="" style="max-width:100%;max-height:260px;border-radius:4px">`:esc(Lx.photoHint)}
        <input type="file" accept="image/*" capture="environment" hidden ${onInput(async e=>{const f=e.target.files?.[0];if(!f)return;try{state.photo=await compressImage(f);render();}catch{toast('Image invalide','err');}},'photo')}></label>`)}
      ${when(pm==='sign',`<span style="color:var(--mute)">${esc(Lx.signHint)}</span>
        <canvas data-sig style="width:100%;height:220px;background:#fff;border:2px ${state.sig?'solid var(--gf)':'dashed var(--line)'};border-radius:var(--r);touch-action:none;cursor:crosshair"></canvas>
        ${when(state.sig,`<button ${on(set({sig:null}))} style="${BTN_GHOST};align-self:flex-start">${esc(Lx.clear)}</button>`)}`)}
      <div style="display:flex;justify-content:space-between;padding:12px;${CARD}"><span>${esc(Lx.collect)}</span><b>${esc(codL(cm))}</b></div>
      <button ${on(confirm)} style="${css({minHeight:60,borderRadius:'var(--r)',border:'none',background:proofOk?'var(--orange)':'var(--surface2)',color:proofOk?'var(--onOrange)':'var(--mute)',fontWeight:700,fontSize:17,cursor:proofOk?'pointer':'default'})}">${spin()}${esc(Lx.confirm)}</button>
    </div>`;
  }else{
    const info=state.doneInfo||{ref:cm.ref,client:cm.client_name,cod:codL(cm)};
    screen=`<div style="flex:1;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center">
      <div style="width:96px;height:96px;border-radius:50%;background:var(--gb);color:var(--gf);display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:700">✓</div>
      <b style="font-family:var(--disp);font-size:26px">${esc(Lx.deliveredOk)}</b>
      <span style="color:var(--mute)">${esc(info.ref)} · ${esc(info.client)}</span>
      <span style="font-weight:600">${esc(Lx.collect)} : ${esc(info.cod)}</span>
      <button ${on(set({lv:'home',curId:null,doneInfo:null}))} style="margin-top:12px;width:100%;min-height:56px;border-radius:var(--r);border:none;background:var(--navy);color:oklch(0.98 0.005 262);font-weight:700;font-size:16px;cursor:pointer">${esc(Lx.nextMission)}</button>
    </div>`;
  }
  return `<main style="flex:1;display:flex;justify-content:center;padding-bottom:env(safe-area-inset-bottom)"><div style="width:100%;max-width:520px;display:flex;flex-direction:column;background:var(--bg);border-inline:1px solid var(--line)">${screen}</div></main>`;
}

/* =========================================================
   CLIENT (public tracking)
   ========================================================= */
function tplClient(){
  const Lx=L(),u=Lx.tnd,li=lang()==='ar'?1:0,t=state.trk;
  if(!t)return `<div style="padding:40px;text-align:center;color:var(--mute)"><span class="spin"></span></div>`;
  const s=t.status,exc=EXC.includes(s);
  const firstAt=sts=>t.events.find(e=>sts.includes(e.status))?.created_at;
  const groups=[[['Créée','تم الإنشاء'],['cree','attente']],[['Livreur affecté','تم إسناد موزع'],['affecte','accepte']],...(t.intercity?[[['En transit','في العبور'],['transit','arrive']]]:[]),[['En livraison','قيد التوصيل'],['livraison','sur_place']],[['Livrée','تم التسليم'],['livre']]];
  let idx=groups.findIndex(g=>g[1].includes(s));
  if(idx<0)idx=Math.max(0,...groups.map((g,j)=>firstAt(g[1])?j:0));
  const done=s==='livre',moving=['livraison','sur_place'].includes(s);
  const dpos=posOf(t.driver),opos=orderPos(t),dist=moving?km(dpos,opos):null;
  const eta=dist!=null?new Date(Date.now()+(dist/25*60+3)*60000):null;
  const canRate=done&&!t.reviewed&&!state.cSent,canClaim=(done||exc)&&!t.claimed&&!state.cSent;
  const canSend=(canRate?state.stars>0:true)&&(!state.cClaim||state.cCat!==null)&&(canRate||state.cClaim);
  const send=()=>{if(!canSend)return;act(async()=>{const r=await api('track/review',{method:'POST',body:{...state.trackAuth,stars:canRate&&state.stars?state.stars:null,comment:state.comment,claim_category:state.cClaim?state.cCat:null}});state.cSent={claim:r.claim};});};
  return `<main style="flex:1;display:flex;justify-content:center;padding-bottom:env(safe-area-inset-bottom)"><div style="width:100%;max-width:520px;padding:18px 18px 28px;display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;color:var(--mute)">${esc(Lx.track)} · ${esc(t.shop_name||'SADEN')}</span><b style="font-family:var(--mono);font-size:22px">${esc(t.ref)}</b><span style="font-size:12px;color:var(--mute)">${esc(t.client_name)} · ${esc((t.zone_name?t.zone_name+' · ':'')+t.address)}${t.dest_city_name?' · '+esc(t.dest_city_name):''}</span>${when(t.description||t.pieces>1,()=>`<span style="font-size:12px;color:var(--mute)">${esc(t.description||'')}${t.pieces>1?' · '+t.pieces+' '+esc(Lx.piecesShort):''} · ${esc(pmL(t.payment_mode))}</span>`)}</div>
    ${when(exc,`<div style="padding:14px;border-radius:var(--r);background:var(--rb);color:var(--rf);display:flex;flex-direction:column;gap:4px"><b>${esc(Lx.exception)} — ${esc(stL(s))}</b><span>${esc(Lx.exceptionHint)}</span></div>`)}
    ${when(t.otp&&!exc,`<div style="padding:14px;border-radius:var(--r);background:var(--ob);color:var(--of);display:flex;justify-content:space-between;align-items:center;gap:12px"><div style="display:flex;flex-direction:column;gap:2px"><b>${esc(Lx.deliveryCode)}</b><span style="font-size:12px">${esc(Lx.deliveryCodeHint)}</span></div><b style="font-family:var(--mono);font-size:28px;letter-spacing:.2em">${esc(t.otp)}</b></div>`)}
    ${when(!done&&!exc,`${mapBox('track','170px','border-radius:var(--r)')}
      ${when(t.driver,()=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;${CARD}">
        <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;color:var(--mute)">${esc(Lx.yourDriver)}</span><b>${esc(t.driver.name)}${t.driver.rating!=null?' · ★ '+String(t.driver.rating).replace('.',','):''}</b></div>
        ${when(eta,()=>`<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px"><span style="font-size:12px;color:var(--mute)">${esc(Lx.eta)}</span><b style="font-family:var(--disp);font-size:20px">${hm(eta.toISOString())}</b></div>`)}
      </div>`)}`)}
    <div style="display:flex;flex-direction:column;${CARD};padding:14px">
      ${each(groups,(g,j)=>{const ok=j<=idx,cur=j===idx;return `<div style="display:grid;grid-template-columns:20px 1fr auto;gap:10px;min-height:40px">
        <span style="display:flex;flex-direction:column;align-items:center"><span style="${css({width:14,height:14,borderRadius:'50%',flexShrink:0,background:ok?(cur&&!done?'var(--orange)':'var(--navy)'):'var(--surface)',border:ok?'none':'2px solid var(--line)',boxShadow:cur&&!done&&!exc?'0 0 0 5px oklch(0.72 0.17 50 / 0.25)':'none',marginTop:3})}"></span>${j<groups.length-1?`<span style="flex:1;width:2px;background:${j<idx?'var(--navy)':'var(--line)'}"></span>`:''}</span>
        <span style="font-weight:${cur?700:500};color:${ok?'var(--ink)':'var(--mute)'};padding-top:1px">${esc(g[0][li])}</span><span style="font-family:var(--mono);font-size:12px;color:var(--mute)">${ok?hm(firstAt(g[1])):''}</span></div>`;})}
      <span style="font-size:11.5px;color:var(--mute);margin-top:4px">${esc(Lx.updated)} ${hm(new Date().toISOString())} · ${esc(Lx.cod)} : ${esc(t.cod?fmt(t.cod,u):Lx.paid)}</span>
    </div>
    ${when(canRate||canClaim,`<div style="${CARD};padding:16px;display:flex;flex-direction:column;gap:12px">
      ${when(canRate,`<b style="font-size:16px">${esc(Lx.rateTitle)}</b>
        <div style="display:flex;gap:4px;justify-content:center">${each([1,2,3,4,5],n=>`<button ${on(set({stars:n}))} aria-label="${n} / 5" style="${css({background:'none',border:'none',cursor:'pointer',fontSize:40,lineHeight:1,padding:2,color:n<=state.stars?'var(--orange)':'var(--line)',minWidth:44,minHeight:44})}">★</button>`)}</div>`)}
      <textarea class="fld" ${onInput(e=>{state.comment=e.target.value;},'comment')} placeholder="${esc(Lx.commentPh)}" rows="3" style="resize:none">${esc(state.comment)}</textarea>
      ${when(canClaim,`<button ${on(set({cClaim:!state.cClaim,cCat:null}))} style="background:none;border:none;color:var(--rf);font-weight:600;cursor:pointer;text-align:start;padding:0">${esc(state.cClaim?Lx.reportClose:'⚠ '+Lx.reportOpen)}</button>`)}
      ${when(state.cClaim,`<div style="display:flex;flex-wrap:wrap;gap:6px">${each(CATS,(c,j)=>`<button ${on(set({cCat:j}))} style="${css({...chip(state.cCat===j),fontSize:12.5,padding:'6px 11px'})}">${esc(c[li])}</button>`)}</div>`)}
      <button ${on(send)} style="${css({minHeight:52,borderRadius:'var(--r)',border:'none',background:canSend?'var(--navy)':'var(--surface2)',color:canSend?'oklch(0.98 0.005 262)':'var(--mute)',fontWeight:700,fontSize:16,cursor:canSend?'pointer':'default'})}">${spin()}${esc(Lx.send)}</button>
    </div>`)}
    ${when(state.cSent,()=>`<div style="padding:20px;border-radius:var(--r);background:var(--gb);color:var(--gf);display:flex;flex-direction:column;gap:4px;text-align:center"><b style="font-size:17px">${esc(Lx.thanks)}</b><span>${state.cSent.claim?(li?'تم تسجيل شكواك '+state.cSent.claim:'Réclamation '+state.cSent.claim+' enregistrée.'):(li?'تمت إضافة تقييمك إلى ملف الموزع.':'Votre note a été ajoutée au profil du livreur.')}</span></div>`)}
    <button ${on(()=>{logout();state.loginTab='track';state.track={ref:'',phone:''};render();})} style="${BTN_GHOST}">${esc(Lx.otherParcel)}</button>
  </div></main>`;
}

/** Opens the reason dialog, then calls onSubmit(note). */
function askReason(title,required,onSubmit){state.reasonText='';setState({modal:{type:'reason',title,required,onSubmit}});}
function tplModal(){
  const m=state.modal,Lx=L();if(!m)return '';
  let title='',inner='';
  if(m.type==='newOrder'){title=Lx.newParcel;inner=tplOrderForm('oform',true);}
  else if(m.type==='proof'){title=Lx.proof;inner=`<img src="${m.src}" alt="" style="max-width:100%;border-radius:var(--r);background:#fff">`;}
  else if(m.type==='secret'){title=m.title;inner=`<div style="padding:10px;border-radius:var(--r);background:var(--wb);color:var(--wf);font-weight:600;font-size:12.5px">${esc(Lx.secretOnce)}</div>
      ${each(m.rows,([k,v])=>`<div style="display:flex;flex-direction:column;gap:4px"><span style="font-size:12px;color:var(--mute)">${esc(k)}</span><div style="display:flex;gap:6px"><input class="fld" readonly value="${esc(v)}" style="font-family:var(--mono);font-size:12.5px"><button ${on(()=>navigator.clipboard.writeText(v).then(()=>toast(Lx.copied)).catch(()=>{}))} style="${BTN_GHOST}">${esc(Lx.copy)}</button></div></div>`)}`;}
  else if(m.type==='gpsConsent'){title=Lx.gpsConsentTitle;inner=`<p style="margin:0;line-height:1.5">${esc(Lx.gpsConsentText)}</p>
      <ul style="margin:0;padding-inline-start:18px;line-height:1.6;color:var(--mute)"><li>${esc(Lx.gpsC1)}</li><li>${esc(Lx.gpsC2)}</li><li>${esc(Lx.gpsC3)}</li></ul>
      <button ${on(()=>act(async()=>{await api('me/status',{method:'POST',body:{status:'dispo',gps_consent:true}});state.modal=null;}))} style="${BTN_PRIMARY};min-height:48px">${spin()}${esc(Lx.gpsAccept)}</button>
      <button ${on(set({modal:null}))} style="${BTN_GHOST}">${esc(Lx.gpsRefuse)}</button>`;}
  else if(m.type==='reason'){title=m.title;inner=`<span style="color:var(--mute)">${esc(m.required?Lx.reasonRequired:Lx.reasonOptional)}</span>
      <textarea class="fld" rows="3" style="resize:vertical" ${onInput(e=>{state.reasonText=e.target.value;},'reason')} placeholder="${esc(Lx.reasonPh)}">${esc(state.reasonText||'')}</textarea>
      <button ${on(()=>{const n=(state.reasonText||'').trim();if(m.required&&!n)return toast(Lx.reasonRequired,'err');const fn=m.onSubmit;state.modal=null;state.reasonText='';fn(n);})} style="${BTN_PRIMARY};min-height:46px">${spin()}${esc(Lx.confirmAction)}</button>`;}
  return `<div class="no-print" ${on(set({modal:null}))} style="position:fixed;inset:0;z-index:1500;background:oklch(0.1 0.03 262 / .55);display:flex;align-items:flex-start;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 12px 16px;overflow:auto">
    <div ${on(()=>{})} role="dialog" aria-modal="true" style="${CARD};width:100%;max-width:480px;margin:auto 0;padding:18px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">${esc(title)}</b><button ${on(set({modal:null}))} aria-label="${esc(Lx.close)}" style="${BTN_GHOST};padding:6px 10px">✕</button></div>
      ${inner}
    </div>
  </div>`;
}

/* =========================================================
   maps (Leaflet, persistent instances moved into placeholders)
   ========================================================= */
const MAPS={};
function mountMaps(){
  if(typeof L_==='undefined')return;
  root.querySelectorAll('[data-map]').forEach(ph=>{
    const key=ph.dataset.map;let m=MAPS[key];
    if(!m){
      const el=document.createElement('div');el.style.cssText='position:absolute;inset:0';ph.appendChild(el);
      const map=L_.map(el,{zoomControl:key!=='track',attributionControl:true}).setView(homePos(),13);
      L_.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
      m=MAPS[key]={el,map,layer:L_.layerGroup().addTo(map),fitKey:null};
    }else ph.appendChild(m.el);
    m.map.invalidateSize();
    drawMap(key,m);
  });
}
function drawMap(key,m){
  m.layer.clearLayers();
  const pts=[],add=(ll,o,tip,click,perm)=>{if(!ll)return;const mk=L_.circleMarker(ll,{weight:3,color:'#fff',fillOpacity:1,...o}).addTo(m.layer);if(tip)mk.bindTooltip(esc(tip),{permanent:!!perm,direction:'right',offset:[8,0],className:''});if(click)mk.on('click',click);pts.push(ll);};
  const agencyMark=a=>{const p=agencyPos(a);if(!p)return null;L_.marker(p,{icon:L_.divIcon({className:'',html:`<div style="width:18px;height:18px;background:${MAPC.navy};border:3px solid #fff;border-radius:4px;box-shadow:0 1px 4px #0005"></div>`,iconSize:[18,18],iconAnchor:[9,9]})}).bindTooltip(esc(a.name)).addTo(m.layer);return p;};
  const agency=()=>agencyMark(homeAgency());
  let fitKey=key+':'+role()+':'+(state.agencyFilter||'')+':'+(myAgency()?.id||'');
  if(key==='ops'||key==='opsBig'){
    const ags=role()==='manager'?[myAgency()].filter(Boolean):state.agencyFilter?[agencyById(state.agencyFilter)].filter(Boolean):G().agencies.filter(a=>a.active);
    ags.forEach(a=>{const p=agencyMark(agencyById(a.id)||a);if(p)pts.push(p);});
    const big=key==='opsBig';
    if(big)state.data.orders.filter(o=>o.status==='attente'&&!o.intercity).forEach(o=>add(orderPos(o),{radius:5,fillColor:MAPC.o,color:MAPC.o,fillOpacity:.25,weight:2},o.ref+' · '+o.client_name,()=>selectOrder(o.id)));
    state.data.drivers.filter(d=>d.active&&posOf(d)).forEach(d=>{const t=DS[d.status]?.[2]||'n',sel=big&&d.id===(state.selDrv??state.data.drivers[0]?.id);add(posOf(d),{radius:sel?10:7,fillColor:MAPC[t]},d.name.split(' ')[0],big?()=>{state.selDrv=d.id;render();}:null,big);});
  }else if(key==='mission'){
    const cm=state.drv?.missions.find(x=>x.id===state.curId);if(!cm)return;
    agency();
    add(state.myPos||posOf(state.drv.me),{radius:8,fillColor:MAPC.navy},L().vDriver);
    add(orderPos(cm),{radius:9,fillColor:MAPC.o},cm.client_name);
    fitKey+='mission'+cm.id;
  }else if(key==='track'){
    const t=state.trk;if(!t)return;
    add(orderPos(t),{radius:9,fillColor:MAPC.o},L().address);
    if(t.driver&&['livraison','sur_place','accepte','affecte'].includes(t.status))add(posOf(t.driver),{radius:8,fillColor:MAPC.navy},t.driver.name);
    fitKey+='track'+t.ref+(posOf(t.driver)?'d':'');
  }
  if(m.fitKey!==fitKey&&pts.length){m.fitKey=fitKey;if(pts.length===1)m.map.setView(pts[0],15,{animate:false});else m.map.fitBounds(L_.latLngBounds(pts).pad(0.25),{maxZoom:15,animate:false});}
}

/* signature pad */
function mountSignature(){
  const c=root.querySelector('canvas[data-sig]');if(!c)return;
  const r=c.getBoundingClientRect(),dpr=devicePixelRatio||1;c.width=r.width*dpr;c.height=r.height*dpr;
  const ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle='#fff';ctx.fillRect(0,0,r.width,r.height);ctx.lineWidth=2.6;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';
  if(state.sig){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,r.width,r.height);img.src=state.sig;}
  let drawing=false,last=null,moved=false;const pt=e=>{const b=c.getBoundingClientRect();return[e.clientX-b.left,e.clientY-b.top];};
  c.onpointerdown=e=>{drawing=true;moved=false;c.setPointerCapture(e.pointerId);last=pt(e);};
  c.onpointermove=e=>{if(!drawing)return;const p=pt(e);ctx.beginPath();ctx.moveTo(last[0],last[1]);ctx.lineTo(p[0],p[1]);ctx.stroke();last=p;moved=true;};
  c.onpointerup=c.onpointercancel=()=>{if(!drawing)return;drawing=false;if(moved){state.sig=c.toDataURL('image/jpeg',0.8);render();}};
}

/* =========================================================
   render loop
   ========================================================= */
const root=document.getElementById('root');
function render(){
  const ae=document.activeElement,fk=ae&&ae.dataset?ae.dataset.k:null,caret=fk&&'selectionStart' in ae?ae.selectionStart:null;
  // detach persistent maps so innerHTML does not destroy them
  Object.values(MAPS).forEach(m=>m.el.remove());
  HANDLERS=[];
  const li=lang()==='ar'?1:0;_L={};for(const k in K)_L[k]=Array.isArray(K[k][0])?K[k].map(p=>p[li]):K[k][li];
  document.documentElement.lang=lang();document.documentElement.dir=li?'rtl':'ltr';
  const r=role();
  let main;
  if(state.boot)main=`<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--mute)"><span class="spin"></span></div>`;
  else if(!r)main=tplLogin();
  else main={admin:tplAdmin,manager:tplAdmin,shop:tplShop,driver:tplDriver,client:tplClient}[r]();
  root.innerHTML=`<div data-sd="1" data-theme="${state.prefs.theme}" data-d="${state.prefs.dir}" dir="${li?'rtl':'ltr'}" style="min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:var(--font);font-size:var(--fs);display:flex;flex-direction:column">
    ${tplTopBar()}${main}${tplModal()}
    ${when(state.toast,`<div class="toast no-print" role="status" style="background:${state.toast?.kind==='err'?'var(--rb)':'var(--gb)'};color:${state.toast?.kind==='err'?'var(--rf)':'var(--gf)'}">${esc(state.toast?.msg)}</div>`)}
  </div>`;
  document.querySelector('meta[name=theme-color]').content=state.prefs.theme==='dark'?'#0d1426':'#1b2a4e';
  if(fk){const el=root.querySelector(`[data-k="${fk}"]`);if(el&&el.type!=='file'){el.focus({preventScroll:true});if(caret!=null&&el.setSelectionRange)try{el.setSelectionRange(caret,caret);}catch{}}}
  mountMaps();mountSignature();
}
root.addEventListener('click',e=>{const el=e.target.closest('[data-h]');if(el&&root.contains(el)&&!el.disabled){const fn=HANDLERS[+el.dataset.h];if(fn){if(el.tagName==='BUTTON')e.preventDefault();fn(e);}}});
root.addEventListener('input',e=>{const el=e.target.closest('[data-i]');if(el&&el.type!=='file')HANDLERS[+el.dataset.i]?.(e);});
root.addEventListener('change',e=>{const el=e.target.closest('[data-i]');if(el&&(el.tagName==='SELECT'||el.type==='file'))HANDLERS[+el.dataset.i]?.(e);});
// Enter submits forms
root.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT'){const f=e.target.closest('form');const b=f?.querySelector('button[data-h]');if(b){e.preventDefault();b.click();}}});

/* =========================================================
   PWA: service worker + install prompt
   ========================================================= */
let installEvt=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;render();});
addEventListener('appinstalled',()=>{installEvt=null;render();});
function doInstall(){if(!installEvt)return;installEvt.prompt();installEvt.userChoice.finally(()=>{installEvt=null;render();});}
if('serviceWorker' in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
addEventListener('online',()=>refresh(true));

/* polling: keep live data fresh, but never while the user is typing */
setInterval(()=>{
  if(document.visibilityState!=='visible'||!role()||state.busy)return;
  const a=document.activeElement;if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))return;
  if(role()==='driver'&&state.lv==='proof')return;
  refresh(true);
},20000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&role())refresh(true);});

/* =========================================================
   boot
   ========================================================= */
// started once every feature script (geo-admin, pricing, scan, …) is loaded
addEventListener('DOMContentLoaded',async function start(){
  const t=new URLSearchParams(location.search).get('t');
  if(t&&!state.session){state.loginTab='track';state.track.ref=t.toUpperCase();if(state.trackAuth&&state.trackAuth.ref!==state.track.ref){state.trackAuth=null;store.del('saden.track');}}
  render();
  try{const s=await api('auth/status');state.needsSetup=s.needsSetup;if(s.setupEmail){state.setupEmail=s.setupEmail;state.setup.email=s.setupEmail;}}catch(e){state.loginErr=e.message;}
  if(state.session){try{const {user,agency}=await api('me');saveSession({...state.session,user,agency});}catch{}}
  state.boot=false;render();
  if(role()){if(role()==='driver')startGeo();refresh();}
});
