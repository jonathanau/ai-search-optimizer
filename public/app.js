const form = document.querySelector("#audit-form");
const input = document.querySelector("#url");
const statusPanel = document.querySelector("#status");
const reportEl = document.querySelector("#report");
const checkTemplate = document.querySelector("#check-template");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAudit(input.value);
});

async function runAudit(url) {
  setLoading(true, `Analyzing ${url}… Collecting HTML, robots.txt, llms.txt, and sitemap intelligence.`);
  reportEl.classList.add("hidden");

  try {
    const response = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "AI readiness analysis failed.");
    renderReport(payload);
    setLoading(false, "AI readiness analysis complete.");
    setTimeout(() => statusPanel.classList.add("hidden"), 1800);
  } catch (error) {
    setLoading(false, error.message, true);
  }
}

function setLoading(isLoading, message, isError = false) {
  form.querySelector("button[type='submit']").disabled = isLoading;
  statusPanel.textContent = message;
  statusPanel.classList.remove("hidden");
  statusPanel.style.background = isError ? "#7f1d1d" : "#111827";
}

function renderReport(report) {
  reportEl.innerHTML = "";
  reportEl.classList.remove("hidden");

  reportEl.append(scoreHero(report));
  reportEl.append(factsPanel(report));
  reportEl.append(actionsPanel(report));
  reportEl.append(sectionsPanel(report));
  reportEl.append(promptsPanel(report));
  reportEl.append(benchmarkPanel(report));
}

function scoreHero(report) {
  const panel = el("section", "panel score-hero");
  panel.innerHTML = `
    <div class="score-circle" style="--score:${report.score.overall}%">
      <strong>${report.score.overall}</strong><span>/100</span>
    </div>
    <div class="score-copy">
      <p class="eyebrow">${escapeHtml(report.score.grade)} · ${escapeHtml(report.score.status)}</p>
      <h2>${escapeHtml(report.summary.verdict)}</h2>
      <p>${escapeHtml(report.summary.oneSentence)}</p>
      <div class="meta-row">
        ${Object.entries(report.score.sections).map(([name, score]) => `<span>${escapeHtml(name)} ${score}</span>`).join("")}
      </div>
    </div>
  `;
  return panel;
}

function factsPanel(report) {
  const facts = [
    ["Analyzed URL", report.url],
    ["Brand", report.pageFacts.brand],
    ["Visible content depth", report.pageFacts.visibleWords],
    ["Schema types", report.pageFacts.schemaTypes.join(", ") || "None"],
    ["Authority signals", report.pageFacts.authoritativeLinks],
    ["robots.txt", report.pageFacts.robotsPresent ? "Present" : "Missing"],
    ["llms.txt", report.pageFacts.llmsTxtPresent ? "Present" : "Missing"],
    ["Sitemap", report.pageFacts.sitemapPresent ? "Present" : "Missing"],
  ];
  const panel = el("section", "panel");
  panel.innerHTML = `<h3>Intelligence snapshot</h3><div class="fact-grid">${facts.map(([label, value]) => `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value ?? "—"))}</strong></div>`).join("")}</div>`;
  return panel;
}

function actionsPanel(report) {
  const panel = el("section", "panel");
  panel.innerHTML = `<h3>Prioritized AI visibility roadmap</h3>`;
  const grid = el("div", "actions-grid");
  if (!report.prioritizedActions.length) {
    grid.innerHTML = `<p>No critical gaps surfaced. Continue monitoring AI visibility, citations, and entity signals as models evolve.</p>`;
  } else {
    for (const action of report.prioritizedActions.slice(0, 9)) {
      const card = el("article", "action-card");
      card.innerHTML = `
        <div class="meta-row"><span>#${action.priority}</span><span>${escapeHtml(action.impact)} impact</span><span>${escapeHtml(action.effort)} effort</span><span>${escapeHtml(action.status)}</span></div>
        <h4>${escapeHtml(action.title)}</h4>
        <p><strong>${escapeHtml(action.section)}:</strong> ${escapeHtml(action.evidence)}</p>
        <ol>${action.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      `;
      grid.append(card);
    }
  }
  panel.append(grid);
  return panel;
}

function sectionsPanel(report) {
  const panel = el("section", "panel");
  panel.innerHTML = `<h3>Readiness diagnostics</h3>`;
  const grid = el("div", "section-grid");
  for (const section of Object.values(report.sections)) {
    const card = el("article", "section-card");
    card.innerHTML = `
      <header>
        <div><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.summary)}</p></div>
        <div class="section-score">${section.score}</div>
      </header>
    `;
    const checks = el("div", "checks");
    for (const check of section.checks) checks.append(checkNode(check));
    card.append(checks);
    grid.append(card);
  }
  panel.append(grid);
  return panel;
}

function checkNode(check) {
  const fragment = checkTemplate.content.cloneNode(true);
  fragment.querySelector(".pill").className = `pill ${check.status}`;
  fragment.querySelector(".pill").textContent = check.status;
  fragment.querySelector("h4").textContent = check.label;
  fragment.querySelector(".evidence").textContent = check.evidence;
  fragment.querySelector(".why").textContent = check.whyItMatters;
  fragment.querySelector(".recommendation").textContent = check.recommendation;
  return fragment;
}

function promptsPanel(report) {
  const panel = el("section", "panel");
  panel.innerHTML = `<h3>Frontier prompt portfolio to monitor</h3>`;
  const grid = el("div", "prompt-grid");
  for (const prompt of report.promptPortfolio) {
    const card = el("article", "prompt-card");
    card.innerHTML = `<h4>${escapeHtml(prompt.intent)}</h4><p>${escapeHtml(prompt.prompt)}</p><div class="meta-row">${prompt.successSignals.map((signal) => `<span>${escapeHtml(signal)}</span>`).join("")}</div>`;
    grid.append(card);
  }
  panel.append(grid);
  return panel;
}

function benchmarkPanel(report) {
  const panel = el("section", "panel");
  panel.innerHTML = `<h3>AI search platform benchmark</h3>`;
  const grid = el("div", "benchmark-grid");
  for (const item of report.marketBenchmark.incumbentPatterns) {
    const card = el("article", "prompt-card");
    card.innerHTML = `<h4>${escapeHtml(item.capability)}</h4><p><strong>Market signal:</strong> ${escapeHtml(item.seenIn.join(", "))}</p><p>${escapeHtml(item.howThisToolResponds)}</p>`;
    grid.append(card);
  }
  panel.append(grid);
  return panel;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}