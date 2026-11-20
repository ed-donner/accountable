/* Shared by the three mockups: the sample data, number formats, icons and chart drawing.
   Plain browser JavaScript, so each mockup opens straight from this folder. */
window.M = (function () {
  const STAGES = [
    { key: 'new', name: 'New', color: '#8AA3AB', text: '#46636D', tint: '#DCE4E6', prob: 10 },
    { key: 'qualified', name: 'Qualified', color: '#FFC145', text: '#8A5A00', tint: '#FFF6E5', prob: 25 },
    { key: 'proposal', name: 'Proposal', color: '#F78C6B', text: '#B4472A', tint: '#FEEFEA', prob: 50 },
    { key: 'negotiation', name: 'Negotiation', color: '#118AB2', text: '#0D6E8E', tint: '#DEEFF4', prob: 75 },
    { key: 'won', name: 'Won', color: '#06D6A0', text: '#037A5C', tint: '#DCF9F2', prob: 100 },
    { key: 'lost', name: 'Lost', color: '#EF476F', text: '#C42A50', tint: '#FDE5EB', prob: 0 },
  ];
  const stage = Object.fromEntries(STAGES.map((s) => [s.key, s]));
  const OPEN = ['new', 'qualified', 'proposal', 'negotiation'];

  const deal = (name, org, value, close, contact, late = false) => ({ name, org, value, close, contact, late });

  // Today is Thursday, November 19, 2026. Won and Lost show deals closed in the last 30 days.
  const BOARD = {
    new: [
      deal('Paid social pilot', 'Harbor & Pine Outfitters', 15000, 'Dec 10, 2026', 'Jonah Park'),
      deal('Brand workshop series', 'Brightpath Academy', 12000, 'Dec 18, 2026', 'Marcus Webb'),
      deal('Sustainability report design', 'Ferro Fabrication', 9500, 'Jan 8, 2027', null),
      deal('Annual analytics retainer', 'Lumen Analytics', 36000, 'Jan 15, 2027', 'Priya Nair'),
      deal('Loyalty app discovery', 'Saltmarsh Hotels', 28000, 'Feb 5, 2027', 'Elena Rossi'),
    ],
    qualified: [
      deal('Trade show campaign', 'Ferro Fabrication', 24000, 'Nov 12, 2026', 'Grace Liu', true),
      deal('SEO retainer 2027', 'Cedar Health Partners', 42000, 'Dec 22, 2026', 'Amir Haddad'),
      deal('Data dashboard build', 'Bluefin Logistics', 38000, 'Jan 20, 2027', 'Sarah Chen'),
      deal('Member portal redesign', 'Oakridge Credit Union', 84000, 'Jan 29, 2027', 'Dana Whitfield'),
      deal('Course catalog site', 'Brightpath Academy', 55000, 'Feb 12, 2027', 'Marcus Webb'),
    ],
    proposal: [
      deal('Spring catalog shoot', 'Harbor & Pine Outfitters', 31000, 'Nov 16, 2026', 'Jonah Park', true),
      deal('Patient intake forms', 'Cedar Health Partners', 67000, 'Dec 4, 2026', 'Amir Haddad'),
      deal('Website redesign', 'Bluefin Logistics', 48500, 'Dec 12, 2026', 'Sarah Chen'),
      deal('Grant campaign', 'Tidewater Food Bank', 18000, 'Dec 30, 2026', 'Rosa Delgado'),
      deal('Booking engine integration', 'Saltmarsh Hotels', 112000, 'Jan 14, 2027', 'Elena Rossi'),
    ],
    negotiation: [
      deal('Staff training program', 'Oakridge Credit Union', 22000, 'Nov 6, 2026', 'Dana Whitfield', true),
      deal('Marketing retainer 2027', 'Lumen Analytics', 96000, 'Dec 1, 2026', 'Priya Nair'),
      deal('Rebrand and identity', 'Quillfield Robotics', 145000, 'Dec 15, 2026', 'Theo Grant'),
      deal('E-commerce replatform', 'Harbor & Pine Outfitters', 128000, 'Dec 20, 2026', 'Jonah Park'),
    ],
    won: [
      deal('Q4 content retainer', 'Cedar Health Partners', 54000, 'Nov 9, 2026', 'Amir Haddad'),
      deal('Logo refresh', 'Tidewater Food Bank', 8500, 'Oct 28, 2026', 'Rosa Delgado'),
    ],
    lost: [
      deal('Investor deck design', 'Quillfield Robotics', 14000, 'Nov 3, 2026', 'Theo Grant'),
      deal('Hotel signage system', 'Saltmarsh Hotels', 26000, 'Oct 23, 2026', 'Elena Rossi'),
    ],
  };

  const MONTHS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const MONTHS_LONG = ['December 2025', 'January 2026', 'February 2026', 'March 2026', 'April 2026', 'May 2026',
    'June 2026', 'July 2026', 'August 2026', 'September 2026', 'October 2026', 'November 2026'];
  const REVENUE = [42000, 0, 65000, 23000, 0, 100000, 31000, 0, 140000, 47500, 8500, 54000];
  const WON = [1, 0, 1, 1, 0, 2, 1, 0, 1, 1, 1, 1];

  // Deals created in the last 12 months, counted at every stage up to the furthest they reached.
  const FUNNEL = [
    { key: 'new', count: 35, value: 1728000 },
    { key: 'qualified', count: 28, value: 1578500 },
    { key: 'proposal', count: 22, value: 1316500 },
    { key: 'negotiation', count: 15, value: 962000 },
    { key: 'won', count: 10, value: 511000 },
  ];

  const FOLLOW_UPS = [
    { type: 'call', text: 'Chase the signed scope for staff training', rel: 'Staff training program', date: 'Nov 13', late: '6 days late' },
    { type: 'email', text: 'Send the revised catalog shoot quote', rel: 'Spring catalog shoot', date: 'Nov 17', late: '2 days late' },
    { type: 'call', text: 'Check in after the trade show brief', rel: 'Grace Liu', date: 'Nov 18', late: '1 day late' },
    { type: 'note', text: 'Prepare pricing options for the rebrand', rel: 'Rebrand and identity', date: 'Nov 19', day: 'Today' },
    { type: 'call', text: 'Walk Sarah through the proposal', rel: 'Website redesign', date: 'Nov 20', day: 'Tomorrow' },
    { type: 'email', text: 'Share two case studies', rel: 'Priya Nair', date: 'Nov 23', day: 'Monday' },
    { type: 'call', text: 'Intro call with the new marketing lead', rel: 'Elena Rossi', date: 'Nov 25', day: 'Wednesday' },
  ];

  const RECENT = [
    { type: 'stage', text: 'Moved from Qualified to Proposal', rel: 'Website redesign', when: 'Today, 10:42 AM' },
    { type: 'call', text: 'Walked through the scope. Sarah wants phase two priced separately.', rel: 'Website redesign', when: 'Today, 9:15 AM' },
    { type: 'email', text: 'Sent the 2027 retainer terms for review.', rel: 'Marketing retainer 2027', when: 'Yesterday, 4:30 PM' },
    { type: 'stage', text: 'Moved from Proposal to Negotiation', rel: 'E-commerce replatform', when: 'Yesterday, 2:05 PM' },
    { type: 'note', text: 'Theo prefers a February launch for the new identity.', rel: 'Rebrand and identity', when: 'Nov 17, 11:20 AM' },
    { type: 'call', text: 'Rosa confirmed the board approved the campaign budget.', rel: 'Grant campaign', when: 'Nov 16, 3:40 PM' },
  ];

  const TYPE_NAMES = { call: 'Call', email: 'Email', note: 'Note', stage: 'Stage change' };

  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  function short(n) {
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
    return '$' + n;
  }
  const expected = (key, v) => Math.round((v * stage[key].prob) / 100);
  function totals(key) {
    const value = BOARD[key].reduce((a, d) => a + d.value, 0);
    return { count: BOARD[key].length, value, expected: expected(key, value) };
  }
  function openTotals() {
    return OPEN.reduce((a, k) => {
      const t = totals(k);
      return { count: a.count + t.count, value: a.value + t.value, expected: a.expected + t.expected };
    }, { count: 0, value: 0, expected: 0 });
  }
  function mix(hex, other, t) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = p(hex), b = p(other);
    return '#' + a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
  }
  const initials = (name) => name.split(' ').map((p) => p[0]).join('').slice(0, 2);

  const ICONS = {
    call: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    note: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    stage: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  };
  const icon = (name, size = 16) =>
    `<svg class="icon icon-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  let uid = 0;

  // Revenue won by month. Points sit at the middle of each month's band, so it lines up with the bar chart.
  function lineChart(o) {
    const w = o.w, h = o.h, m = Object.assign({ l: 60, r: 16, t: 20, b: 34 }, o.margin || {});
    const iw = w - m.l - m.r, ih = h - m.t - m.b, n = REVENUE.length, band = iw / n;
    const max = 150000, ticks = [0, 50000, 100000, 150000];
    const x = (i) => m.l + band * (i + 0.5);
    const y = (v) => m.t + ih - (ih * v) / max;
    const id = 'tip' + uid++;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Revenue won each month for the last 12 months, highest $140,000 in August 2026">`;
    s += `<defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#073B4C" flood-opacity="0.16"/></filter></defs>`;
    ticks.forEach((t) => {
      s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${o.grid || '#E4ECEE'}"/>`;
      s += `<text x="${m.l - 12}" y="${y(t) + 4}" text-anchor="end" class="ax">${t === 0 ? '$0' : short(t)}</text>`;
    });
    if (!o.hideMonths) MONTHS.forEach((lb, i) => (s += `<text x="${x(i)}" y="${h - 10}" text-anchor="middle" class="ax">${lb}</text>`));
    const pts = REVENUE.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    s += `<path d="M${pts.join(' L')} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z" fill="${o.fill}" fill-opacity="${o.fillOpacity ?? 0.14}"/>`;
    s += `<path d="M${pts.join(' L')}" fill="none" stroke="${o.stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = n - 1;
    s += `<circle cx="${x(last)}" cy="${y(REVENUE[last])}" r="5" fill="${o.stroke}" stroke="${o.panel || '#fff'}" stroke-width="2"/>`;
    if (o.highlight != null) {
      const i = o.highlight, hx = x(i), hy = y(REVENUE[i]);
      s += `<line x1="${hx}" x2="${hx}" y1="${m.t}" y2="${y(0)}" stroke="#7D949C" stroke-dasharray="3 4"/>`;
      s += `<circle cx="${hx}" cy="${hy}" r="6" fill="${o.stroke}" stroke="${o.panel || '#fff'}" stroke-width="2"/>`;
      const tw = 156, th = 70;
      let tx = hx + 16;
      if (tx + tw > w - 4) tx = hx - 16 - tw;
      const ty = Math.max(2, hy - 8);
      s += `<g><rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="10" fill="#FFFFFF" filter="url(#${id})"/>`;
      s += `<text x="${tx + 14}" y="${ty + 22}" class="tip-l">${MONTHS_LONG[i]}</text>`;
      s += `<text x="${tx + 14}" y="${ty + 44}" class="tip-v">${money(REVENUE[i])}</text>`;
      s += `<text x="${tx + 14}" y="${ty + 61}" class="tip-l">${WON[i]} deal${WON[i] === 1 ? '' : 's'} won</text></g>`;
    }
    return s + '</svg>';
  }

  // Deals won by month, as bars with rounded tops on the baseline.
  function barChart(o) {
    const w = o.w, h = o.h, m = Object.assign({ l: 60, r: 16, t: 22, b: 34 }, o.margin || {});
    const iw = w - m.l - m.r, ih = h - m.t - m.b, n = WON.length, band = iw / n;
    const max = 3, ticks = [0, 1, 2, 3];
    const y = (v) => m.t + ih - (ih * v) / max;
    const bw = Math.min(o.barWidth || 26, band * 0.6), r = 4;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Deals won each month for the last 12 months, 10 in total">`;
    ticks.forEach((t) => {
      s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${o.grid || '#E4ECEE'}"/>`;
      s += `<text x="${m.l - 12}" y="${y(t) + 4}" text-anchor="end" class="ax">${t}</text>`;
    });
    WON.forEach((v, i) => {
      const cx = m.l + band * (i + 0.5);
      if (!o.hideMonths) s += `<text x="${cx}" y="${h - 10}" text-anchor="middle" class="ax">${MONTHS[i]}</text>`;
      if (!v) return;
      const x0 = cx - bw / 2, top = y(v), base = y(0);
      s += `<path d="M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z" fill="${o.fill}"/>`;
      if (o.labels) s += `<text x="${cx}" y="${top - 7}" text-anchor="middle" class="bar-l">${v}</text>`;
    });
    return s + '</svg>';
  }

  // The sales funnel as rows of bars, either centered or from the left.
  function funnelRows(o) {
    const max = FUNNEL[0].value;
    return FUNNEL.map((f, i) => {
      const s = stage[f.key];
      const share = i ? Math.round((f.value / FUNNEL[i - 1].value) * 100) : null;
      const color = o.colorFor ? o.colorFor(s) : s.color;
      return (share ? `<div class="fn-share">${share}% carried on</div>` : '') +
        `<div class="fn-row"><div class="fn-name">${o.dots === false ? '' : `<span class="dot" style="background:${s.color}"></span>`}${s.name}</div>` +
        `<div class="fn-track ${o.centered ? 'centered' : ''}"><div class="fn-bar" style="width:${((f.value / max) * 100).toFixed(1)}%;background:${color}"></div></div>` +
        `<div class="fn-fig"><span class="mono">${money(f.value)}</span><span class="fn-count">${f.count} deals</span></div></div>`;
    }).join('');
  }

  // The sales funnel as columns stepping down from New to Won.
  function funnelColumns(o) {
    const max = FUNNEL[0].value;
    return FUNNEL.map((f, i) => {
      const s = stage[f.key];
      const share = i ? Math.round((f.value / FUNNEL[i - 1].value) * 100) : null;
      return (share ? `<div class="fc-share"><span class="mono">${share}%</span></div>` : '') +
        `<div class="fc-col"><div class="fc-fig"><span class="mono">${money(f.value)}</span><span class="fc-count">${f.count} deals</span></div>` +
        `<div class="fc-bar" style="height:${Math.round((f.value / max) * o.height)}px;background:${s.color}"></div>` +
        `<div class="fc-name"><span class="dot" style="background:${s.color}"></span>${s.name}</div></div>`;
    }).join('');
  }

  // Open pipeline by stage: total value as a light bar, expected revenue as a solid bar on top.
  function stageRows() {
    const rows = OPEN.map((k) => ({ s: stage[k], t: totals(k) }));
    const max = Math.max(...rows.map((r) => r.t.value));
    return rows.map(({ s, t }) =>
      `<div class="sr-row"><div class="sr-name"><span class="dot" style="background:${s.color}"></span>${s.name}<span class="sr-count">${t.count}</span></div>` +
      `<div class="sr-track"><div class="sr-total" style="width:${((t.value / max) * 100).toFixed(1)}%;background:${mix(s.color, '#FFFFFF', 0.35)}"></div>` +
      `<div class="sr-exp" style="width:${((t.expected / max) * 100).toFixed(1)}%;background:${s.color}"></div></div>` +
      `<div class="sr-fig"><span class="mono">${money(t.value)}</span><span class="sr-exp-l">Expected <span class="mono">${money(t.expected)}</span></span></div></div>`
    ).join('');
  }

  // Open pipeline as one strip, each stage's width set by its value. The solid part is the expected revenue.
  function stageStrip() {
    const all = openTotals();
    return '<div class="strip">' + OPEN.map((k) => {
      const s = stage[k], t = totals(k);
      return `<div class="strip-seg" style="flex:${t.value} 1 0"><div class="strip-bar"><div class="strip-exp" style="width:${s.prob}%;background:${s.color}"></div></div>` +
        `<div class="strip-name"><span class="dot" style="background:${s.color}"></span>${s.name}<span class="strip-count">${t.count}</span></div>` +
        `<div class="strip-val mono">${money(t.value)}</div><div class="strip-exp-l">Expected <span class="mono">${money(t.expected)}</span></div></div>`;
    }).join('') + '</div>' + `<p class="strip-note">Solid part: expected revenue. ${money(all.expected)} of ${money(all.value)}.</p>`;
  }

  function card(d, o = {}) {
    const contact = d.contact
      ? `<span class="avatar">${initials(d.contact)}</span><span class="card-contact">${d.contact}</span>`
      : '<span class="card-contact none">No main contact</span>';
    const late = d.late ? `<span class="badge-late">${icon('clock', 12)}Late</span>` : '';
    if (o.compact) {
      return `<article class="card compact ${o.cls || ''}"><div class="card-name">${d.name}</div><div class="card-org">${d.org}</div>` +
        `<div class="card-nums"><span class="mono card-value">${money(d.value)}</span><span class="mono card-date">${d.close}</span></div></article>`;
    }
    if (o.valueFirst) {
      return `<article class="card ${d.late ? 'is-late' : ''} ${o.cls || ''}"><div class="card-org">${d.org}</div><div class="card-name">${d.name}</div>` +
        `<div class="card-vrow"><span class="mono card-value big">${money(d.value)}</span>${late}</div>` +
        `<div class="card-foot"><span class="card-who">${contact}</span><span class="mono card-date">${d.close}</span></div></article>`;
    }
    return `<article class="card ${d.late ? 'is-late' : ''} ${o.cls || ''}"><div class="card-name">${d.name}</div><div class="card-org">${d.org}</div>` +
      `<div class="card-nums"><span class="mono card-value">${money(d.value)}</span><span class="mono card-date">${d.close}</span></div>` +
      `<div class="card-foot"><span class="card-who">${contact}</span>${late}</div></article>`;
  }

  function followUp(f) {
    return `<li class="fu ${f.late ? 'is-overdue' : ''}"><span class="tick" role="checkbox" aria-checked="false" aria-label="Done"></span>` +
      `<div class="fu-body"><div class="fu-text">${f.text}</div><div class="fu-meta"><span class="fu-type">${icon(f.type, 13)}${TYPE_NAMES[f.type]}</span><a class="fu-rel" href="#">${f.rel}</a></div></div>` +
      `<div class="fu-date">${f.late ? `<span class="late-text">${f.late}</span>` : `<span class="fu-day">${f.day}</span>`}<span class="mono">${f.date}</span></div></li>`;
  }

  function followUps(o = {}) {
    const over = FOLLOW_UPS.filter((f) => f.late), soon = FOLLOW_UPS.filter((f) => !f.late);
    if (!o.groups) return `<ul class="fu-list">${FOLLOW_UPS.map(followUp).join('')}</ul>`;
    return `<h3 class="fu-group">Overdue <span class="mono">${over.length}</span></h3><ul class="fu-list">${over.map(followUp).join('')}</ul>` +
      `<h3 class="fu-group">Due in the next 7 days <span class="mono">${soon.length}</span></h3><ul class="fu-list">${soon.map(followUp).join('')}</ul>`;
  }

  function recent(o = {}) {
    const items = RECENT.slice(0, o.limit || RECENT.length);
    return `<ul class="ra-list">${items.map((r) =>
      `<li class="ra ra-${r.type}"><span class="ra-icon">${icon(r.type, 14)}</span><div class="ra-body"><div class="ra-text">${r.text}</div>` +
      `<div class="ra-meta"><a href="#">${r.rel}</a><span class="ra-when">${r.when}</span></div></div></li>`).join('')}</ul>`;
  }

  return { STAGES, stage, OPEN, BOARD, FUNNEL, money, short, totals, openTotals, mix, icon, lineChart, barChart,
    funnelRows, funnelColumns, stageRows, stageStrip, card, followUps, recent };
})();
