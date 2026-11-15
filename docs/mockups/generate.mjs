// Generates the 3 mockup directions (Dashboard with Overview and Pipeline tabs). Run: node docs/mockups/generate.mjs docs/mockups
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

// ---------- data (fictional sample data, today = 2026-11-15) ----------
const TODAY = '2026-11-15';
const STAGES = [
  { key: 'New', p: 10, color: '#06D6A0', ink: '#073B4C' },
  { key: 'Qualified', p: 25, color: '#FFC145', ink: '#073B4C' },
  { key: 'Proposal', p: 50, color: '#F78C6B', ink: '#073B4C' },
  // Cerulean with white text is 4.0:1, under AA for small text (R58), so text-bearing fills use a darker "solid".
  { key: 'Negotiation', p: 75, color: '#118AB2', solid: '#0D6C8C', ink: '#FFFFFF' },
  { key: 'Won', p: 100, color: '#073B4C', ink: '#FFFFFF' },
  { key: 'Lost', p: 0, color: '#CDD8DB', ink: '#073B4C' },
];
STAGES.forEach((s) => (s.solid ||= s.color));
const S = Object.fromEntries(STAGES.map((s) => [s.key, s]));
const STAGE_I = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));
// `furthest` is only for Lost deals: the last stage they reached before Lost (R48).
const D = (name, org, contact, stage, value, close, furthest) => ({ name, org, contact, stage, value, close, furthest, p: S[stage].p });
const deals = [
  D('Site safety app', 'Granite Build Co', 'Sam Becker', 'New', 9800, '2026-11-05'),
  D('Clinic scheduling suite', 'Harbor Health', 'Priya Raman', 'New', 27500, '2026-12-18'),
  D('Fleet tracking pilot', 'Northwind Logistics', 'Tom Okafor', 'New', 18000, '2027-01-20'),
  D('POS rollout, 12 stores', 'Cedar & Pine Retail', 'Elena Sousa', 'New', 64000, '2027-01-30'),
  D('ERP integration scoping', 'Brightline Manufacturing', 'Omar Haddad', 'New', 42000, '2027-02-10'),
  D('Loyalty program', 'Cedar & Pine Retail', 'Elena Sousa', 'Qualified', 22000, '2026-11-10'),
  D('Warehouse analytics', 'Northwind Logistics', 'Tom Okafor', 'Qualified', 35000, '2026-12-12'),
  D('Supplier portal', 'Brightline Manufacturing', 'Omar Haddad', 'Qualified', 14500, '2026-12-20'),
  D('Patient portal refresh', 'Harbor Health', 'Priya Raman', 'Qualified', 48000, '2027-01-15'),
  D('Treasury dashboard', 'Ridgeway Capital', 'Grace Liu', 'Qualified', 56000, '2027-02-01'),
  D('Field crew scheduling', 'Granite Build Co', 'Sam Becker', 'Proposal', 19500, '2026-10-30'),
  D('Annual support renewal', 'Atlas Software', 'Dana Whitfield', 'Proposal', 31000, '2026-11-28'),
  D('Claims automation', 'Ridgeway Capital', 'Marcus Lee', 'Proposal', 88000, '2026-12-15'),
  D('Inventory forecasting', 'Cedar & Pine Retail', 'Elena Sousa', 'Proposal', 41000, '2027-01-08'),
  D('Telehealth add-on', 'Harbor Health', 'Priya Raman', 'Negotiation', 24000, '2026-11-12'),
  D('Route optimization', 'Northwind Logistics', 'Tom Okafor', 'Negotiation', 46000, '2026-11-22'),
  D('Data platform license', 'Atlas Software', 'Dana Whitfield', 'Negotiation', 120000, '2026-12-05'),
  D('Onboarding services', 'Atlas Software', 'Dana Whitfield', 'Won', 16000, '2026-11-07'),
  D('Quality audit module', 'Brightline Manufacturing', 'Omar Haddad', 'Won', 38000, '2026-11-03'),
  D('Branch network upgrade', 'Ridgeway Capital', 'Marcus Lee', 'Won', 72000, '2026-10-24'),
  D('Store analytics', 'Cedar & Pine Retail', 'Elena Sousa', 'Won', 21500, '2026-10-15'),
  D('Data warehouse setup', 'Atlas Software', 'Dana Whitfield', 'Won', 110000, '2026-09-25'),
  D('Staff rota app', 'Harbor Health', 'Priya Raman', 'Won', 31500, '2026-08-12'),
  D('Fraud review tool', 'Ridgeway Capital', 'Marcus Lee', 'Won', 68000, '2026-07-21'),
  D('Support desk seats', 'Atlas Software', 'Dana Whitfield', 'Won', 12000, '2026-06-05'),
  D('Line monitoring sensors', 'Brightline Manufacturing', 'Omar Haddad', 'Won', 96000, '2026-05-14'),
  D('Gift card platform', 'Cedar & Pine Retail', 'Elena Sousa', 'Won', 23500, '2026-04-28'),
  D('Dock scheduling', 'Northwind Logistics', 'Tom Okafor', 'Won', 52000, '2026-03-09'),
  D('Pharmacy stock alerts', 'Harbor Health', 'Priya Raman', 'Won', 27000, '2026-02-17'),
  D('Site survey tablets', 'Granite Build Co', 'Sam Becker', 'Won', 18500, '2026-01-22'),
  D('Payroll connector', 'Ridgeway Capital', 'Grace Liu', 'Won', 34000, '2025-12-11'),
  D('Project costing tool', 'Granite Build Co', 'Sam Becker', 'Lost', 26000, '2026-10-28', 'Proposal'),
  D('Courier app', 'Northwind Logistics', 'Tom Okafor', 'Lost', 12000, '2026-10-09', 'Qualified'),
  D('Kiosk refresh', 'Cedar & Pine Retail', 'Elena Sousa', 'Lost', 30000, '2026-06-18', 'Negotiation'),
];
const isOpen = (d) => d.stage !== 'Won' && d.stage !== 'Lost';
const isLate = (d) => isOpen(d) && d.close < TODAY;
const exp = (d) => (d.value * d.p) / 100;
const open = deals.filter(isOpen);
const openTotal = open.reduce((a, d) => a + d.value, 0);
const openExp = open.reduce((a, d) => a + exp(d), 0);
const byStage = (k) => deals.filter((d) => d.stage === k);
const colTotals = (k) => {
  const ds = byStage(k);
  return { n: ds.length, value: ds.reduce((a, d) => a + d.value, 0), exp: ds.reduce((a, d) => a + exp(d), 0) };
};

