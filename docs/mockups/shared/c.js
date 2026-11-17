// Mockup C: slim icon rail.
function renderNav(active) {
  const short = { Organizations: "Orgs" };
  document.getElementById("nav").innerHTML = `
    <div class="mark">a</div>
    ${NAV.map(([ic, l]) => `<a class="${l === active ? "on" : ""}" href="${l === "Pipeline" ? "c-pipeline.html" : l === "Dashboard" ? "c-dashboard.html" : "#"}">${icon(ic, 20)}${short[l] || l}</a>`).join("")}
    <div class="avatar">JR</div>`;
}
