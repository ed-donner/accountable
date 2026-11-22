// Sample data and small SVG chart helpers shared by every mockup.
// "Today" is 16 Nov 2026. All figures are invented.

const TODAY = "2026-11-16";

const STAGES = [
  { key: "new", name: "New", color: "var(--stage-new)", prob: 10 },
  { key: "qualified", name: "Qualified", color: "var(--stage-qualified)", prob: 25 },
  { key: "proposal", name: "Proposal", color: "var(--stage-proposal)", prob: 50 },
  { key: "negotiation", name: "Negotiation", color: "var(--stage-negotiation)", prob: 75 },
  { key: "won", name: "Won", color: "var(--stage-won)", prob: 100 },
  { key: "lost", name: "Lost", color: "var(--stage-lost)", prob: 0 },
];

const DEALS = [
  ["Website rebuild", "Harbor Freight Co.", "Maya Lin", "new", 18000, 10, "2027-02-10"],
  ["Support contract", "Northwind Clinics", "Omar Haddad", "new", 9500, 10, "2027-01-20"],
  ["Fleet tracking pilot", "Bluepeak Logistics", "Sara Novak", "new", 24000, 10, "2027-03-01"],
  ["Data migration", "Kestrel Foods", "Liam Carter", "new", 12500, 10, "2026-12-15"],
  ["Training package", "Alder & Finch", "Priya Shah", "new", 6000, 10, "2027-01-05"],
  ["Annual licence", "Brightwater Energy", "Tom Becker", "qualified", 42000, 25, "2027-01-30"],
  ["POS upgrade", "Kestrel Foods", "Ana Ruiz", "qualified", 15800, 25, "2026-12-20"],
  ["Analytics add-on", "Northwind Clinics", "Grace Okafor", "qualified", 11200, 25, "2026-11-10"],
  ["Warehouse sensors", "Bluepeak Logistics", "Sara Novak", "qualified", 33500, 25, "2027-02-14"],
  ["Payroll integration", "Copperline Studio", "Jonas Weber", "proposal", 27000, 50, "2026-12-05"],
  ["Clinic scheduling", "Northwind Clinics", "Omar Haddad", "proposal", 38000, 50, "2027-01-15"],
  ["Retail rollout, phase 2", "Harbor Freight Co.", "Maya Lin", "proposal", 52000, 50, "2026-11-02"],
  ["Security review", "Meridian Legal", "Hannah Cole", "proposal", 14500, 50, "2026-12-18"],
  ["Enterprise renewal", "Brightwater Energy", "Tom Becker", "negotiation", 68000, 75, "2026-11-28"],
  ["Mobile app", "Alder & Finch", "Priya Shah", "negotiation", 31000, 75, "2026-12-12"],
  ["Route optimiser", "Bluepeak Logistics", "Dev Patel", "negotiation", 45500, 80, "2026-11-09"],
  ["Customer portal", "Meridian Legal", "Hannah Cole", "won", 29000, 100, "2026-11-12"],
  ["Inventory sync", "Kestrel Foods", "Liam Carter", "won", 21500, 100, "2026-11-04"],
  ["Brand refresh", "Copperline Studio", "Jonas Weber", "won", 12000, 100, "2026-10-22"],
  ["Telehealth module", "Northwind Clinics", "Grace Okafor", "lost", 26000, 0, "2026-11-06"],
  ["Solar monitoring", "Brightwater Energy", "Ivy Moreno", "lost", 18500, 0, "2026-10-30"],
].map(([name, org, contact, stage, value, prob, close]) => ({ name, org, contact, stage, value, prob, close }));

const MONTHS = ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
const REVENUE_WON = [38000, 24500, 41000, 52500, 36000, 61000, 48500, 57000, 44000, 72500, 66000, 50500];
const DEALS_WON = [3, 2, 3, 4, 3, 5, 4, 4, 3, 6, 5, 2];
const DEALS_LOST = [1, 2, 1, 1, 2, 1, 3, 1, 2, 1, 2, 1];

// Value of deals at each stage now or past it, New to Won (spec Concern 6).
const FUNNEL = [
  { name: "New", value: 1184000, count: 96 },
  { name: "Qualified", value: 905000, count: 71 },
  { name: "Proposal", value: 790000, count: 60 },
  { name: "Negotiation", value: 690000, count: 52 },
  { name: "Won", value: 0, count: 44 },
];
FUNNEL[4].value = REVENUE_WON.reduce((a, b) => a + b, 0);

const FOLLOW_UPS = [
  { due: "2026-11-09", label: "Send revised quote", who: "Route optimiser", type: "email", overdue: true },
  { due: "2026-11-12", label: "Call about budget sign-off", who: "Grace Okafor", type: "call", overdue: true },
  { due: "2026-11-14", label: "Chase signed proposal", who: "Retail rollout, phase 2", type: "email", overdue: true },
  { due: "2026-11-16", label: "Demo for the finance team", who: "Annual licence", type: "call", overdue: false },
  { due: "2026-11-18", label: "Share case study", who: "Hannah Cole", type: "email", overdue: false },
  { due: "2026-11-21", label: "Check in after trial", who: "Fleet tracking pilot", type: "call", overdue: false },
];