// Everything below is derived from `deals`, so every figure agrees with the board (R51).
const MONTHS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
const MONTH_KEYS = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const MONTH_LONG = ['December 2025', 'January 2026', 'February 2026', 'March 2026', 'April 2026', 'May 2026', 'June 2026', 'July 2026', 'August 2026', 'September 2026', 'October 2026', 'November 2026'];
const won = deals.filter((d) => d.stage === 'Won');
const lost = deals.filter((d) => d.stage === 'Lost');
const wonIn = (m) => won.filter((d) => d.close.startsWith(m));
const REVENUE = MONTH_KEYS.map((m) => wonIn(m).reduce((a, d) => a + d.value, 0));
const WONCOUNT = MONTH_KEYS.map((m) => wonIn(m).length);
const WON_12 = REVENUE.reduce((a, b) => a + b, 0);
const WON_N = WONCOUNT.reduce((a, b) => a + b, 0);
const WON_NOW = { value: REVENUE[11], n: WONCOUNT[11] };
const WIN_RATE = Math.round((won.length / (won.length + lost.length)) * 100);
// R48: a deal reached a stage if it is in it now or went past it; Lost counts up to its furthest stage.
const reachedIndex = (d) => (d.stage === 'Lost' ? STAGE_I[d.furthest] : STAGE_I[d.stage]);
const FUNNEL = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Won'].map((key) => {
  const ds = deals.filter((d) => reachedIndex(d) >= STAGE_I[key]);
  return { key, value: ds.reduce((a, d) => a + d.value, 0), n: ds.length };
});
const FOLLOWUPS = {
  Overdue: [
    { text: 'Send revised quote', target: 'Field crew scheduling', org: 'Granite Build Co', due: 'Nov 11', note: '4 days overdue' },
    { text: 'Call back about budget', target: 'Elena Sousa', org: 'Cedar & Pine Retail', due: 'Nov 13', note: '2 days overdue' },
  ],
  'Due today': [{ text: 'Confirm legal review', target: 'Data platform license', org: 'Atlas Software', due: 'Today', note: 'Today' }],
  Upcoming: [
    { text: 'Demo for clinic managers', target: 'Patient portal refresh', org: 'Harbor Health', due: 'Nov 18', note: 'In 3 days' },
    { text: 'Check in after the pilot', target: 'Tom Okafor', org: 'Northwind Logistics', due: 'Nov 20', note: 'In 5 days' },
    { text: 'Prepare renewal pack', target: 'Annual support renewal', org: 'Atlas Software', due: 'Nov 24', note: 'In 9 days' },
  ],
};
const ACTIVITY = [
  { kind: 'stage', from: 'Proposal', to: 'Negotiation', text: 'Moved from Proposal to Negotiation', target: 'Route optimization', when: 'Today, 9:42 AM' },
  { kind: 'call', text: 'Call with Dana Whitfield about the license terms', target: 'Data platform license', when: 'Yesterday, 4:15 PM' },
  { kind: 'email', text: 'Sent revised pricing to Marcus Lee', target: 'Claims automation', when: 'Yesterday, 11:03 AM' },
  { kind: 'stage', from: 'Negotiation', to: 'Won', text: 'Moved from Negotiation to Won', target: 'Onboarding services', when: 'Nov 7, 2:30 PM' },
  { kind: 'note', text: 'Budget approved for Q1, waiting on procurement', target: 'Patient portal refresh', when: 'Nov 6, 10:20 AM' },
  { kind: 'call', text: 'Intro call with Grace Liu', target: 'Treasury dashboard', when: 'Nov 5, 3:00 PM' },
  { kind: 'note', text: 'Finance team wants a second quote before they sign', target: 'Warehouse analytics', when: 'Nov 4, 9:10 AM' },
  { kind: 'stage', from: 'Qualified', to: 'Proposal', text: 'Moved from Qualified to Proposal', target: 'Inventory forecasting', when: 'Nov 3, 4:45 PM' },
  { kind: 'email', text: 'Sent the pilot summary to Tom Okafor', target: 'Fleet tracking pilot', when: 'Nov 3, 11:20 AM' },
  { kind: 'stage', from: 'Negotiation', to: 'Won', text: 'Moved from Negotiation to Won', target: 'Quality audit module', when: 'Nov 3, 10:05 AM' },
];
const FU_TOTAL = Object.values(FOLLOWUPS).flat().length;

