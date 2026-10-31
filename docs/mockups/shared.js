/* Shared by all three mockups, so each one shows exactly the same figures.
   "Today" is Oct 31, 2026. Everything here is fictional. Every total is worked out
   from the deals below, using the rules in docs/spec.md. */

(function () {
  const STAGES = [
    { name: "New", key: "new", fill: "#06D6A0", ink: "#073B4C", usual: 5 },
    { name: "Qualified", key: "qualified", fill: "#FFC145", ink: "#073B4C", usual: 20 },
    { name: "Proposal", key: "proposal", fill: "#F78C6B", ink: "#073B4C", usual: 40 },
    { name: "Negotiation", key: "negotiation", fill: "#118AB2", ink: "#FFFFFF", usual: 70 },
    { name: "Won", key: "won", fill: "#073B4C", ink: "#CDD8DB", usual: 100 },
    { name: "Lost", key: "lost", fill: "#EF476F", ink: "#FFFFFF", usual: 0 },
  ];
  const OPEN = STAGES.slice(0, 4);

  /* name, organization, main contact, value, close date, late? */
  const OPEN_DEALS = {
    New: [
      ["Annual support plan", "Harbor & Pine", "Sam Carter", 36000, "Dec 18, 2026"],
      ["Multi-site rollout", "Lantern Hotels", "Elena Petrova", 42000, "Jan 29, 2027"],
      ["Site safety audit", "Cobalt Ridge Roofing", "Owen Walsh", 28000, "Dec 4, 2026"],
      ["Patient portal", "Northlight Dental", "Priya Nair", 32000, "Dec 11, 2026"],
      ["Taproom tablets", "Quarry Lane Brewing", "Ben Adler", 16000, "Nov 20, 2026"],
      ["Fleet tracking pilot", "Kestrel Freight", "Jonas Weber", 34000, "Jan 15, 2027"],
      ["Booking system", "Fernhill Veterinary", "Marcus Bell", 24000, "Dec 22, 2026"],
      ["Online ordering", "Bluebird Bakery", "Ines Moreau", 30000, "Dec 2, 2026"],
      ["Brand refresh", "Saltmarsh Studio", "Noah Kim", 22000, "Nov 27, 2026"],
      ["Staff training program", "Oakhaven Care", "Grace Lindqvist", 26000, "Jan 8, 2027"],
      ["Document archive", "Stonebridge Accounting", "Aisha Rahman", 20000, "Dec 15, 2026"],
    ],
    Qualified: [
      ["Warehouse management", "Tallgrass Foods", "Tomás Reyes", 72000, "Dec 9, 2026"],
      ["Portfolio reporting", "Greyfriars Property", "Daniel Osei", 36000, "Oct 12, 2026", true],
      ["Group-wide license", "Juniper Health", "Hannah Okafor", 96000, "Jan 22, 2027"],
      ["Install scheduling", "Brightwater Solar", "Ana Costa", 44000, "Nov 24, 2026"],
      ["Claims workflow", "Marlowe Insurance", "Li Wei", 48000, "Dec 3, 2026"],
      ["Member app", "Pennant Sports Club", "Leo Marsh", 22000, "Nov 19, 2026"],
      ["Campus network upgrade", "Willow Creek Schools", "Fatima Haddad", 58000, "Jan 12, 2027"],
      ["Job costing", "Ironwood Joinery", "Ruth Adeyemi", 16000, "Nov 13, 2026"],
      ["Showroom displays", "Foxglove Interiors", "Maya Lund", 28000, "Dec 17, 2026"],
    ],
    Proposal: [
      ["Network refresh", "Copperline Electric", "Carlos Vega", 84000, "Dec 1, 2026"],
      ["Renewal and upgrade", "Harbor & Pine", "Sam Carter", 24000, "Oct 9, 2026", true],
      ["Retail stock sync", "Summit Trail Outfitters", "Nora Hale", 62000, "Nov 26, 2026"],
      ["Case management", "Alder & Finch Legal", "Yuki Tanaka", 34000, "Nov 17, 2026"],
      ["Press line monitoring", "Redwood Print", "Peter Novak", 46000, "Oct 22, 2026", true],
      ["Front desk kiosks", "Lantern Hotels", "Elena Petrova", 18000, "Nov 12, 2026"],
      ["Team training", "Northlight Dental", "Priya Nair", 10000, "Nov 6, 2026"],
      ["Delivery routing", "Tallgrass Foods", "Tomás Reyes", 12000, "Nov 30, 2026"],
    ],
    Negotiation: [
      ["Security review", "Marlowe Insurance", "Li Wei", 32000, "Nov 10, 2026"],
      ["Payroll integration", "Oakhaven Care", "Grace Lindqvist", 48000, "Oct 16, 2026", true],
      ["Three-year service contract", "Kestrel Freight", "Jonas Weber", 68000, "Nov 14, 2026"],
      ["Online store", "Summit Trail Outfitters", "Nora Hale", 26000, "Nov 5, 2026"],
      ["Data migration", "Stonebridge Accounting", "Aisha Rahman", 18000, "Oct 28, 2026", true],
      ["Label printing", "Quarry Lane Brewing", "Ben Adler", 8000, "Nov 3, 2026"],
      ["Support add-on", "Juniper Health", "Hannah Okafor", 14000, "Nov 18, 2026"],
      ["Phone system", "Fernhill Veterinary", "Marcus Bell", 6000, "Nov 9, 2026"],
    ],
  };

  /* Wins by month, newest last. Each value is one won deal. */
  const WINS = [
    ["Nov", 2025, [18000]],
    ["Dec", 2025, [14500]],
    ["Jan", 2026, [21000]],
    ["Feb", 2026, [16000, 10000]],
    ["Mar", 2026, [19500, 12000]],
    ["Apr", 2026, [15000, 13000]],
    ["May", 2026, [24000, 15000]],
    ["Jun", 2026, [21000, 14500, 9000]],
    ["Jul", 2026, [26000, 16000, 10000]],
    ["Aug", 2026, [28000, 17500, 11000, 7000]],
    ["Sep", 2026, [26000, 18000, 13000, 9000, 6000]],
    ["Oct", 2026, [28500, 19000, 14000, 11000, 7000, 5000]],
  ];

  /* value, close date, furthest stage reached before it was lost */
  const LOSSES = [
    [34000, "Oct 21, 2026", "Qualified"],
    [28000, "Oct 2, 2026", "Proposal"],
    [24000, "Sep 15, 2026", "New"],
    [22000, "Aug 28, 2026", "Negotiation"],
    [18000, "Jul 30, 2026", "Proposal"],
    [16000, "Jul 9, 2026", "Qualified"],
    [12000, "Jun 11, 2026", "Negotiation"],
    [10000, "May 19, 2026", "Proposal"],
    [8000, "Apr 8, 2026", "New"],
    [6000, "Mar 3, 2026", "Negotiation"],
    [5000, "Jan 27, 2026", "New"],
    [3000, "Dec 16, 2025", "Qualified"],
  ];

  const CLOSED_NAMES = [
    "Onboarding package", "Service contract", "Renewal", "Reporting add-on", "Pilot program",
    "Team training", "Upgrade", "Site survey", "Integration", "Support plan", "Data clean-up",
  ];
  const CLIENTS = [
    ["Harbor & Pine", "Sam Carter"], ["Redwood Print", "Peter Novak"], ["Juniper Health", "Hannah Okafor"],
    ["Copperline Electric", "Carlos Vega"], ["Tallgrass Foods", "Tomás Reyes"], ["Bluebird Bakery", "Ines Moreau"],
    ["Alder & Finch Legal", "Yuki Tanaka"], ["Kestrel Freight", "Jonas Weber"], ["Saltmarsh Studio", "Noah Kim"],
    ["Foxglove Interiors", "Maya Lund"], ["Brightwater Solar", "Ana Costa"], ["Greyfriars Property", "Daniel Osei"],
    ["Ironwood Joinery", "Ruth Adeyemi"],
  ];

  const toDeal = (stage) => (row) => ({
    name: row[0], org: row[1], contact: row[2], value: row[3], close: row[4], late: !!row[5],
    stage: stage.name, probability: stage.usual,
  });

  const open = {};
  OPEN.forEach((s) => { open[s.name] = OPEN_DEALS[s.name].map(toDeal(s)); });

  const won = [];
  const months = WINS.map(([month, year, values], m) => {
    values.forEach((value, i) => {
      const [org, contact] = CLIENTS[(m * 3 + i) % CLIENTS.length];
      const day = (month === "Oct" ? 30 : 28) - i * 5;
      won.unshift({
        name: CLOSED_NAMES[(m + i * 2) % CLOSED_NAMES.length], org, contact, value,
        close: `${month} ${day}, ${year}`, late: false, stage: "Won", probability: 100,
      });
    });
    return { month, revenue: values.reduce((a, b) => a + b, 0), deals: values.length };
  });

  won.sort((a, b) => new Date(b.close) - new Date(a.close));

  const lost = LOSSES.map(([value, close, reached], i) => {
    const [org, contact] = CLIENTS[(i * 2 + 5) % CLIENTS.length];
    return {
      name: CLOSED_NAMES[(i * 3 + 1) % CLOSED_NAMES.length], org, contact, value, close, reached,
      late: false, stage: "Lost", probability: 0,
    };
  });

  const sum = (list, f) => list.reduce((a, d) => a + f(d), 0);
  const expected = (d) => Math.round((d.value * d.probability) / 100);

  const board = STAGES.map((s) => {
    const deals = open[s.name] || (s.name === "Won" ? won : lost);
    return {
      ...s, deals, count: deals.length,
      value: sum(deals, (d) => d.value),
      expected: sum(deals, expected),
    };
  });
  const openBoard = board.slice(0, 4);
  const allOpen = openBoard.flatMap((c) => c.deals);

  /* Value reaching each stage: rule H5 in docs/spec.md. */
  const rank = { New: 0, Qualified: 1, Proposal: 2, Negotiation: 3, Won: 4 };
  const everyDeal = [...allOpen, ...won, ...lost];
  const furthest = (d) => rank[d.stage === "Lost" ? d.reached : d.stage];
  const funnel = STAGES.slice(0, 5).map((s, i, all) => {
    const value = sum(everyDeal.filter((d) => furthest(d) >= i), (d) => d.value);
    return { ...s, value };
  });
  funnel.forEach((f, i) => {
    f.carried = i === 0 ? null : Math.round((f.value / funnel[i - 1].value) * 100);
  });

  const followUps = [
    { text: "Send revised quote", about: "Renewal and upgrade", org: "Harbor & Pine", date: "Oct 12", overdue: true },
    { text: "Call about payroll sign-off", about: "Payroll integration", org: "Oakhaven Care", date: "Oct 20", overdue: true },
    { text: "Chase signed order form", about: "Data migration", org: "Stonebridge Accounting", date: "Oct 26", overdue: true },
    { text: "Book a site visit", about: "Owen Walsh", org: "Cobalt Ridge Roofing", date: "Oct 27", overdue: true },
    { text: "Reply to pricing question", about: "Peter Novak", org: "Redwood Print", date: "Oct 29", overdue: true },
    { text: "Confirm the budget holder", about: "Portfolio reporting", org: "Greyfriars Property", date: "Oct 30", overdue: true },
    { text: "Prepare demo notes", about: "Group-wide license", org: "Juniper Health", date: "Today" },
    { text: "Send contract draft", about: "Three-year service contract", org: "Kestrel Freight", date: "Nov 2" },
    { text: "Introduce the account lead", about: "Hannah Okafor", org: "Juniper Health", date: "Nov 3" },
    { text: "Check delivery dates", about: "Online store", org: "Summit Trail Outfitters", date: "Nov 4" },
    { text: "Call about the security review", about: "Security review", org: "Marlowe Insurance", date: "Nov 5" },
    { text: "Share a case study", about: "Yuki Tanaka", org: "Alder & Finch Legal", date: "Nov 6" },
    { text: "Review pricing options", about: "Retail stock sync", org: "Summit Trail Outfitters", date: "Nov 9" },
    { text: "Agree training dates", about: "Team training", org: "Northlight Dental", date: "Nov 10" },
    { text: "Follow up on the quote", about: "Front desk kiosks", org: "Lantern Hotels", date: "Nov 12" },
    { text: "Book a renewal call", about: "Priya Nair", org: "Northlight Dental", date: "Nov 16" },
  ];

  const recent = [
    { type: "stage", text: "Moved from Proposal to Negotiation", about: "Security review", when: "Oct 31, 10:42 AM" },
    { type: "call", text: "Called about contract terms", about: "Three-year service contract", when: "Oct 31, 9:15 AM" },
    { type: "email", text: "Sent updated pricing", about: "Retail stock sync", when: "Oct 30, 4:48 PM" },
    { type: "stage", text: "Moved from Negotiation to Won", about: "Onboarding package", when: "Oct 30, 2:20 PM" },
    { type: "note", text: "Budget confirmed for next quarter", about: "Hannah Okafor", when: "Oct 30, 11:05 AM" },
    { type: "call", text: "Left a message about the site visit", about: "Owen Walsh", when: "Oct 29, 3:32 PM" },
    { type: "stage", text: "Moved from Qualified to Proposal", about: "Network refresh", when: "Oct 29, 10:10 AM" },
    { type: "email", text: "Sent the proposal", about: "Network refresh", when: "Oct 29, 9:50 AM" },
    { type: "note", text: "Asked for two more references", about: "Yuki Tanaka", when: "Oct 28, 5:02 PM" },
    { type: "stage", text: "Moved from New to Qualified", about: "Claims workflow", when: "Oct 28, 1:27 PM" },
  ];

  const thisMonth = months[11];
  const lastMonth = months[10];
  const openValue = sum(allOpen, (d) => d.value);
  const openExpected = sum(allOpen, expected);

  const money = (n) => "$" + n.toLocaleString("en-US");
  const shortMoney = (n) => {
    if (n >= 1000000) return "$" + +(n / 1000000).toFixed(2) + "M";
    if (n >= 1000) return "$" + +(n / 1000).toFixed(0) + "k";
    return "$" + n;
  };

  const niceMax = (v) => {
    const pow = 10 ** Math.floor(Math.log10(v));
    const n = v / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
  };

  /* Line chart: rules under "Charts" in docs/spec.md. */
  function lineChart(w, h, o = {}) {
    const m = { top: 28, right: 18, bottom: 26, left: 48, ...o.margin };
    const fill = o.fill || "rgba(6, 214, 160, 0.34)";
    const iw = w - m.left - m.right;
    const ih = h - m.top - m.bottom;
    const top = niceMax(Math.max(...months.map((d) => d.revenue)));
    const x = (i) => m.left + (i / 11) * iw;
    const y = (v) => m.top + ih - (v / top) * ih;
    const pts = months.map((d, i) => [x(i), y(d.revenue)]);
    const line = (list) => list.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const base = m.top + ih + (o.bleed ? m.bottom : 0);
    const edge = o.bleed ? w : x(11);
    const first = o.bleed ? 0 : x(0);
    const area = `${line(pts)} L${edge} ${pts[11][1].toFixed(1)} L${edge} ${base} L${first} ${base} L${first} ${pts[0][1].toFixed(1)} Z`;
    let out = `<svg width="${w}" height="${h}" role="img" aria-label="Revenue won per month, last 12 months">`;
    const ticks = [0.25, 0.5, 0.75, 1];
    ticks.forEach((t) => {
      const yy = y(top * t);
      out += `<line x1="${m.left}" x2="${o.axisRight ? w : w - m.right}" y1="${yy}" y2="${yy}" stroke="#E4ECEE"/>`;
    });
    out += `<path d="${area}" fill="${fill}"/>`;
    const axisClass = o.axisStrong ? ' class="strong"' : "";
    ticks.forEach((t) => {
      const place = o.axisRight ? `x="${w - 12}" y="${y(top * t) - 5}"` : `x="${m.left - 10}" y="${y(top * t) + 4}"`;
      out += `<text${axisClass} ${place} text-anchor="end">${shortMoney(top * t)}</text>`;
    });
    if (!o.bleed) out += `<text x="${m.left - 10}" y="${m.top + ih + 4}" text-anchor="end">$0</text>`;
    out += `<path d="${line(pts.slice(0, 11))}" fill="none" stroke="#073B4C" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    out += `<path d="${line(pts.slice(10))}" fill="none" stroke="#073B4C" stroke-width="2" stroke-dasharray="4 4"/>`;
    months.forEach((d, i) => {
      const cls = o.axisStrong ? ' class="strong"' : "";
      out += `<text${cls} x="${x(i)}" y="${h - 8}" text-anchor="middle">${d.month}</text>`;
    });
    const [lx, ly] = pts[11];
    out += `<circle cx="${lx}" cy="${ly}" r="5" fill="#073B4C" stroke="#fff" stroke-width="2"/>`;
    if (!o.noLabel) out += `<text class="strong" x="${lx - 10}" y="${ly - 12}" text-anchor="end">${money(thisMonth.revenue)} so far</text>`;
    months.forEach((d, i) => {
      out += `<rect x="${x(i) - iw / 22}" y="${m.top}" width="${iw / 11}" height="${ih}" fill="transparent"><title>${d.month}: ${money(d.revenue)}${i === 11 ? " so far" : ""}</title></rect>`;
    });
    return out + "</svg>";
  }

  /* Bar chart: rules under "Charts" in docs/spec.md. */
  function barChart(w, h, o = {}) {
    const m = { top: 28, right: 6, bottom: 26, left: 26, ...o.margin };
    const iw = w - m.left - m.right;
    const ih = h - m.top - m.bottom;
    const top = Math.max(...months.map((d) => d.deals));
    const step = iw / 12;
    const bw = Math.min(o.barWidth || 16, step - 4);
    const y = (v) => m.top + ih - (v / top) * ih;
    let out = `<svg width="${w}" height="${h}" role="img" aria-label="Deals won per month, last 12 months">`;
    [2, 4, 6].forEach((v) => {
      out += `<line x1="${m.left}" x2="${w - m.right}" y1="${y(v)}" y2="${y(v)}" stroke="#E4ECEE"/>`;
      out += `<text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    });
    months.forEach((d, i) => {
      const cx = m.left + step * i + step / 2;
      const x0 = cx - bw / 2;
      const yy = y(d.deals);
      const r = Math.min(4, bw / 2);
      const color = i === 11 ? "#839DA5" : "#073B4C";
      const base = m.top + ih;
      out += `<path d="M${x0} ${base} V${yy + r} Q${x0} ${yy} ${x0 + r} ${yy} H${x0 + bw - r} Q${x0 + bw} ${yy} ${x0 + bw} ${yy + r} V${base} Z" fill="${color}"><title>${d.month}: ${d.deals} won${i === 11 ? " so far" : ""}</title></path>`;
      if (o.every || i % 2 === 1) {
        out += `<text x="${cx}" y="${h - 8}" text-anchor="middle">${d.month}</text>`;
      }
    });
    out += `<text class="strong" x="${w - m.right}" y="${y(months[11].deals) - 10}" text-anchor="end">${o.soFarOnly ? "so far" : months[11].deals + " so far"}</text>`;
    return out + "</svg>";
  }

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    organizations: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M15 9h3a2 2 0 0 1 2 2v10"/><path d="M2 21h20M8 7h3M8 11h3M8 15h3"/>',
    contacts: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M18 15a7 7 0 0 1 4 6"/>',
    deals: '<circle cx="12" cy="12" r="9"/><path d="M15 9a3 2.4 0 0 0-3-1.6c-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2a3 2.4 0 0 1-3-1.6M12 6v12"/>',
    pipeline: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    call: '<path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v3a3 3 0 0 1-3 3A15 15 0 0 1 3 6a3 3 0 0 1 3-3z"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    note: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/>',
    stage: '<path d="M4 12h14M13 6l6 6-6 6"/>',
  };
  const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  const NAV = [
    ["Dashboard", "dashboard"], ["Organizations", "organizations"], ["Contacts", "contacts"],
    ["Deals", "deals"], ["Pipeline", "pipeline"],
  ];

  /* Only the two screens in this mockup link anywhere. */
  const navLinks = () => NAV.map(([label, key]) => {
    const live = key === "dashboard" || key === "pipeline";
    const attrs = live ? `href="#${key}"` : 'href="#" onclick="return false" title="Not part of this mockup"';
    return `<a ${attrs} data-nav="${key}">${icon(key)}${label}</a>`;
  }).join("");

  const overdueCount = followUps.filter((f) => f.overdue).length;
  const followUpCount = `${overdueCount} overdue, ${followUps.length - overdueCount} upcoming`;

  const fitChart = (id, draw) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = draw(el.clientWidth, el.clientHeight);
  };

  /* Switches between the two screens from the address, so each can be linked to. */
  function screens(afterShow) {
    const show = () => {
      const name = location.hash === "#pipeline" ? "pipeline" : "dashboard";
      document.querySelectorAll("[data-screen]").forEach((el) => { el.hidden = el.dataset.screen !== name; });
      document.querySelectorAll("[data-nav]").forEach((el) => {
        el.classList.toggle("on", el.dataset.nav === name);
        if (el.dataset.nav === name) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      });
      document.title = (name === "pipeline" ? "Pipeline" : "Dashboard") + " | " + document.body.dataset.name;
      afterShow(name);
    };
    window.addEventListener("hashchange", show);
    window.addEventListener("resize", show);
    document.fonts.ready.then(show);
    show();
  }

  window.MOCK = {
    today: "Oct 31, 2026",
    summary: "6 follow-ups overdue and 5 deals running late.",
    months, thisMonth, lastMonth, openValue, openExpected,
    openCount: allOpen.length,
    openShare: Math.round((openExpected / openValue) * 100),
    board, openBoard, funnel, followUps, recent, icon, navLinks, followUpCount,
    money, shortMoney, lineChart, barChart, fitChart, screens,
  };
})();
