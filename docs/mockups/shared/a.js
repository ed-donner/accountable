// Mockup A: Midnight sidebar.
function renderNav(active, prefix = "a") {
  document.getElementById("nav").innerHTML = `
    <div class="brand"><span class="mark">A</span>Accountable</div>
    <nav>${NAV.map(([ic, l]) => `<a class="${l === active ? "on" : ""}" href="${l === "Pipeline" ? `${prefix}-pipeline.html` : l === "Dashboard" ? `${prefix}-dashboard.html` : "#"}">${icon(ic)}${l}</a>`).join("")}</nav>
    <div class="nav-foot"><div class="avatar">JR</div><div><div>Jo Reyes</div><div class="sub">Sales</div></div></div>`;
}
