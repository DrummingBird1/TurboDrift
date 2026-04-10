// js/shop.js — Car shop system
import { ALL_CARS } from './cars.js';

export function renderShop(container, ownedIds, coins) {
  container.innerHTML = '';
  ALL_CARS.forEach(c => {
    const owned = ownedIds.includes(c.id) || c.price === 0;
    const canBuy = !owned && coins >= c.price;
    const d = document.createElement('div');
    d.className = 'shop-card' + (owned ? ' owned' : '');
    d.innerHTML = `<div class="si">${c.icon}</div><div class="sn">${c.n}</div>
      <div class="ss">SPD ${'█'.repeat(c.spd)}${'░'.repeat(5-c.spd)} GRP ${'█'.repeat(c.grp)}${'░'.repeat(5-c.grp)}</div>
      <div class="sp">${owned ? '✓ OWNED' : '🪙 ' + c.price}</div>`;
    if (!owned && canBuy) {
      d.style.cursor = 'pointer';
      d.onclick = () => { if (confirm('לרכוש את ' + c.n + ' עבור ' + c.price + ' מטבעות?')) { document.dispatchEvent(new CustomEvent('buy-car', { detail: c })); } };
    }
    container.appendChild(d);
  });
}

export function getOwnedCars(ownedIds) {
  return ALL_CARS.filter(c => c.price === 0 || ownedIds.includes(c.id));
}
