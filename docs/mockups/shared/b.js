// Mockup B: white top navigation.
function renderNav(active) {
  document.getElementById("nav").innerHTML = `
    <div class="top-inner">
      <div class="brand"><span class="mark">A</span>Accountable</div>
      <nav>${NAV.map(([, l]) => `<a class="${l === active ? "on" : ""}" href="${l === "Pipeline" ? "b-pipeline.html" : l === "Dashboard" ? "b-dashboard.html" : "#"}">${l}</a>`).join("")}</nav>
      <div class="right"><div class="search">${icon("search", 16)}Search everything</div><button class="btn">${icon("plus", 16)}New</button><div class="avatar">JR</div></div>
    </div>`;
}
// Text on the darker stage colors is white, on the lighter ones Midnight.
const darkStage = (key) => ["proposal", "negotiation", "lost"].includes(key);