// ---------- helpers ----------
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const moneyShort = (n) => (n >= 1e6 ? '$' + (n / 1e6).toFixed(n % 1e6 ? 2 : 0).replace(/\.?0+$/, '') + 'M' : n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + n);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dshort = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MON[m - 1]} ${d}${y !== 2026 ? ', ' + y : ''}`;
};
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const relClose = (d) => {
  const n = daysBetween(TODAY, d.close);
  if (!isOpen(d)) return `${d.stage} ${dshort(d.close)}`;
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} late`;
  if (n === 0) return 'Closes today';
  return `In ${n} days`;
};
const initials = (n) => n.split(' ').map((x) => x[0]).join('');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const ICON = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  pipeline: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
  deals: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  contacts: '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85"/>',
  orgs: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  call: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  stage: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  moveTo: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const icon = (k, size = 18, extra = '') =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICON[k]}</svg>`;

// Left-menu sections. Overview is the landing page; Pipeline is its own section.
// `view` marks the two sections these mockups draw; the others are placeholders.
const NAV = [
  { k: 'overview', label: 'Overview', ico: 'dashboard', view: 'overview' },
  { k: 'pipeline', label: 'Pipeline', ico: 'pipeline', view: 'pipeline', count: true },
  { k: 'deals', label: 'Deals', ico: 'deals' },
  { k: 'contacts', label: 'Contacts', ico: 'contacts' },
  { k: 'orgs', label: 'Organizations', ico: 'orgs' },
];
const navHref = (n) => (n.view ? `href="#${n.view}" data-view="${n.view}"` : 'href="#"');
// Shows one section at a time from the URL hash, so a refresh stays on Pipeline.
const NAV_JS = `<script>(()=>{const links=[...document.querySelectorAll('[data-view]')];const show=(v)=>{links.forEach(a=>{const on=a.dataset.view===v;a.classList.toggle('on',on);on?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current')});document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==v);document.querySelectorAll('[data-only]').forEach(e=>e.hidden=e.dataset.only!==v)};links.forEach(a=>a.addEventListener("click",()=>show(a.dataset.view)));const fromHash=()=>show(location.hash==="#pipeline"?"pipeline":"overview");addEventListener('hashchange',fromHash);fromHash()})()</script>`;
// Page title that follows the selected section.
const titleH1 = () => `<h1 data-only="overview">Overview</h1><h1 data-only="pipeline" hidden>Pipeline</h1>`;

const pill = (k, extra = '') => `<span class="pill ${extra}" style="background:${S[k].solid};color:${S[k].ink}">${k}</span>`;

// ---------- charts ----------
const niceMax = (v, step) => Math.ceil((v * 1.08) / step) * step;
function smooth(pts) {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const t = 0.17;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1.map((n) => n.toFixed(1))} ${c2.map((n) => n.toFixed(1))} ${p2.map((n) => n.toFixed(1))}`;
  }
  return d;
}
let gid = 0;
function lineChart({ w, h, color = '#06D6A0', stroke = '#04A57B', area = true, labelLast = true }) {
  const pad = { l: 52, r: 18, t: 18, b: 30 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const step = 30000, max = Math.ceil((Math.max(...REVENUE) * 1.25) / step) * step, ticks = max / step;
  const x = (i) => pad.l + (i * iw) / (REVENUE.length - 1);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const pts = REVENUE.map((v, i) => [x(i), y(v)]);
  const id = 'g' + ++gid;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Revenue won per month, last 12 months">`;
  s += `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`;
  for (let k = 0; k <= ticks; k++) {
    const v = step * k, yy = y(v);
    s += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${yy}" y2="${yy}" stroke="#E3EAEC" stroke-width="1"/>`;
    s += `<text x="${pad.l - 10}" y="${yy + 4}" text-anchor="end" class="axis">${moneyShort(v)}</text>`;
  }
  MONTHS.forEach((m, i) => (s += `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" class="axis">${m}</text>`));
  const line = smooth(pts);
  if (area) s += `<path d="${line} L${x(REVENUE.length - 1)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#${id})"/>`;
  s += `<path d="${line}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>`;
  pts.forEach(([px, py], i) => {
    const last = i === pts.length - 1;
    s += `<circle cx="${px}" cy="${py}" r="${last ? 5 : 3}" fill="#fff" stroke="${stroke}" stroke-width="2"/>`;
  });
  if (labelLast) {
    // tooltip on the peak month, to show the hover state
    const i = REVENUE.indexOf(Math.max(...REVENUE)), [px, py] = pts[i];
    s += `<line x1="${px}" x2="${px}" y1="${py + 6}" y2="${y(0)}" stroke="#073B4C" stroke-opacity=".25" stroke-dasharray="3 3"/>`;
    s += `<g transform="translate(${px - 64},${Math.max(0, py - 52)})"><rect width="128" height="40" rx="8" fill="#073B4C"/><text x="12" y="16" class="tt-l">${MONTH_LONG[i]}</text><text x="12" y="32" class="tt-v">${money(REVENUE[i])}</text></g>`;
  }
  return s + '</svg>';
}
function barChart({ w, h, color = '#FFC145', highlight = '#E9A21F', values = WONCOUNT, label = 'Deals won per month, last 12 months' }) {
  const pad = { l: 30, r: 10, t: 20, b: 30 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...values) + 1;
  const bw = (iw / values.length) * 0.58;
  const x = (i) => pad.l + (i + 0.5) * (iw / values.length);
  const y = (v) => pad.t + ih - (v / max) * ih;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${label}">`;
  for (let v = 0; v <= max; v++) {
    const yy = y(v);
    s += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${yy}" y2="${yy}" stroke="#E3EAEC"/>`;
    s += `<text x="${pad.l - 8}" y="${yy + 4}" text-anchor="end" class="axis">${v}</text>`;
  }
  values.forEach((v, i) => {
    const last = i === values.length - 1;
    const top = y(v), hh = y(0) - top;
    s += `<path d="M${x(i) - bw / 2},${y(0)} V${top + 4} Q${x(i) - bw / 2},${top} ${x(i) - bw / 2 + 4},${top} H${x(i) + bw / 2 - 4} Q${x(i) + bw / 2},${top} ${x(i) + bw / 2},${top + 4} V${y(0)} Z" fill="${last ? highlight : color}"/>`;
    s += `<text x="${x(i)}" y="${top - 6}" text-anchor="middle" class="bar-v">${v}</text>`;
    s += `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" class="axis">${MONTHS[i]}</text>`;
  });
  return s + '</svg>';
}

// ---------- shared page frame ----------
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">`;
const BASE_CSS = `
:root{
  --sea-green:#06D6A0; --sea-green-text:#05795B; --marigold:#FFC145; --marigold-text:#8A5A00;
  --coral:#F78C6B; --coral-text:#B4472A; --cerulean:#118AB2; --raspberry:#EF476F; --raspberry-text:#C8264F;
  --midnight:#073B4C; --sea-mist:#CDD8DB; --page:#F0F4F5; --panel:#FFFFFF;
  --muted:#4F6E78; --faint:#567480; --tint:#E8EEF0;
  --cerulean-solid:#0D6C8C; --raspberry-solid:#C8264F;
  --shadow:0 1px 2px rgba(7,59,76,.06),0 6px 20px rgba(7,59,76,.06);
  --sans:'Instrument Sans',system-ui,sans-serif; --serif:'Instrument Serif',Georgia,serif; --mono:'JetBrains Mono',ui-monospace,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--page);color:var(--midnight);font:14px/1.45 var(--sans);-webkit-font-smoothing:antialiased}
.mono{font-family:var(--mono);font-feature-settings:"tnum"}
.muted{color:var(--muted)} .faint{color:var(--faint)}
.panel{background:var(--panel);border-radius:12px;box-shadow:var(--shadow)}
.ico{flex:none;display:block}
.pill{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}
.btn{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 16px;border-radius:9px;border:0;font:600 14px var(--sans);cursor:pointer}
.btn.primary{background:var(--sea-green);color:var(--midnight)}
.btn.quiet{background:var(--tint);color:var(--midnight)}
.search{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border-radius:9px;background:var(--page);color:var(--faint);min-width:240px}
.axis{font:11px var(--mono);fill:#4F6E78}
.scroll{scrollbar-width:thin;scrollbar-color:#B9C8CD transparent}
.board{overflow-x:auto;height:max(560px,calc(100vh - var(--board-top)));padding-bottom:4px}
.board > *{min-height:0}
.list > *,.cards > *,.lb > *{flex:none}
.menu{position:absolute;z-index:5;right:8px;top:40px;width:184px;padding:6px;border-radius:10px;background:#fff;box-shadow:0 12px 32px rgba(7,59,76,.2)}
.menu .mh{font-size:12px;font-weight:600;color:var(--muted);padding:6px 10px 4px}
.menu .mi{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;font-weight:500}
.menu .mi.cur{color:var(--muted)}
.menu .mi.hl{background:var(--tint);outline:2px solid var(--cerulean);outline-offset:-2px}
.menu .mi .dot{width:9px;height:9px;border-radius:50%}
.kebab{width:24px;height:24px;border-radius:6px;display:grid;place-items:center;color:var(--muted);flex:none}
.kebab.on{background:var(--tint);color:var(--midnight)}
.bar-v{font:600 11px var(--mono);fill:#073B4C}
.tt-l{font:500 11px var(--sans);fill:#CDD8DB} .tt-v{font:600 14px var(--mono);fill:#fff}
.late-tag{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:6px;background:var(--raspberry-solid);color:#fff;font-size:11px;font-weight:700;letter-spacing:.02em}
.late{color:var(--raspberry-text)!important;font-weight:600}
h1{font-size:28px;font-weight:600;letter-spacing:-.01em}
h2{font-size:16px;font-weight:600}
[hidden]{display:none!important}
.tp{display:flex;flex-direction:column;gap:20px}
`;
const page = (title, css, body) =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="icon" href="data:,">${FONTS}<style>${BASE_CSS}${css}</style></head><body>${body}${NAV_JS}</body></html>\n`;

const actIcon = (a) => ({ stage: 'stage', call: 'call', email: 'email', note: 'note' })[a.kind];
const actColor = (a) => ({ stage: '#E1F4FA', call: '#E6FBF5', email: '#FFF4DC', note: '#FDEBE5' })[a.kind];
const actInk = (a) => ({ stage: '#0D6C8C', call: '#05795B', email: '#8A5A00', note: '#B4472A' })[a.kind];

// =====================================================================
// A — Classic sidebar (closest to spec D16–D21)
// =====================================================================
// The left sidebar from spec D16, shared by A and B (B was chosen with this sidebar instead of its top bar).
const SIDEBAR_CSS = `
.shell{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh}
.side{background:var(--midnight);color:var(--sea-mist);padding:24px 16px;display:flex;flex-direction:column;gap:28px}
.brand{display:flex;align-items:center;gap:10px;color:#fff;font-weight:700;font-size:18px;padding:0 8px}
.mark{width:28px;height:28px;border-radius:8px;background:var(--sea-green);display:grid;place-items:center;color:var(--midnight);font-weight:700}
.nav{display:flex;flex-direction:column;gap:4px}
.nav a{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:9px;color:var(--sea-mist);text-decoration:none;font-weight:500}
.nav a.on{background:rgba(6,214,160,.14);color:#fff}
.nav a.on .ico{color:var(--sea-green)}
.nav .nb{margin-left:auto;font:600 11px var(--mono);padding:1px 8px;border-radius:99px;background:rgba(205,216,219,.14);color:var(--sea-mist)}
.nav a.on .nb{background:var(--sea-green);color:var(--midnight)}
.nav a:focus-visible{outline:2px solid var(--cerulean);outline-offset:2px}
`;
const A_CSS = SIDEBAR_CSS + `
main{padding:28px 32px 40px;display:flex;flex-direction:column;gap:20px;min-width:0}
.top{display:flex;align-items:flex-end;justify-content:space-between}
.top p{margin-top:2px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
.tile{padding:18px 20px}
.tile .lab{display:flex;align-items:center;gap:8px;color:var(--muted);font-weight:500}
.tile .lab span{width:28px;height:28px;border-radius:8px;display:grid;place-items:center}
.tile .val{font:600 30px var(--mono);margin-top:12px;letter-spacing:-.02em}
.tile .sub{color:var(--muted);font-size:13px;margin-top:2px}
.g21{display:grid;grid-template-columns:2fr 1fr;gap:20px}
.g11{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.card{padding:20px 22px}
.card-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.card-h .muted{font-size:13px}
.funnel{display:flex;flex-direction:column;gap:10px}
.frow{display:grid;grid-template-columns:120px 1fr 120px 130px;align-items:center;gap:16px}
.ftrack{height:28px;border-radius:7px;background:var(--page);overflow:hidden}
.fbar{height:100%;border-radius:7px}
.frow .mono{text-align:right;font-weight:600}
.frow .conv{text-align:right;font:12px var(--mono);color:var(--muted);white-space:nowrap}
.fu-g{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:14px 0 6px}
.fu-g:first-of-type{margin-top:0}
.fu{display:grid;grid-template-columns:22px 1fr auto;gap:12px;align-items:center;padding:9px 0}
.cb{width:18px;height:18px;border-radius:5px;background:var(--page);box-shadow:inset 0 0 0 1.5px #9FB3BA}
.fu .t{font-weight:600}
.fu .s{font-size:13px;color:var(--muted)}
.due{font:500 12px var(--mono);padding:3px 8px;border-radius:6px;background:var(--page)}
.due.od{background:#FDE4EA;color:var(--raspberry-text)}
.due.td{background:#FFF1D2;color:var(--marigold-text)}
.act{display:grid;grid-template-columns:32px 1fr;gap:12px;padding:9px 0}
.act .i{width:32px;height:32px;border-radius:9px;display:grid;place-items:center}
.act .t{font-weight:500}
.act .s{font-size:13px;color:var(--muted)}
.act .s a{color:#0D6C8C;text-decoration:none;font-weight:600}
/* pipeline */
.ptop{display:flex;align-items:center;justify-content:space-between;gap:16px}
.sum{display:flex;gap:12px}
.sum .panel{padding:10px 16px}
.sum .k{font-size:12px;color:var(--muted);font-weight:500}
.sum .v{font:600 18px var(--mono)}
:root{--board-top:232px}
.board{display:grid;grid-template-columns:repeat(6,minmax(176px,1fr));gap:14px}
.col{background:#E5ECEE;border-radius:12px;padding:12px 6px 0 12px;display:flex;flex-direction:column;gap:6px;min-height:0}
.list{display:flex;flex-direction:column;gap:10px;overflow-y:auto;padding:4px 6px 12px 2px;margin-left:-2px;flex:1;min-height:0}
.ch{padding:2px 10px 6px 4px}
.ch .r1{display:flex;align-items:center;gap:8px;font-weight:600}
.dot{width:10px;height:10px;border-radius:50%}
.cnt{font:600 11px var(--mono);padding:2px 7px;border-radius:999px;background:#fff;color:var(--muted)}
.addc{margin-left:auto;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:#fff;color:var(--midnight)}
.ch .r2{display:flex;flex-direction:column;gap:1px;margin-top:6px;font:500 12px var(--mono);color:var(--muted)}
.ch .r2 b{color:var(--midnight);font-weight:600}
.dc{background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 2px rgba(7,59,76,.08)}
.dc .n{font-weight:600;line-height:1.3}
.dc .o{font-size:12.5px;color:var(--muted);margin-top:2px}
.dc .f{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:10px;font:12px var(--mono);white-space:nowrap}
.dc .f b{font-weight:600;font-size:13px}
.dc.drag{transform:rotate(2.5deg);box-shadow:0 18px 40px rgba(7,59,76,.22);position:relative;z-index:2}
.gap{height:74px;border-radius:10px;background:rgba(17,138,178,.08);outline:2px dashed rgba(17,138,178,.45);outline-offset:-2px}
.dc.closed{opacity:.85}
`;
function sidebarA(on) {
  return `<aside class="side"><div class="brand"><span class="mark">A</span>Accountable</div><nav class="nav" aria-label="Sections">${NAV.map(
    (n) => `<a class="${n.k === on ? 'on' : ''}" ${navHref(n)}>${icon(n.ico)}${n.label}${n.count ? `<span class="nb" aria-label="${open.length} open deals">${open.length}</span>` : ''}</a>`
  ).join('')}</nav></aside>`;
}
const TILES = [
  { k: 'Open pipeline', v: money(openTotal), sub: `${open.length} open deals`, i: 'pipeline', bg: '#E6FBF5', ink: '#05795B' },
  { k: 'Expected revenue', v: money(openExp), sub: 'Value × probability, open deals', i: 'target', bg: '#E1F4FA', ink: '#0D6C8C' },
  { k: 'Won this month', v: money(WON_NOW.value), sub: `${WON_NOW.n} deals in November`, i: 'trophy', bg: '#FFF4DC', ink: '#8A5A00' },
  { k: 'Win rate', v: WIN_RATE + '%', sub: `Last 12 months, ${won.length} won of ${won.length + lost.length} closed`, i: 'percent', bg: '#FDEBE5', ink: '#B4472A' },
];
function followupsA() {
  return Object.entries(FOLLOWUPS)
    .map(
      ([g, items]) =>
        `<div class="fu-g">${g} · ${items.length}</div>` +
        items
          .map(
            (f) =>
              `<div class="fu"><span class="cb"></span><div><div class="t">${esc(f.text)}</div><div class="s">${esc(f.target)} · ${esc(f.org)}</div></div><span class="due ${g === 'Overdue' ? 'od' : g === 'Due today' ? 'td' : ''}">${f.due}</span></div>`
          )
          .join('')
    )
    .join('');
}
function activityA() {
  return ACTIVITY.map(
    (a) =>
      `<div class="act"><span class="i" style="background:${actColor(a)};color:${actInk(a)}">${icon(actIcon(a), 16)}</span><div><div class="t">${esc(a.text)}</div><div class="s"><a href="#">${esc(a.target)}</a> · ${a.when}</div></div></div>`
  ).join('');
}
function dashboardA() {
  const fmax = FUNNEL[0].value;
  const overview = `<section class="tiles">${TILES.map(
    (t) => `<div class="panel tile"><div class="lab"><span style="background:${t.bg};color:${t.ink}">${icon(t.i, 16)}</span>${t.k}</div><div class="val">${t.v}</div><div class="sub">${t.sub}</div></div>`
  ).join('')}</section>
  <section class="g21">
    <div class="panel card"><div class="card-h"><h2>Revenue won</h2><span class="muted">Last 12 months · USD</span></div>${lineChart({ w: 720, h: 250 })}</div>
    <div class="panel card"><div class="card-h"><h2>Deals won</h2><span class="muted">Per month</span></div>${barChart({ w: 340, h: 250 })}</div>
  </section>
  <section class="panel card"><div class="card-h"><h2>Sales funnel</h2><span class="muted">Value of deals that reached each stage</span></div><div class="funnel">${FUNNEL.map(
    (f, i) =>
      `<div class="frow">${pill(f.key)}<div class="ftrack"><div class="fbar" style="width:${((f.value / fmax) * 100).toFixed(1)}%;background:${S[f.key].color}"></div></div><span class="mono">${money(f.value)}</span><span class="conv">${f.n} deals${i ? ' · ' + Math.round((f.value / FUNNEL[i - 1].value) * 100) + '%' : ''}</span></div>`
  ).join('')}</div></section>
  <section class="g11">
    <div class="panel card"><div class="card-h"><h2>Follow-ups</h2><span class="muted">${FU_TOTAL} open</span></div>${followupsA()}</div>
    <div class="panel card"><div class="card-h"><h2>Recent activity</h2><span class="muted">All records</span></div>${activityA()}</div>
  </section>`;
  const pipeline = `<div class="ptop"><div style="display:flex;align-items:center;gap:16px"><div class="search panel" style="background:#fff">${icon('search', 16)}Search deals</div><span class="muted">Drag a card to change its stage or its place in a column</span></div>
    <div class="sum"><div class="panel"><div class="k">Open pipeline</div><div class="v">${money(openTotal)}</div></div><div class="panel"><div class="k">Expected revenue</div><div class="v">${money(openExp)}</div></div></div></div>
  <section class="board scroll">${STAGES.map((s) => {
    const t = colTotals(s.key);
    let cards = byStage(s.key).map((d) => cardA(d));
    if (s.key === 'Proposal') cards.splice(1, 0, '<div class="gap"></div>');
    if (s.key === 'Qualified') cards[1] = cardA(byStage('Qualified')[1], 'drag');
    return `<div class="col"><div class="ch"><div class="r1"><span class="dot" style="background:${s.color}"></span>${s.key}<span class="cnt">${t.n}</span><span class="addc" aria-label="Add a deal to ${s.key}">${icon('plus', 14)}</span></div><div class="r2"><b>${money(t.value)}</b><span>${isOpen({ stage: s.key }) ? 'Exp ' + money(t.exp) : 'Closed'}</span></div></div><div class="list scroll">${cards.join('')}</div></div>`;
  }).join('')}</section>`;
  const body = `<div class="shell">${sidebarA('overview')}<main>
  <div class="top"><div>${titleH1()}<p class="muted" data-only="overview">Sunday, November 15, 2026</p><p class="muted" data-only="pipeline" hidden>${open.length} open deals across four stages</p></div><button class="btn primary">${icon('plus', 16)}New deal</button></div>
  <div id="overview" data-panel="overview" class="tp">${overview}</div>
  <div id="pipeline" data-panel="pipeline" class="tp" hidden>${pipeline}</div>
  </main></div>`;
  return page('Accountable · Mockup A', A_CSS, body);
}
function cardA(d, extra = '') {
  const late = isLate(d);
  return `<div class="dc ${extra} ${isOpen(d) ? '' : 'closed'}"><div class="n">${esc(d.name)}</div><div class="o">${esc(d.org)}</div><div class="f"><b>${money(d.value)}</b><span class="${late ? 'late' : 'faint'}">${dshort(d.close).replace(/, \d+$/, '')}</span></div>${late ? '<div style="margin-top:8px"><span class="late-tag">Late</span></div>' : ''}</div>`;
}

// =====================================================================
// B — Summary-led (chosen direction), with the left sidebar from D16
// =====================================================================
const B_CSS = SIDEBAR_CSS + `
.wrap{padding:28px 32px 32px;display:flex;flex-direction:column;gap:20px;min-width:0}
.hello{display:flex;align-items:center;justify-content:space-between}
.hello .acc{font:500 14px var(--sans);color:var(--muted)}
.hello .right{display:flex;align-items:center;gap:20px}
.fu-g{font-size:12px;font-weight:600;color:var(--muted);margin:10px 0 0}
.fu-g:first-of-type{margin-top:0}
.li.c{padding:7px 0}
.hero{background:var(--midnight);color:var(--sea-mist);border-radius:16px;padding:28px 32px;display:grid;grid-template-columns:auto auto 1fr;gap:48px;align-items:center}
.hero .k{font-size:13px;font-weight:500;color:var(--sea-mist);opacity:.85}
.hero .big{font:600 40px var(--mono);color:#fff;letter-spacing:-.02em;margin-top:4px}
.hero .big.g{color:var(--sea-green)}
.hero .mini{display:flex;gap:28px;margin-top:16px;font-size:13px}
.hero .mini b{display:block;font:600 18px var(--mono);color:#fff}
.stack{display:flex;height:18px;border-radius:999px;overflow:hidden;gap:3px}
.stack div{height:100%}
.legend{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
.legend .k{display:flex;align-items:center;gap:6px}
.legend b{display:block;font:600 15px var(--mono);color:#fff;margin-top:2px}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block}
.g21{display:grid;grid-template-columns:1.7fr 1fr;gap:20px}
.g111{display:grid;grid-template-columns:1fr 1.1fr 1.1fr;gap:20px}
.card{padding:22px 24px}
.card-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px}
.card-h .muted{font-size:13px}
.big2{font:600 26px var(--mono);margin-bottom:6px}
.chg{font:600 12px var(--mono);color:var(--sea-green-text);background:#E6FBF5;padding:3px 8px;border-radius:6px;margin-left:8px;vertical-align:middle}
.fl{font:600 12px var(--sans);fill:#073B4C} .flw{font:600 12px var(--sans);fill:#fff}
.fv{font:600 12px var(--mono);fill:#073B4C} .fvw{font:600 12px var(--mono);fill:#fff}
.fs{font:11px var(--mono);fill:#5E7C86}
.li{display:flex;gap:12px;align-items:flex-start;padding:10px 0}
.li + .li{box-shadow:0 -1px 0 #EDF2F3}
.li .t{font-weight:600}
.li .s{font-size:13px;color:var(--muted)}
.ring{width:18px;height:18px;border-radius:50%;box-shadow:inset 0 0 0 1.5px #9FB3BA;flex:none;margin-top:2px}
.when{margin-left:auto;font:500 12px var(--mono);white-space:nowrap;color:var(--muted)}
.when.od{color:var(--raspberry-text);font-weight:600}
.badge{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex:none}
/* pipeline */
.ptitle{display:flex;align-items:flex-end;justify-content:space-between}
:root{--board-top:254px}
.strip{padding:20px 24px;display:grid;grid-template-columns:auto auto 1fr;gap:36px;align-items:center}
.strip .k{font-size:12px;color:var(--muted);font-weight:500}
.strip .v{font:600 22px var(--mono)}
.strip .pair{display:flex;gap:32px}
.slab{display:flex;justify-content:space-between;margin-top:8px;font:12px var(--mono);color:var(--muted)}
.board{display:grid;grid-template-columns:repeat(4,minmax(172px,1fr)) repeat(2,minmax(150px,.82fr));gap:14px;padding-right:4px}
.board > div{display:flex;flex-direction:column}
.colh{padding:12px 14px;margin-bottom:10px;flex:none}
.colh .r1{display:flex;align-items:center;justify-content:space-between}
.colh .r2{display:flex;justify-content:space-between;margin-top:10px;font:12px var(--mono);color:var(--muted)}
.colh .r2 b{display:block;color:var(--midnight);font-size:14px;font-weight:600}
.plus{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--page)}
.cards{display:flex;flex-direction:column;gap:10px;overflow-y:auto;flex:1;min-height:0;padding:2px 4px 12px;margin:0 -4px}
.dc{background:#fff;border-radius:12px;padding:14px;box-shadow:var(--shadow);position:relative}
.dc.menu-open{z-index:4}
.cards.has-menu{overflow:visible}
.dc .n{font-weight:600;line-height:1.3}
.dc .o{font-size:12.5px;color:var(--muted);margin-top:2px}
.prob{display:flex;align-items:center;gap:8px;margin-top:12px;font:11px var(--mono);color:var(--muted)}
.track{flex:1;height:6px;border-radius:99px;background:#E8EEF0;overflow:hidden}
.track div{height:100%;border-radius:99px}
.dc .f{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:10px;font:12px var(--mono);white-space:nowrap}
.dc .f b{font-size:14px;font-weight:600}
.dc.closed{background:#F7F9FA;box-shadow:none}
/* 1024–1279 px (R60): the summary panel and strip put their stage bar below the figures, charts
   go full width with a height cap, and Follow-ups sits beside Recent activity. Only the board
   scrolls sideways. */
@media (max-width:1279px){
.hero{grid-template-columns:auto auto;gap:24px 40px}
.hero > :last-child{grid-column:1/-1}
.strip{grid-template-columns:auto 1fr;gap:20px 32px}
.strip > :last-child{grid-column:1/-1}
.g21{grid-template-columns:1fr}
.g111{grid-template-columns:1fr 1fr}
.g111 > :first-child{grid-column:1/-1}
.g21 svg,.g111 svg{max-height:300px}
}
`;
function stackBar(onDark) {
  const openStages = STAGES.filter((s) => isOpen({ stage: s.key }));
  return `<div class="stack">${openStages
    .map((s) => `<div style="flex:${colTotals(s.key).value};background:${s.color}"></div>`)
    .join('')}</div><div class="legend">${openStages
    .map((s) => {
      const t = colTotals(s.key);
      return `<div><div class="k"><span class="dot" style="background:${s.color}"></span>${s.key} · ${t.n}</div><b ${onDark ? '' : 'style="color:var(--midnight)"'}>${money(t.value)}</b></div>`;
    })
    .join('')}</div>`;
}
function funnelB(w, h) {
  const n = FUNNEL.length, gap = 6, rh = (h - gap * (n - 1)) / n, cx = w / 2, max = FUNNEL[0].value;
  const wid = (v) => 200 + (v / max) * (w - 200);
  let s = `<svg viewBox="0 0 ${w} ${h + 4}" width="100%" role="img" aria-label="Sales funnel">`;
  FUNNEL.forEach((f, i) => {
    const top = i * (rh + gap), w1 = wid(f.value), w2 = i < n - 1 ? wid(FUNNEL[i + 1].value) : w1 * 0.86;
    const st = S[f.key], dark = st.ink === '#FFFFFF';
    s += `<path d="M${cx - w1 / 2},${top} H${cx + w1 / 2} L${cx + w2 / 2},${top + rh} H${cx - w2 / 2} Z" fill="${st.solid}" stroke-linejoin="round"/>`;
    s += `<text x="${cx}" y="${top + rh / 2 + 4}" text-anchor="middle"><tspan class="${dark ? 'flw' : 'fl'}">${f.key}</tspan><tspan dx="10" class="${dark ? 'fvw' : 'fv'}">${money(f.value)}</tspan><tspan dx="10" class="${dark ? 'fvw' : 'fv'}">${f.n} deals</tspan></text>`;
  });
  return s + '</svg>';
}
function dashboardB() {
  const fu = Object.entries(FOLLOWUPS).flatMap(([g, items]) => items.map((f) => ({ ...f, g })));
  const overview = `<section class="hero">
    <div><div class="k">Open pipeline</div><div class="big">${money(openTotal)}</div><div class="mini"><div>${open.length} open deals</div></div></div>
    <div><div class="k">Expected revenue</div><div class="big g">${money(openExp)}</div><div class="mini"><div>Won this month <b>${money(WON_NOW.value)}</b></div><div>Win rate, 12 months <b>${WIN_RATE}%</b></div></div></div>
    <div><div class="k" style="margin-bottom:10px">Open value by stage</div>${stackBar(true)}</div>
  </section>
  <section class="g21">
    <div class="panel card"><div class="card-h"><h2>Revenue won</h2><span class="muted">Last 12 months · USD</span></div><div class="big2">${money(WON_12)}<span class="chg">${WON_N} deals won</span></div>${lineChart({ w: 760, h: 270 })}</div>
    <div class="panel card"><div class="card-h"><h2>Sales funnel</h2><span class="muted">Value reaching each stage</span></div>${funnelB(400, 300)}</div>
  </section>
  <section class="g111">
    <div class="panel card"><div class="card-h"><h2>Deals won</h2><span class="muted">Per month</span></div>${barChart({ w: 360, h: 240 })}</div>
    <div class="panel card"><div class="card-h"><h2>Follow-ups</h2><span class="muted">${FU_TOTAL} open</span></div>${Object.entries(FOLLOWUPS)
      .map(
        ([g, items]) =>
          `<div class="fu-g">${g} · ${items.length}</div>` +
          items
            .map(
              (f) =>
                `<div class="li c"><span class="ring"></span><div><div class="t">${esc(f.text)}</div><div class="s">${esc(f.target)}</div></div><span class="when ${g === 'Overdue' ? 'od' : ''}">${g === 'Overdue' ? f.note : f.due}</span></div>`
            )
            .join('')
      )
      .join('')}</div>
    <div class="panel card"><div class="card-h"><h2>Recent activity</h2><span class="muted">Newest first</span></div>${ACTIVITY.map(
      (a) =>
        `<div class="li c"><span class="badge" style="background:${actColor(a)};color:${actInk(a)}">${icon(actIcon(a), 15)}</span><div><div class="t">${a.kind === 'stage' ? `${pill(a.from)} → ${pill(a.to)}` : esc(a.text)}</div><div class="s">${esc(a.target)} · ${a.when}</div></div></div>`
    ).join('')}</div>
  </section>`;
  const pipeline = `<section class="panel strip"><div class="search" style="min-width:220px">${icon('search', 16)}Search deals</div><div class="pair"><div><div class="k">Open pipeline</div><div class="v">${money(openTotal)}</div></div><div><div class="k">Expected revenue</div><div class="v" style="color:var(--sea-green-text)">${money(openExp)}</div></div><div><div class="k">Late deals</div><div class="v" style="color:var(--raspberry-text)">${open.filter(isLate).length}</div></div></div><div>${stackBar(false)}</div></section>
  <section class="board scroll">${STAGES.map((s) => {
    const t = colTotals(s.key), o = isOpen({ stage: s.key });
    const menuAt = s.key === 'Proposal' ? 1 : -1;
    return `<div><div class="panel colh"><div class="r1">${pill(s.key)}<span class="plus" aria-label="Add a deal to ${s.key}">${icon('plus', 14)}</span></div><div class="r2"><div><b>${money(t.value)}</b>${t.n} deals</div>${o ? `<div style="text-align:right"><b>${money(t.exp)}</b>expected</div>` : '<div style="text-align:right"><b>&nbsp;</b>closed</div>'}</div></div><div class="cards scroll ${menuAt >= 0 ? 'has-menu' : ''}">${byStage(s.key)
      .map((d, i) => cardB(d, i === menuAt))
      .join('')}</div></div>`;
  }).join('')}</section>`;
  const body = `<div class="shell">${sidebarA('overview')}<main class="wrap">
  <div class="hello"><div>${titleH1()}</div><div class="right"><span class="acc">Sunday, November 15, 2026</span><button class="btn primary">${icon('plus', 16)}New deal</button></div></div>
  <div id="overview" data-panel="overview" class="tp">${overview}</div>
  <div id="pipeline" data-panel="pipeline" class="tp" hidden>${pipeline}</div></main></div>`;
  return page('Accountable · Mockup B', B_CSS, body);
}
// R41: every card has a "Move to…" menu; one is shown open, with keyboard highlight on the next stage.
function moveMenu(d) {
  const next = STAGES[STAGE_I[d.stage] + 1].key;
  return `<div class="menu" role="menu" aria-label="Move ${esc(d.name)}"><div class="mh">Move to…</div>${STAGES.map(
    (s) =>
      `<div class="mi ${s.key === d.stage ? 'cur' : ''} ${s.key === next ? 'hl' : ''}" role="menuitem"><span class="dot" style="background:${s.color}"></span>${s.key}${s.key === d.stage ? ' <span style="margin-left:auto;font-size:12px">Now</span>' : ''}</div>`
  ).join('')}</div>`;
}
function cardB(d, menu = false) {
  const st = S[d.stage], late = isLate(d);
  return `<div class="dc ${isOpen(d) ? '' : 'closed'} ${menu ? 'menu-open' : ''}"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px"><div class="n">${esc(d.name)}</div><div style="display:flex;gap:4px;align-items:center">${late ? '<span class="late-tag">Late</span>' : ''}<span class="kebab ${menu ? 'on' : ''}" aria-label="Actions for ${esc(d.name)}">${icon('more', 16)}</span></div></div>${menu ? moveMenu(d) : ''}<div class="o">${esc(d.org)} · ${esc(d.contact)}</div>${
    isOpen(d) ? `<div class="prob"><div class="track"><div style="width:${d.p}%;background:${st.color}"></div></div>${d.p}%</div>` : ''
  }<div class="f"><b>${money(d.value)}</b><span class="${late ? 'late' : 'faint'}">${dshort(d.close)}</span></div></div>`;
}

// =====================================================================
// C — Icon rail, work-first with a "Today" column
// =====================================================================
const C_CSS = `
.shell{display:grid;grid-template-columns:76px 1fr;min-height:100vh}
.rail{background:var(--midnight);display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px 0}
.mark{width:40px;height:40px;border-radius:12px;background:var(--sea-green);display:grid;place-items:center;color:var(--midnight);font-weight:700;font-size:18px;margin-bottom:18px}
.rail a{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:var(--sea-mist)}
.rail a.on{background:var(--sea-green);color:var(--midnight)}
.rail a{position:relative}
.rail a:focus-visible{outline:2px solid var(--sea-green);outline-offset:2px}
.rail .rb{position:absolute;top:-4px;right:-6px;min-width:20px;height:18px;padding:0 5px;border-radius:99px;background:var(--marigold);color:var(--midnight);font:600 10.5px/18px var(--mono);text-align:center}
.ov{display:grid;grid-template-columns:1fr 340px;gap:22px}
.col{display:flex;flex-direction:column;gap:18px;min-width:0}
.head{display:flex;align-items:center;justify-content:space-between}
.head .d{font:500 13px var(--mono);color:var(--muted);margin-top:2px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.kpi{padding:16px 18px}
.kpi .k{font-size:12.5px;color:var(--muted);font-weight:500}
.kpi .v{font:600 24px var(--mono);margin-top:6px;letter-spacing:-.02em}
.kpi .s{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);margin-top:4px}
.kpi .sw{width:8px;height:8px;border-radius:2px}
.g{display:grid;grid-template-columns:1.55fr 1fr;gap:18px}
.card{padding:18px 20px}
.card-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
.card-h .muted{font-size:12.5px}
.chev-l{font:600 12.5px var(--sans)} .chev-v{font:600 15px var(--mono)} .chev-s{font:11px var(--mono)}
.conv{display:grid;grid-template-columns:repeat(5,1fr);margin-top:10px;font:12px var(--mono);color:var(--muted);text-align:center}
.today{padding:20px;display:flex;flex-direction:column;gap:6px;align-self:start}
.today h2{font-size:18px}
.grp{display:flex;align-items:center;gap:8px;font-weight:600;margin:14px 0 4px}
.cnt{font:600 11px var(--mono);min-width:22px;height:20px;padding:0 6px;border-radius:99px;display:inline-grid;place-items:center}
.task{display:grid;grid-template-columns:20px 1fr;gap:10px;padding:8px 10px;border-radius:10px}
.task.od{background:#FEF1F4}
.task .t{font-weight:600;line-height:1.3}
.task .s{font-size:12.5px;color:var(--muted);margin-top:2px}
.task .w{font:500 11.5px var(--mono);margin-top:4px;color:var(--muted)}
.task.od .w{color:var(--raspberry-text);font-weight:600}
.circ{width:18px;height:18px;border-radius:50%;box-shadow:inset 0 0 0 1.5px #9FB3BA;margin-top:1px}
.sep{height:1px;background:#EDF2F3;margin:14px 0 4px}
.tl{position:relative;padding-left:4px}
.ti{display:grid;grid-template-columns:26px 1fr;gap:10px;padding:7px 0;position:relative}
.ti .b{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;position:relative;z-index:1}
.ti:not(:last-child)::before{content:"";position:absolute;left:12.5px;top:34px;bottom:-6px;width:1.5px;background:#E3EAEC}
.ti .t{font-weight:500;line-height:1.35;font-size:13.5px}
.ti .s{font-size:12px;color:var(--muted);margin-top:1px}
/* pipeline */
.pmain{padding:24px 28px 36px;display:flex;flex-direction:column;gap:18px;min-width:0}
.tot{display:flex;gap:28px;align-items:center}
.tot .k{font-size:12px;color:var(--muted)}
.tot .v{font:600 18px var(--mono)}
:root{--board-top:200px}
.board{display:grid;grid-template-columns:repeat(4,minmax(180px,1fr)) repeat(2,minmax(160px,.78fr));gap:12px}
.lane{background:#fff;border-radius:12px;box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column}
.lh{padding:12px 14px;flex:none}
.lh .r1{display:flex;align-items:center;justify-content:space-between;font-weight:700}
.lh .r2{display:flex;justify-content:space-between;flex-wrap:wrap;gap:2px 8px;margin-top:8px;font:12px var(--mono);opacity:.9;white-space:nowrap}
.lh .r2 b{font-size:14px}
.lh .add{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.35)}
.lb{padding:10px;display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1;min-height:0}
.dc{background:var(--page);border-radius:10px;padding:11px 12px}
.dc .n{font-weight:600;line-height:1.3;font-size:13.5px}
.dc .o{font-size:12px;color:var(--muted);margin-top:1px}
.dc .f{display:flex;align-items:center;gap:8px;margin-top:9px}
.av{width:22px;height:22px;border-radius:50%;background:#fff;display:grid;place-items:center;font:600 10px var(--sans);color:var(--muted)}
.dc .f b{font:600 13px var(--mono)}
.dc .f .r{margin-left:auto;font:11.5px var(--mono);color:var(--muted);white-space:nowrap}
.dc.focus{outline:2px solid var(--cerulean);outline-offset:2px;background:#fff;box-shadow:0 8px 22px rgba(7,59,76,.14)}
.dc.lt{background:#FEF1F4}
.kbd{font:600 11px var(--mono);padding:2px 6px;border-radius:5px;background:var(--tint);color:var(--midnight)}
.hint{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted)}
`;
function railC(on) {
  return `<nav class="rail" aria-label="Sections"><span class="mark">A</span>${NAV.map(
    (n) => `<a class="${n.k === on ? 'on' : ''}" ${navHref(n)} title="${n.label}" aria-label="${n.label}">${icon(n.ico, 20)}${n.count ? `<span class="rb">${open.length}</span>` : ''}</a>`
  ).join('')}</nav>`;
}
function chevronsC(w, h) {
  const n = FUNNEL.length, cw = w / n, tip = 18;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Sales funnel by stage">`;
  FUNNEL.forEach((f, i) => {
    const x0 = i * cw, x1 = x0 + cw - 4, st = S[f.key];
    const first = i === 0;
    const d = `M${x0 + (first ? 10 : 0)},0 H${x1 - tip} L${x1},${h / 2} L${x1 - tip},${h} H${x0 + (first ? 10 : 0)} ${first ? `Q${x0},${h} ${x0},${h - 10} V10 Q${x0},0 ${x0 + 10},0` : `L${x0 + tip},${h / 2} Z`}`;
    s += `<path d="${d}" fill="${st.solid}"/>`;
    const tx = x0 + (first ? 16 : tip + 10), ink = st.ink;
    s += `<text x="${tx}" y="24" class="chev-l" fill="${ink}">${f.key}</text>`;
    s += `<text x="${tx}" y="46" class="chev-v" fill="${ink}">${money(f.value)}</text>`;
    s += `<text x="${tx}" y="64" class="chev-s" fill="${ink}">${f.n} deals</text>`;
  });
  return s + '</svg>';
}
function dashboardC() {
  const COL = ['#06D6A0', '#FFC145', '#F78C6B', '#118AB2'];
  const left = `<div class="col">
  <section class="kpis">${TILES.map(
    (t, i) => `<div class="panel kpi"><div class="k">${t.k}</div><div class="v">${t.v}</div><div class="s"><span class="sw" style="background:${COL[i]}"></span>${t.sub}</div></div>`
  ).join('')}</section>
  <section class="g">
    <div class="panel card"><div class="card-h"><h2>Revenue won by month</h2><span class="muted">Dec 2025 – Nov 2026 · USD</span></div>${lineChart({ w: 600, h: 250 })}</div>
    <div class="panel card"><div class="card-h"><h2>Deals won by month</h2><span class="muted">Count</span></div>${barChart({ w: 380, h: 250 })}</div>
  </section>
  <section class="panel card"><div class="card-h"><h2>Pipeline funnel</h2><span class="muted">Value of deals that reached each stage</span></div>${chevronsC(1000, 78)}<div class="conv">${FUNNEL.map(
    (f, i) => `<span>${i ? Math.round((f.value / FUNNEL[i - 1].value) * 100) + '% carried on' : 'Start'}</span>`
  ).join('')}</div></section>
  <section class="g" style="grid-template-columns:1fr 1fr">
    <div class="panel card"><div class="card-h"><h2>Biggest open deals</h2><span class="muted">By expected revenue</span></div>${[...open]
      .sort((a, b) => exp(b) - exp(a))
      .slice(0, 4)
      .map(
        (d) =>
          `<div style="display:flex;align-items:center;gap:10px;padding:8px 0">${pill(d.stage)}<div style="flex:1;min-width:0"><div style="font-weight:600">${esc(d.name)}</div><div class="muted" style="font-size:12.5px">${esc(d.org)}</div></div><div style="text-align:right"><div class="mono" style="font-weight:600">${money(exp(d))}</div><div class="mono faint" style="font-size:11.5px">of ${money(d.value)}</div></div></div>`
      )
      .join('')}</div>
    <div class="panel card"><div class="card-h"><h2>Late deals</h2><span class="muted">Open past their close date</span></div>${open
      .filter(isLate)
      .map(
        (d) =>
          `<div style="display:flex;align-items:center;gap:10px;padding:8px 0">${pill(d.stage)}<div style="flex:1"><div style="font-weight:600">${esc(d.name)}</div><div class="muted" style="font-size:12.5px">${esc(d.org)}</div></div><span class="mono late" style="font-size:12.5px">${relClose(d)}</span></div>`
      )
      .join('')}</div>
  </section></div>`;
  const today = `<aside class="panel today"><h2>Today</h2><div class="muted" style="font-size:13px">Follow-ups and the latest activity</div>
  ${Object.entries(FOLLOWUPS)
    .map(([g, items]) => {
      const c = g === 'Overdue' ? ['#C8264F', '#fff'] : g === 'Due today' ? ['#FFC145', '#073B4C'] : ['#E8EEF0', '#073B4C'];
      return `<div class="grp">${g}<span class="cnt" style="background:${c[0]};color:${c[1]}">${items.length}</span></div>${items
        .map(
          (f) =>
            `<div class="task ${g === 'Overdue' ? 'od' : ''}"><span class="circ"></span><div><div class="t">${esc(f.text)}</div><div class="s">${esc(f.target)} · ${esc(f.org)}</div><div class="w">${f.due === 'Today' ? 'Today' : f.due + ' · ' + f.note}</div></div></div>`
        )
        .join('')}`;
    })
    .join('')}
  <div class="sep"></div><div class="grp">Recent activity</div><div class="tl">${ACTIVITY.map(
    (a) =>
      `<div class="ti"><span class="b" style="background:${actColor(a)};color:${actInk(a)}">${icon(actIcon(a), 13)}</span><div><div class="t">${esc(a.text)}</div><div class="s">${esc(a.target)} · ${a.when}</div></div></div>`
  ).join('')}</div></aside>`;
  const pipeline = `<div class="head"><div class="hint">Drag a card, or focus it and press <span class="kbd">Space</span> then the <span class="kbd">← →</span> <span class="kbd">↑ ↓</span> keys</div>
  <div class="tot"><div><div class="k">Open pipeline</div><div class="v">${money(openTotal)}</div></div><div><div class="k">Expected revenue</div><div class="v">${money(openExp)}</div></div><div class="search panel" style="background:#fff;min-width:220px">${icon('search', 16)}Search deals</div></div></div>
  <section class="board scroll">${STAGES.map((s) => {
    const t = colTotals(s.key), o = isOpen({ stage: s.key });
    return `<div class="lane"><div class="lh" style="background:${s.solid};color:${s.ink}"><div class="r1"><span>${s.key} · ${t.n}</span><span class="add" aria-label="Add a deal to ${s.key}">${icon('plus', 14)}</span></div><div class="r2"><b>${money(t.value)}</b><span>${o ? 'Exp ' + money(t.exp) : 'Closed'}</span></div></div><div class="lb scroll">${byStage(s.key)
      .map((d, i) => cardC(d, s.key === 'Negotiation' && i === 1))
      .join('')}</div></div>`;
  }).join('')}</section>`;
  const body = `<div class="shell">${railC('overview')}<div class="pmain">
  <div class="head"><div>${titleH1()}<div class="d">Sun, Nov 15, 2026</div></div><div style="display:flex;gap:10px"><button class="btn quiet">${icon('note', 16)}Log activity</button><button class="btn primary">${icon('plus', 16)}New deal</button></div></div>
  <div id="overview" data-panel="overview" class="ov">${left}${today}</div>
  <div id="pipeline" data-panel="pipeline" class="tp" hidden>${pipeline}</div></div></div>`;
  return page('Accountable · Mockup C', C_CSS, body);
}
function cardC(d, focus) {
  const late = isLate(d);
  return `<div class="dc ${focus ? 'focus' : ''} ${late ? 'lt' : ''}"><div style="display:flex;justify-content:space-between;gap:6px"><div class="n">${esc(d.name)}</div>${late ? '<span class="late-tag">Late</span>' : ''}</div><div class="o">${esc(d.org)}</div><div class="f"><span class="av" title="${esc(d.contact)}">${initials(d.contact)}</span><b>${money(d.value)}</b><span class="r ${late ? 'late' : ''}">${isOpen(d) ? relClose(d) : dshort(d.close)}</span></div></div>`;
}

// ---------- write ----------
const files = {
  'a-classic.html': dashboardA(),
  'b-summary.html': dashboardB(),
  'c-today.html': dashboardC(),
};
for (const [f, html] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), html);
console.log('open', open.length, money(openTotal), money(openExp));
console.log(Object.keys(files).join('\n'));