const RECENT = [
  { when: "Today, 10:42", text: "Moved from Proposal to Negotiation", what: "Enterprise renewal", type: "stage" },
  { when: "Today, 09:15", text: "Call: agreed pricing for 3 sites", what: "Tom Becker", type: "call" },
  { when: "Yesterday", text: "Moved from Negotiation to Won", what: "Customer portal", type: "stage" },
  { when: "Yesterday", text: "Email: sent onboarding pack", what: "Hannah Cole", type: "email" },
  { when: "13 Nov", text: "Note: wants a phased rollout", what: "Sara Novak", type: "note" },
  { when: "12 Nov", text: "Moved from Qualified to Proposal", what: "Security review", type: "stage" },
  { when: "12 Nov", text: "Call: intro with procurement", what: "Jonas Weber", type: "call" },
];

const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const shortMoney = (n) =>
  n >= 1e6 ? "$" + (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + n;
const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.getDate() + " " + d.toLocaleString("en-GB", { month: "short" }) + " " + d.getFullYear();
};
const shortDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.getDate() + " " + d.toLocaleString("en-GB", { month: "short" });
};
const isOpen = (d) => d.stage !== "won" && d.stage !== "lost";
const isLate = (d) => isOpen(d) && d.close < TODAY;
const expected = (d) => (d.value * d.prob) / 100;
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const dealsIn = (key) => DEALS.filter((d) => d.stage === key);
const OPEN = DEALS.filter(isOpen);

function niceMax(v) {
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / step) * step;
}

// Line chart with optional area fill. Returns an SVG string.
function lineChart({ values, labels, w, h, color = "var(--sea-green)", stroke = "var(--sea-green-text)", fill = true, pad = { l: 48, r: 12, t: 12, b: 26 }, grid = "var(--line)", text = "var(--ink-muted)" }) {
  const max = niceMax(Math.max(...values));
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const x = (i) => pad.l + (iw * i) / (values.length - 1);
  const y = (v) => pad.t + ih - (ih * v) / max;
  const pts = values.map((v, i) => [x(i), y(v)]);
  const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = path + ` L${x(values.length - 1)} ${pad.t + ih} L${pad.l} ${pad.t + ih} Z`;
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4, yy = y(v);
    g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${yy}" y2="${yy}" stroke="${grid}"/>`;
    g += `<text x="${pad.l - 8}" y="${yy + 4}" text-anchor="end" font-size="11" font-family="JetBrains Mono" fill="${text}">${shortMoney(v)}</text>`;
  }
  labels.forEach((l, i) => (g += `<text x="${x(i)}" y="${h - 6}" text-anchor="middle" font-size="11" fill="${text}">${l}</text>`));
  const id = "g" + Math.random().toString(36).slice(2, 7);
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${g}${fill ? `<path d="${area}" fill="url(#${id})"/>` : ""}
    <path d="${path}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#fff" stroke="${stroke}" stroke-width="2"/>`).join("")}
    <circle cx="${last[0]}" cy="${last[1]}" r="5" fill="${stroke}"/>
  </svg>`;
}

// Grouped bar chart. series: [{values, color}]
function barChart({ series, labels, w, h, pad = { l: 28, r: 8, t: 12, b: 26 }, grid = "var(--line)", text = "var(--ink-muted)", money: isMoney = false }) {
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const slot = iw / labels.length, bw = Math.min(14, (slot * 0.7) / series.length);
  const y = (v) => pad.t + ih - (ih * v) / max;
  let g = "";
  for (let i = 0; i <= 3; i++) {
    const v = (max * i) / 3, yy = y(v);
    g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${yy}" y2="${yy}" stroke="${grid}"/>`;
    g += `<text x="${pad.l - 6}" y="${yy + 4}" text-anchor="end" font-size="11" font-family="JetBrains Mono" fill="${text}">${isMoney ? shortMoney(v) : Math.round(v)}</text>`;
  }
  labels.forEach((l, i) => {
    const cx = pad.l + slot * i + slot / 2;
    g += `<text x="${cx}" y="${h - 6}" text-anchor="middle" font-size="11" fill="${text}">${l}</text>`;
    series.forEach((s, j) => {
      const bx = cx - (bw * series.length + 2 * (series.length - 1)) / 2 + j * (bw + 2);
      const v = s.values[i], top = y(v);
      g += `<rect x="${bx}" y="${top}" width="${bw}" height="${pad.t + ih - top}" rx="3" fill="${s.color}"/>`;
    });
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">${g}</svg>`;
}

const ICONS = {
  call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  stage: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  pipe: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  deal: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  contact: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  org: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
};
const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const NAV = [
  ["dash", "Dashboard"],
  ["pipe", "Pipeline"],
  ["deal", "Deals"],
  ["contact", "Contacts"],
  ["org", "Organizations"],
];
