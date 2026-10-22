"use client";
import Swal from 'sweetalert2/dist/sweetalert2.js';
import { roundRatio } from '@dinerdost/core';
import { label, money, type Row } from './client';

type OrderContext = { table?: string; type?: string; customer?: string };

/** Build a receipt-style summary from saved order snapshots, never HTML from user input. */
export function showOrderPlaced(order: Row, context: OrderContext = {}) {
 const node = (tag: string, text = '', className = '') => {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
 };
 const body = node('div', '', 'order-placed-summary');
 const pairs = (parent: HTMLElement, entries: [string, unknown][]) => {
  const list = node('dl');
  for (const [name, value] of entries) {
   if (value === undefined || value === null || value === '') continue;
   list.append(node('dt', name), node('dd', String(value)));
  }
  parent.append(list);
 };
 pairs(body, [
  ['Table / type', context.table ? 'Table ' + context.table : label(order.type ?? context.type ?? 'TAKEAWAY')],
  ['Order no.', '#' + order.number],
  ['Customer', order.customer_snapshot?.name ?? context.customer ?? 'Not provided'],
 ]);
 const rounds: Row[] = order.rounds ?? [];
 for (const [index, round] of rounds.entries()) {
  const section = node('section', '', 'order-placed-round');
  section.append(node('h3', 'Round ' + (round.round_number ?? index + 1)));
  const items = node('ul');
  for (const item of round.items ?? []) {
   const line = node('li');
   line.append(node('strong', item.name));
   const quantity = Number(item.quantity_milli) / 1000;
   const price = item.unit_price == null ? '' : ' × ' + money(item.unit_price) + ' = ' + money(roundRatio(Number(item.unit_price) * Number(item.quantity_milli), 1000));
   line.append(node('span', quantity + (item.unit_snapshot ? ' ' + item.unit_snapshot : '') + price, 'order-placed-line-total'));
   items.append(line);
  }
  section.append(items);
  body.append(section);
 }
 const active = rounds.filter(round => !['VOIDED', 'REJECTED'].includes(round.status));
 const payable = active.reduce((sum, round) => sum + Number(round.payable), 0);
 const totals = node('div', '', 'order-placed-totals');
 pairs(totals, [['Grand total', money(payable)]]);
 body.append(totals);
 void Swal.fire({
  titleText: 'Order placed', icon: 'success', iconColor: '#285b45', html: body,
  confirmButtonText: 'Done', buttonsStyling: false, heightAuto: false, returnFocus: false,
  customClass: { container: 'desk-confirm-container', popup: 'desk-confirm-popup order-placed-popup', htmlContainer: 'order-placed-html', confirmButton: 'button primary' },
  keydownListenerCapture: true,
 });
}

export function showStaffOrderPlaced(order: Row, data: Row) {
 const session = data.sessions.find((entry: Row) => entry.id === order.session_id);
 showOrderPlaced(order, {
  table: data.tables.find((entry: Row) => entry.id === session?.table_id)?.label,
 });
}
