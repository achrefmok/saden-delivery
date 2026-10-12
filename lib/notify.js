// §25 — notifications. notify(channel, …) is the single entry point; Phase 1 implements the in-app channel
// (table notifications, bell in the UI). Push / SMS / WhatsApp / e-mail are declared for Phase 2.
import { q, one } from './db.js';
import { statusHooks } from './status.js';

const CHANNELS = {
  async inapp({ userIds, type, order_id = null, title, body = null }) {
    for (const uid of [...new Set(userIds.filter(Boolean))])
      await q(`INSERT INTO notifications (user_id, type, order_id, title, body) VALUES ($1,$2,$3,$4,$5)`, [uid, type, order_id, title, body]);
  },
  // Phase 2 — not implemented yet: messages are only logged so callers can already use the channel names.
  async push(msg) { console.info('[notify:push] not configured', msg.type); },
  async sms(msg) { console.info('[notify:sms] not configured', msg.type); },
  async whatsapp(msg) { console.info('[notify:whatsapp] not configured', msg.type); },
  async email(msg) { console.info('[notify:email] not configured', msg.type); },
};

/** notify('inapp' | 'push' | 'sms' | 'whatsapp' | 'email', { userIds, type, order_id, title, body }) */
export async function notify(channel, msg) {
  const fn = CHANNELS[channel];
  if (!fn) throw new Error('Canal de notification inconnu : ' + channel);
  try { await fn(msg); } catch (e) { console.error('notify', channel, e); }
}

/** Staff to inform for an agency: its managers, or the admins when the agency has no manager. */
export async function agencyStaff(agencyId) {
  const m = await q(`SELECT id FROM users WHERE role = 'manager' AND active AND agency_id = $1`, [agencyId]);
  if (m.length) return m.map(r => r.id);
  return (await q(`SELECT id FROM users WHERE role = 'admin' AND active`)).map(r => r.id);
}

const LABEL = {
  attente: 'Nouvelle commande', affecte: 'Nouvelle mission', livraison: 'En cours de livraison', livre: 'Colis livré',
  absent: 'Client absent', refuse: 'Colis refusé', reporte: 'Livraison reportée', numero_incorrect: 'Numéro incorrect',
  adresse_incorrecte: 'Adresse incorrecte', endommage: 'Colis endommagé', perdu: 'Colis perdu', annule: 'Commande annulée',
  retour: 'Retour à l’expéditeur', restitue: 'Colis restitué', arrive: 'Arrivé en agence de destination',
};
const SHOP_EVENTS = ['affecte', 'livraison', 'livre', 'absent', 'refuse', 'reporte', 'numero_incorrect', 'adresse_incorrecte', 'endommage', 'perdu', 'annule', 'retour', 'restitue'];
const STAFF_EVENTS = ['absent', 'refuse', 'reporte', 'numero_incorrect', 'adresse_incorrecte', 'endommage', 'perdu', 'arrive'];

// key events of the order life cycle → in-app notifications
statusHooks.push(async ({ order, from, to, user, note, driver }) => {
  const o = await one(`SELECT id, ref, client_name, shop_id, driver_id, origin_agency_id, dest_agency_id FROM orders WHERE id = $1`, [order.id]);
  if (!o) return;
  const title = `${LABEL[to] || 'Statut : ' + to} · ${o.ref}`;
  const body = `${o.client_name}${note ? ' — ' + note : ''}`;
  if (to === 'attente' && from === 'cree')
    await notify('inapp', { userIds: await agencyStaff(o.origin_agency_id), type: 'order.new', order_id: o.id, title, body });
  if (to === 'affecte' && driver)
    await notify('inapp', { userIds: [driver.id], type: 'order.assigned', order_id: o.id, title, body });
  if (o.shop_id && SHOP_EVENTS.includes(to) && user?.id !== o.shop_id)
    await notify('inapp', { userIds: [o.shop_id], type: 'order.status', order_id: o.id, title: to === 'affecte' ? `Livreur affecté · ${o.ref}` : title, body });
  if (STAFF_EVENTS.includes(to)) {
    const staff = await agencyStaff(to === 'arrive' ? o.dest_agency_id : o.dest_agency_id || o.origin_agency_id);
    await notify('inapp', { userIds: staff.filter(id => id !== user?.id), type: 'order.alert', order_id: o.id, title, body });
  }
});
