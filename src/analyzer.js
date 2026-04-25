const DEFAULT_TIMEOUT_MS = 12_000;

export const RETRIEVAL_CRAWLERS = [
  { agent: "OAI-SearchBot", provider: "OpenAI", priority: "primary" },
  { agent: "Claude-SearchBot", provider: "Anthropic", priority: "primary" },
  { agent: "PerplexityBot", provider: "Perplexity", priority: "primary" },
  { agent: "Googlebot", provider: "Google AI Overviews / AI Mode", priority: "search" },
  { agent: "bingbot", provider: "Microsoft Copilot / Bing", priority: "search" },
];

export const TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "anthropic-ai",
];

export const ON_DEMAND_CRAWLERS = ["ChatGPT-User", "Claude-User", "Perplexity-User"];

const SECTION_WEIGHTS = {
  access: 0.22,
  content: 0.26,
  structure: 0.18,
  technical: 0.16,
  authority: 0.12,
  standards: 0.06,
};

const AUTHORITY_DOMAIN_PATTERNS = [
  /(^|\.)gov$/i,
  /(^|\.)edu$/i,
  /(^|\.)wikipedia\.org$/i,
  /(^|\.)wikidata\.org$/i,
  /(^|\.)ietf\.org$/i,
  /(^|\.)datatracker\.ietf\.org$/i,
  /(^|\.)acm\.org$/i,
  /(^|\.)ieee\.org$/i,
  /(^|\.)nature\.com$/i,
  /(^|\.)science\.org$/i,
  /(^|\.)gartner\.com$/i,
  /(^|\.)forrester\.com$/i,
  /(^|\.)pewresearch\.org$/i,
  /(^|\.)worldbank\.org$/i,
  /(^|\.)oecd\.org$/i,
  /(^|\.)who\.int$/i,
  /(^|\.)schema\.org$/i,
  /(^|\.)cloudflare\.com$/i,
  /(^|\.)openai\.com$/i,
  /(^|\.)anthropic\.com$/i,
  /(^|\.)google\.com$/i,
  /(^|\.)ahrefs\.com$/i,
  /(^|\.)semrush\.com$/i,
  /(^|\.)statista\.com$/i,
];

const SOCIAL_OR_ENTITY_PATTERNS = [
  /(^|\.)linkedin\.com$/i,
  /(^|\.)crunchbase\.com$/i,
  /(^|\.)wikidata\.org$/i,
  /(^|\.)wikipedia\.org$/i,
  /(^|\.)github\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)reddit\.com$/i,
];

export function normalizeAuditUrl(input) {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("Enter a website URL to audit.");
  }

  let raw = input.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) {
    throw new Error("Website URL must use http or https.");
  }

  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Enter a valid website URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Website URL must use http or https.");
  }

  parsed.hash = "";
  return parsed;
}

export function parseRobotsTxt(source = "") {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let sawDirective = false;

  const pushCurrent = () => {
    if (current && (current.userAgents.length > 0 || current.rules.length > 0)) {
      groups.push(current);
    }
    current = null;
    sawDirective = false;
  };

  for (const rawLine of String(source).split(/\r?\n/)) {
    const withoutComment = rawLine.replace(/(^|\s)#.*$/, "").trim();
    if (!withoutComment) {
      if (sawDirective) pushCurrent();
      continue;
    }

    const match = withoutComment.match(/^([a-z][a-z-]*)\s*:\s*(.*)$/i);
    if (!match) continue;

    const key = match[1].toLowerCase();
    const value = match[2].trim();

    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }

    if (key === "user-agent") {
      if (!current || sawDirective) {
        if (current) pushCurrent();
        current = { userAgents: [], rules: [] };
      }
      if (value) current.userAgents.push(value.toLowerCase());
      continue;
    }

    if (["allow", "disallow"].includes(key)) {
      if (!current) current = { userAgents: ["*"], rules: [] };
      current.rules.push({ directive: key, path: value });
      sawDirective = true;
    }
  }

  pushCurrent();
  return { groups, sitemaps };
}

export function assessCrawlerAccess(robots, userAgent, path = "/") {
  const parsed = typeof robots === "string" ? parseRobotsTxt(robots) : robots;
  const normalizedPath = path && path.startsWith("/") ? path : `/${path || ""}`;

  if (!parsed || !Array.isArray(parsed.groups) || parsed.groups.length === 0) {
    return {
      allowed: true,
      userAgent,
      matchedAgent: null,
      matchedRule: null,
      reason: "No robots.txt rules were found for this crawler.",
    };
  }

  const ua = String(userAgent).toLowerCase();
  const matchingGroups = [];
  let bestSpecificity = -1;

  for (const group of parsed.groups) {
    for (const token of group.userAgents) {
      const normalizedToken = String(token).toLowerCase();
      const matches = normalizedToken === "*" || ua.includes(normalizedToken) || normalizedToken.includes(ua);
      if (!matches) continue;
      const specificity = normalizedToken === "*" ? 1 : normalizedToken.length;
      if (specificity > bestSpecificity) {
        matchingGroups.length = 0;
        bestSpecificity = specificity;
      }
      if (specificity === bestSpecificity) matchingGroups.push({ group, token: normalizedToken });
    }
  }

  if (matchingGroups.length === 0) {
    return {
      allowed: true,
      userAgent,
      matchedAgent: null,
      matchedRule: null,
      reason: "No matching robots.txt group applies to this crawler.",
    };
  }

  const matchingRules = matchingGroups
    .flatMap(({ group, token }) => group.rules.map((rule) => ({ ...rule, token })))
    .filter((rule) => rule.path !== "" && robotsPathMatches(rule.path, normalizedPath))
    .sort((a, b) => {
      const lengthDelta = robotsRuleLength(b.path) - robotsRuleLength(a.path);
      if (lengthDelta !== 0) return lengthDelta;
      if (a.directive === b.directive) return 0;
      return a.directive === "allow" ? -1 : 1;
    });

  if (matchingRules.length === 0) {
    return {
      allowed: true,
      userAgent,
      matchedAgent: matchingGroups[0].token,
      matchedRule: null,
      reason: "The matching robots.txt group has no rule for this URL path.",
    };
  }

  const winner = matchingRules[0];
  return {
    allowed: winner.directive === "allow",
    userAgent,
    matchedAgent: winner.token,
    matchedRule: { directive: winner.directive, path: winner.path },
    reason: `${winner.directive.toUpperCase()} ${winner.path} matched ${normalizedPath}`,
  };
}

export async function auditWebsite(inputUrl, options = {}) {
  const target = normalizeAuditUrl(inputUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const robotsUrl = new URL("/robots.txt", target.origin).href;
  const llmsUrl = new URL("/llms.txt", target.origin).href;

  const [page, robotsFetch, llmsFetch] = await Promise.all([
    fetchText(target.href, { timeoutMs, accept: "text/html,application/xhtml+xml" }),
    fetchOptionalText(robotsUrl, { timeoutMs: Math.min(timeoutMs, 6_000), accept: "text/plain,*/*" }),
    fetchOptionalText(llmsUrl, { timeoutMs: Math.min(timeoutMs, 6_000), accept: "text/markdown,text/plain,*/*" }),
  ]);

  if (!page.ok) {
    throw new Error(`The page returned HTTP ${page.status}. Audit a publicly reachable HTML page.`);
  }

  const robots = robotsFetch.ok ? parseRobotsTxt(robotsFetch.text) : parseRobotsTxt("");
  const sitemapCandidates = robots.sitemaps.length > 0 ? robots.sitemaps : [new URL("/sitemap.xml", target.origin).href];
  const sitemapFetch = await fetchOptionalText(sitemapCandidates[0], {
    timeoutMs: Math.min(timeoutMs, 6_000),
    accept: "application/xml,text/xml,*/*",
  });

  return auditArtifacts({
    url: page.finalUrl || target.href,
    html: page.text,
    headers: page.headers,
    httpStatus: page.status,
    robotsTxt: robotsFetch.ok ? robotsFetch.text : null,
    llmsTxt: llmsFetch.ok ? llmsFetch.text : null,
    sitemapXml: sitemapFetch.ok ? sitemapFetch.text : null,
    timings: {
      htmlMs: page.ms,
      robotsMs: robotsFetch.ms,
      llmsMs: llmsFetch.ms,
      sitemapMs: sitemapFetch.ms,
    },
  });
}

export function auditArtifacts({
  url,
  html = "",
  headers = {},
  httpStatus = 200,
  robotsTxt = null,
  llmsTxt = null,
  sitemapXml = null,
  timings = {},
}) {
  const target = normalizeAuditUrl(url);
  const headerMap = normalizeHeaders(headers);
  const parsedHtml = parseHtml(html, target);
  const robots = parseRobotsTxt(robotsTxt || "");
  const brand = inferBrand(parsedHtml, target);
  const category = inferCategory(parsedHtml, brand);
  const path = target.pathname || "/";

  const crawlerAccess = {
    retrieval: RETRIEVAL_CRAWLERS.map((crawler) => ({
      ...crawler,
      ...assessCrawlerAccess(robots, crawler.agent, path),
    })),
    training: TRAINING_CRAWLERS.map((agent) => ({ agent, ...assessCrawlerAccess(robots, agent, path) })),
    onDemand: ON_DEMAND_CRAWLERS.map((agent) => ({ agent, ...assessCrawlerAccess(robots, agent, path) })),
  };

  const pageFacts = buildPageFacts({ target, headerMap, parsedHtml, robots, robotsTxt, llmsTxt, sitemapXml, timings, httpStatus, brand, category });
  const sections = buildSections({ target, headerMap, parsedHtml, robots, robotsTxt, llmsTxt, sitemapXml, timings, crawlerAccess, pageFacts });
  const score = scoreReport(sections);
  const prioritizedActions = buildPrioritizedActions(sections);

  return {
    url: target.href,
    fetchedAt: new Date().toISOString(),
    score,
    summary: buildSummary(score, sections, prioritizedActions, pageFacts),
    sections,
    prioritizedActions,
    promptPortfolio: generatePromptPortfolio({ brand, category, target, parsedHtml }),
    crawlerAccess,
    pageFacts,
    marketBenchmark: buildMarketBenchmark(),
    researchBasis: [
      "Answer-first passages improve extractability for ChatGPT, Perplexity, Gemini, Claude, Copilot, and Google AI Overview style systems.",
      "Verifiable statistics and authoritative outbound citations receive elevated weighting because GEO research repeatedly finds numeric claims are disproportionately extracted.",
      "The audit separates retrieval crawlers from training crawlers so publishers can optimize citations without giving up separate training-use controls.",
    ],
  };
}

function buildSections(context) {
  const access = buildAccessSection(context);
  const technical = buildTechnicalSection(context);
  const structure = buildStructureSection(context);
  const content = buildContentSection(context);
  const authority = buildAuthoritySection(context);
  const standards = buildStandardsSection(context);

  return {
    access,
    content,
    structure,
    technical,
    authority,
    standards,
  };
}

function buildAccessSection({ robots, robotsTxt, sitemapXml, crawlerAccess }) {
  const retrievalBlocked = crawlerAccess.retrieval.filter((entry) => !entry.allowed);
  const onDemandBlocked = crawlerAccess.onDemand.filter((entry) => !entry.allowed);
  const explicitTrainingRules = robots.groups.some((group) =>
    group.userAgents.some((agent) => TRAINING_CRAWLERS.map((crawler) => crawler.toLowerCase()).includes(agent)),
  );

  const checks = [
    makeCheck({
      id: "robots-file",
      label: "Robots policy is reachable and parseable",
      status: robotsTxt ? "pass" : "warn",
      weight: 5,
      impact: "Medium",
      effort: "Low",
      evidence: robotsTxt ? `${robots.groups.length} robots.txt group(s) parsed.` : "No robots.txt was provided or it returned a non-200 response.",
      whyItMatters: "Robots.txt is still the only universally honored control surface for AI crawler access.",
      recommendation: "Publish a clear robots.txt that explicitly separates AI retrieval crawlers from training crawlers.",
      nextSteps: ["Add robots.txt at the site root.", "Document retrieval crawler access separately from training crawler preferences."],
    }),
    makeCheck({
      id: "retrieval-crawlers",
      label: "AI retrieval and citation crawlers can access this URL",
      status: retrievalBlocked.length === 0 ? "pass" : "fail",
      weight: 14,
      impact: "High",
      effort: "Low",
      evidence:
        retrievalBlocked.length === 0
          ? `Allowed: ${crawlerAccess.retrieval.map((entry) => entry.agent).join(", ")}.`
          : `Blocked: ${retrievalBlocked.map((entry) => `${entry.agent} (${entry.reason})`).join("; ")}.`,
      whyItMatters: "Blocking OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot, or bingbot can remove pages from AI answers and citations.",
      recommendation: "Allow AI retrieval crawlers that power cited answers while making any training opt-outs separately.",
      actionTitle: "Allow AI retrieval crawlers in robots.txt",
      nextSteps: [
        "Add Allow rules for OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot, and bingbot on public content.",
        "Retest important URL paths after publishing robots.txt changes.",
      ],
    }),
    makeCheck({
      id: "on-demand-crawlers",
      label: "On-demand assistant fetchers are not blocked",
      status: onDemandBlocked.length === 0 ? "pass" : "fail",
      weight: 4,
      impact: "Medium",
      effort: "Low",
      evidence:
        onDemandBlocked.length === 0
          ? `Allowed: ${crawlerAccess.onDemand.map((entry) => entry.agent).join(", ")}.`
          : `Blocked: ${onDemandBlocked.map((entry) => entry.agent).join(", ")}.`,
      whyItMatters: "Assistants use on-demand fetchers when users paste a URL or ask for a page summary.",
      recommendation: "Do not block ChatGPT-User, Claude-User, or Perplexity-User unless the content is intentionally private.",
    }),
    makeCheck({
      id: "training-policy",
      label: "Training crawler preference is explicit",
      status: explicitTrainingRules ? "pass" : "warn",
      weight: 2,
      impact: "Low",
      effort: "Low",
      evidence: explicitTrainingRules ? "Training-oriented AI user agents have explicit rules." : "No explicit GPTBot / ClaudeBot / Google-Extended style rules were detected.",
      whyItMatters: "Training use and retrieval visibility are different business decisions; conflating them can accidentally suppress citations.",
      recommendation: "Add explicit allow/block rules for training crawlers after deciding your content licensing policy.",
    }),
    makeCheck({
      id: "sitemap-discovery",
      label: "Sitemap is discoverable",
      status: robots.sitemaps.length > 0 || sitemapXml ? "pass" : "fail",
      weight: 5,
      impact: "Medium",
      effort: "Low",
      evidence: robots.sitemaps.length > 0 ? `robots.txt lists ${robots.sitemaps[0]}.` : sitemapXml ? "A sitemap.xml response was available." : "No sitemap reference or sitemap.xml content was detected.",
      whyItMatters: "Sitemaps help search and AI retrieval systems discover authoritative pages beyond the homepage.",
      recommendation: "Publish an XML sitemap and list it in robots.txt.",
    }),
  ];

  return makeSection("access", "Crawler access & indexability", checks, "Can AI answer engines fetch and cite the page?");
}

function buildTechnicalSection({ headerMap, parsedHtml, timings }) {
  const contentType = headerMap["content-type"] || "";
  const htmlMs = Number(timings.htmlMs || 0);
  const scriptToTextRisk = parsedHtml.visibleWordCount < 80 && parsedHtml.scriptChars > parsedHtml.visibleText.length * 3;
  const appShellRisk = parsedHtml.visibleWordCount < 80 && /id=["'](?:root|app|__next|__nuxt)["']/i.test(parsedHtml.bodyHtml);
  const serverRenderedStatus = parsedHtml.visibleWordCount >= 100 && !scriptToTextRisk ? "pass" : parsedHtml.visibleWordCount >= 60 && !appShellRisk ? "warn" : "fail";

  const checks = [
    makeCheck({
      id: "content-type-html",
      label: "Response is HTML",
      status: !contentType || /html|xhtml/i.test(contentType) ? "pass" : "warn",
      weight: 3,
      impact: "Medium",
      effort: "Low",
      evidence: contentType ? `Content-Type: ${contentType}` : "No Content-Type header was supplied to the analyzer.",
      whyItMatters: "Retrieval systems need stable HTML text; PDFs and client bundles are harder to cite reliably.",
      recommendation: "Serve canonical content as text/html for public marketing and documentation pages.",
    }),
    makeCheck({
      id: "server-rendered-content",
      label: "Key content is server-rendered and visible without JavaScript",
      status: serverRenderedStatus,
      weight: 12,
      impact: "High",
      effort: "Medium",
      evidence: `${parsedHtml.visibleWordCount} visible word(s), ${parsedHtml.scriptChars.toLocaleString()} script character(s).`,
      whyItMatters: "Most AI crawlers execute limited JavaScript. App-shell pages often look blank to retrieval indexes.",
      recommendation: "Server-render the main answer, product description, statistics, FAQs, and citations in the initial HTML.",
      actionTitle: "Server-render citation-worthy content",
      nextSteps: [
        "Move the primary answer and supporting sections into the HTML response before hydration.",
        "Verify with curl or View Source that the page text appears without running JavaScript.",
      ],
    }),
    makeCheck({
      id: "fast-html",
      label: "HTML response is fast enough for crawlers",
      status: htmlMs === 0 ? "warn" : htmlMs < 1_500 ? "pass" : htmlMs < 3_000 ? "warn" : "fail",
      weight: 5,
      impact: "Medium",
      effort: "Medium",
      evidence: htmlMs ? `HTML fetched in ${Math.round(htmlMs)} ms.` : "No timing measurement supplied.",
      whyItMatters: "Slow origin responses reduce crawl depth and can cause AI retrieval jobs to abandon pages.",
      recommendation: "Cache HTML at the edge and keep time-to-first-byte below 1.5 seconds for important pages.",
    }),
    makeCheck({
      id: "canonical-url",
      label: "Canonical URL is declared",
      status: parsedHtml.canonical ? "pass" : "fail",
      weight: 3,
      impact: "Medium",
      effort: "Low",
      evidence: parsedHtml.canonical || "No rel=canonical tag found.",
      whyItMatters: "Canonical tags consolidate entity signals and reduce duplicate-source confusion in retrieval indexes.",
      recommendation: "Add a self-referencing canonical URL to every indexable page.",
    }),
    makeCheck({
      id: "language",
      label: "Document language is declared",
      status: parsedHtml.lang ? "pass" : "warn",
      weight: 2,
      impact: "Low",
      effort: "Low",
      evidence: parsedHtml.lang ? `html lang=${parsedHtml.lang}` : "No html lang attribute found.",
      whyItMatters: "Language metadata helps multilingual AI systems route and interpret content accurately.",
      recommendation: "Set the html lang attribute, for example <html lang=\"en\">.",
    }),
    makeCheck({
      id: "mobile-viewport",
      label: "Mobile viewport is configured",
      status: parsedHtml.meta.viewport ? "pass" : "warn",
      weight: 1,
      impact: "Low",
      effort: "Low",
      evidence: parsedHtml.meta.viewport || "No viewport meta tag found.",
      whyItMatters: "Google AI surfaces inherit many quality signals from standard search crawling and rendering.",
      recommendation: "Add a responsive viewport meta tag.",
    }),
  ];

  return makeSection("technical", "Technical crawlability", checks, "Is the page fast, stable, and readable without JavaScript?");
}

function buildStructureSection({ parsedHtml }) {
  const usefulSchemaTypes = ["Organization", "Product", "Article", "FAQPage", "HowTo", "Person", "BreadcrumbList", "SoftwareApplication", "WebPage"];
  const hasUsefulSchema = parsedHtml.schemaTypes.some((type) => usefulSchemaTypes.includes(type));
  const hasEntitySchema = parsedHtml.schemaObjects.some((object) => {
    const types = toArray(object["@type"]);
    return types.some((type) => ["Organization", "Product", "SoftwareApplication", "Person"].includes(type)) && (object.name || object.url || object.sameAs);
  });
  const h1Count = parsedHtml.headings.filter((heading) => heading.level === 1).length;
  const h2Count = parsedHtml.headings.filter((heading) => heading.level === 2).length;
  const titleLength = parsedHtml.title.length;
  const descriptionLength = parsedHtml.meta.description.length;

  const checks = [
    makeCheck({
      id: "structured-data",
      label: "Schema.org JSON-LD defines page entities",
      status: hasUsefulSchema ? "pass" : parsedHtml.jsonLdBlocks.length > 0 ? "warn" : "fail",
      weight: 12,
      impact: "High",
      effort: "Medium",
      evidence: parsedHtml.schemaTypes.length ? `Detected schema types: ${parsedHtml.schemaTypes.join(", ")}.` : "No JSON-LD schema types detected.",
      whyItMatters: "Structured data reduces entity ambiguity for AI answer engines and Google AI Overviews.",
      recommendation: "Add JSON-LD for Organization, Article/WebPage, Product/SoftwareApplication, FAQPage, and Person where relevant.",
    }),
    makeCheck({
      id: "entity-schema",
      label: "Primary entity is machine-readable",
      status: hasEntitySchema ? "pass" : "warn",
      weight: 6,
      impact: "High",
      effort: "Medium",
      evidence: hasEntitySchema ? "A primary Organization/Product/Person-style entity includes name, URL, or sameAs." : "No primary entity schema with durable identifiers was found.",
      whyItMatters: "AI systems cite and recommend entities, not just pages; entity clarity is central to GEO.",
      recommendation: "Mark up the brand, product, author, and sameAs profiles with stable identifiers.",
    }),
    makeCheck({
      id: "title-description",
      label: "Title and meta description are descriptive",
      status: titleLength >= 15 && descriptionLength >= 50 ? "pass" : titleLength >= 10 || descriptionLength >= 30 ? "warn" : "fail",
      weight: 5,
      impact: "Medium",
      effort: "Low",
      evidence: `Title length: ${titleLength}; description length: ${descriptionLength}.`,
      whyItMatters: "AI retrieval snippets still use classic page summaries when deciding source relevance.",
      recommendation: "Write a specific title and meta description that state the entity, category, audience, and outcome.",
    }),
    makeCheck({
      id: "heading-hierarchy",
      label: "Headings create extractable answer sections",
      status: h1Count === 1 && h2Count >= 1 ? "pass" : h1Count >= 1 ? "warn" : "fail",
      weight: 6,
      impact: "High",
      effort: "Low",
      evidence: `${h1Count} H1 heading(s), ${h2Count} H2 heading(s), ${parsedHtml.headings.length} total heading(s).`,
      whyItMatters: "Clear H2/H3 scopes help AI systems extract self-contained passages and cite the right section.",
      recommendation: "Use one H1, descriptive H2s for each user question, and H3s for supporting details.",
    }),
    makeCheck({
      id: "social-preview",
      label: "Open Graph / social metadata supports consistent entity wording",
      status: parsedHtml.meta.ogTitle || parsedHtml.meta.ogDescription ? "pass" : "warn",
      weight: 2,
      impact: "Low",
      effort: "Low",
      evidence: parsedHtml.meta.ogTitle || parsedHtml.meta.ogDescription ? "Open Graph metadata detected." : "No Open Graph title or description detected.",
      whyItMatters: "Consistent summaries across surfaces reinforce brand/entity disambiguation.",
      recommendation: "Add og:title and og:description that match the canonical positioning.",
    }),
  ];

  return makeSection("structure", "Structured data & entity clarity", checks, "Can machines identify what the page, brand, and content mean?");
}

function buildContentSection({ parsedHtml }) {
  const firstParagraph = parsedHtml.paragraphs.find((paragraph) => wordCount(paragraph.text) >= 5);
  const firstParagraphWords = firstParagraph ? wordCount(firstParagraph.text) : 0;
  const answerFirst = Boolean(firstParagraph && firstParagraphWords <= 85 && /\b(is|are|means|refers to|helps|provides|enables|lets|allows|defined as)\b/i.test(firstParagraph.text));
  const statisticStatus = parsedHtml.numericClaims.length >= 2 && parsedHtml.authoritativeLinks.length >= 1 ? "pass" : parsedHtml.numericClaims.length >= 1 ? "warn" : "fail";
  const paragraphWordCounts = parsedHtml.paragraphs.map((paragraph) => wordCount(paragraph.text)).filter(Boolean);
  const medianParagraphWords = median(paragraphWordCounts);
  const questionCount = (parsedHtml.visibleText.match(/\?/g) || []).length;
  const hasFaq = parsedHtml.schemaTypes.includes("FAQPage") || /\bfaq\b|frequently asked/i.test(parsedHtml.visibleText) || questionCount >= 2;
  const expertSignals = /\b(according to|study|research|report|source|cited|data|benchmark|analysis|survey|published|journal|paper)\b/i.test(parsedHtml.visibleText);
  const originalDataSignals = /\b(our survey|we surveyed|we analyzed|proprietary|original data|benchmark dataset|internal data|sample of \d|based on \d|we studied)\b/i.test(parsedHtml.visibleText);
  const freshnessYears = parsedHtml.numericClaims.filter((claim) => /\b20\d{2}\b/.test(claim)).map((claim) => Number(claim.match(/20\d{2}/)?.[0])).filter(Boolean);
  const currentYear = new Date().getFullYear();
  const hasFreshDate = freshnessYears.some((year) => year >= currentYear - 3 && year <= currentYear + 1);

  const checks = [
    makeCheck({
      id: "answer-first",
      label: "The page leads with a direct answer",
      status: answerFirst ? "pass" : firstParagraph ? "warn" : "fail",
      weight: 12,
      impact: "High",
      effort: "Medium",
      evidence: firstParagraph ? truncate(firstParagraph.text, 220) : "No meaningful paragraph was found in the initial HTML.",
      whyItMatters: "AI systems often extract the first concise passage that directly answers the query.",
      recommendation: "Put a 40-80 word answer-summary in the first visible paragraph of the page and each major section.",
      actionTitle: "Lead with an answer-first summary",
      nextSteps: [
        "Open with '[Entity] is/helps/provides...' in plain language.",
        "Follow with proof, citations, and implementation details after the direct answer.",
      ],
    }),
    makeCheck({
      id: "statistics-with-sources",
      label: "Verifiable statistics are paired with sources",
      status: statisticStatus,
      weight: 10,
      impact: "High",
      effort: "Medium",
      evidence: `${parsedHtml.numericClaims.length} numeric claim(s), ${parsedHtml.authoritativeLinks.length} authoritative external source link(s).`,
      whyItMatters: "GEO research shows numeric claims with citations are among the most reliably extracted answer ingredients.",
      recommendation: "Add dated statistics, percentages, benchmarks, sample sizes, and source links near the relevant claim.",
    }),
    makeCheck({
      id: "authoritative-citations",
      label: "Claims link to authoritative sources",
      status: parsedHtml.authoritativeLinks.length >= 2 ? "pass" : parsedHtml.externalLinks.length >= 1 ? "warn" : "fail",
      weight: 7,
      impact: "High",
      effort: "Medium",
      evidence: parsedHtml.authoritativeLinks.length
        ? `Authoritative domains: ${unique(parsedHtml.authoritativeLinks.map((link) => link.hostname)).slice(0, 5).join(", ")}.`
        : "No authoritative outbound citations detected.",
      whyItMatters: "Citing trusted sources helps answer engines trust your own synthesis and identify primary evidence.",
      recommendation: "Reference original studies, standards, documentation, government data, or recognized industry research.",
    }),
    makeCheck({
      id: "extractable-paragraphs",
      label: "Paragraphs are short and self-contained",
      status: medianParagraphWords > 0 && medianParagraphWords <= 85 && parsedHtml.visibleWordCount >= 100 ? "pass" : parsedHtml.visibleWordCount >= 60 ? "warn" : "fail",
      weight: 5,
      impact: "Medium",
      effort: "Low",
      evidence: `${parsedHtml.visibleWordCount} visible word(s); median paragraph length ${Math.round(medianParagraphWords)} word(s).`,
      whyItMatters: "Retrieval systems chunk pages; concise paragraphs are easier to quote and cite without surrounding noise.",
      recommendation: "Keep most paragraphs under 80 words and make each one understandable without reading the whole page.",
    }),
    makeCheck({
      id: "faq-coverage",
      label: "FAQ or question-answer coverage exists",
      status: hasFaq ? "pass" : "warn",
      weight: 4,
      impact: "Medium",
      effort: "Low",
      evidence: hasFaq ? "FAQ/question signals detected." : "No FAQPage schema, FAQ heading, or repeated question-answer structure detected.",
      whyItMatters: "AEO/GEO systems are prompt-shaped; explicit Q&A sections map directly to user questions.",
      recommendation: "Add 4-8 concise FAQs that match high-intent prompts and mark them up with FAQPage where appropriate.",
    }),
    makeCheck({
      id: "expert-tone",
      label: "Expert tone and evidence language are present",
      status: expertSignals && parsedHtml.externalLinks.length > 0 ? "pass" : expertSignals || parsedHtml.externalLinks.length > 0 ? "warn" : "fail",
      weight: 5,
      impact: "Medium",
      effort: "Medium",
      evidence: expertSignals ? "Research/report/source language appears in the copy." : "The copy lacks explicit research, source, or evidence language.",
      whyItMatters: "Answer engines tend to prefer grounded, fluent, evidence-rich passages over generic marketing copy.",
      recommendation: "Use precise, sourced language: 'According to...', 'In our benchmark...', 'The standard defines...'.",
    }),
    makeCheck({
      id: "original-data",
      label: "Original data or proprietary insight is visible",
      status: originalDataSignals ? "pass" : "warn",
      weight: 4,
      impact: "High",
      effort: "High",
      evidence: originalDataSignals ? "Original data language detected." : "No obvious survey, benchmark, dataset, or proprietary finding was detected.",
      whyItMatters: "AI systems prefer citing the origin of a statistic instead of pages that merely restate common facts.",
      recommendation: "Publish a small benchmark, survey, teardown, or methodology page that creates facts competitors must cite.",
      actionTitle: "Create citation-worthy original data",
    }),
    makeCheck({
      id: "freshness",
      label: "Dates make the content freshness clear",
      status: hasFreshDate ? "pass" : freshnessYears.length > 0 ? "warn" : "warn",
      weight: 2,
      impact: "Low",
      effort: "Low",
      evidence: freshnessYears.length ? `Years detected: ${unique(freshnessYears).join(", ")}.` : "No publication or evidence dates detected.",
      whyItMatters: "AI assistants often need current facts and may avoid undated claims in fast-moving categories.",
      recommendation: "Add a visible updated date and date every statistic or benchmark.",
    }),
  ];

  return makeSection("content", "Answer quality & citation worthiness", checks, "Would an AI system find concise, trustworthy passages to quote?");
}

function buildAuthoritySection({ parsedHtml, pageFacts }) {
  const hasSameAs = parsedHtml.schemaObjects.some((object) => object.sameAs || object.url) || parsedHtml.entityLinks.length > 0;
  const hasPersonOrAuthor = parsedHtml.schemaTypes.includes("Person") || /\b(author|written by|reviewed by|expert reviewer)\b/i.test(parsedHtml.visibleText);
  const brandInTitle = pageFacts.brand && parsedHtml.title.toLowerCase().includes(pageFacts.brand.toLowerCase().split(/\s+/)[0]);
  const brandInH1 = pageFacts.brand && parsedHtml.headings.some((heading) => heading.level === 1 && heading.text.toLowerCase().includes(pageFacts.brand.toLowerCase().split(/\s+/)[0]));
  const communitySignals = parsedHtml.entityLinks.some((link) => /wikipedia|wikidata|reddit|github|crunchbase|linkedin/i.test(link.hostname)) || /\b(wikipedia|reddit|github|crunchbase|linkedin)\b/i.test(parsedHtml.visibleText);

  const checks = [
    makeCheck({
      id: "brand-clarity",
      label: "Brand/entity name is clear and consistent",
      status: brandInTitle && brandInH1 ? "pass" : brandInTitle || brandInH1 ? "warn" : "fail",
      weight: 6,
      impact: "High",
      effort: "Low",
      evidence: `Inferred brand: ${pageFacts.brand || "unknown"}.`,
      whyItMatters: "AI search visibility correlates strongly with recognizable, consistently named entities.",
      recommendation: "Use the same brand/product name in title, H1, schema, social profiles, and About copy.",
    }),
    makeCheck({
      id: "entity-footprint",
      label: "External entity footprint is linked",
      status: hasSameAs ? "pass" : "warn",
      weight: 6,
      impact: "High",
      effort: "Medium",
      evidence: hasSameAs ? `Entity links/schema detected: ${parsedHtml.entityLinks.map((link) => link.hostname).slice(0, 5).join(", ") || "sameAs/url schema"}.` : "No sameAs, LinkedIn, Crunchbase, Wikidata, GitHub, or similar entity links detected.",
      whyItMatters: "Consistent off-site entity records help LLMs disambiguate brands and categories.",
      recommendation: "Add sameAs links for LinkedIn, Crunchbase, Wikidata/Wikipedia, GitHub, YouTube, or other authoritative profiles.",
    }),
    makeCheck({
      id: "source-authority",
      label: "The page cites trusted third parties",
      status: parsedHtml.authoritativeLinks.length >= 2 ? "pass" : parsedHtml.externalLinks.length >= 1 ? "warn" : "fail",
      weight: 5,
      impact: "Medium",
      effort: "Medium",
      evidence: `${parsedHtml.externalLinks.length} external link(s), ${parsedHtml.authoritativeLinks.length} high-authority source link(s).`,
      whyItMatters: "Authority is partly inherited through the evidence graph around the content.",
      recommendation: "Cite primary sources rather than low-authority roundups whenever possible.",
    }),
    makeCheck({
      id: "authorship",
      label: "Author or reviewer expertise is visible",
      status: hasPersonOrAuthor ? "pass" : "warn",
      weight: 3,
      impact: "Medium",
      effort: "Medium",
      evidence: hasPersonOrAuthor ? "Author/reviewer or Person schema detected." : "No visible author, reviewer, or Person schema detected.",
      whyItMatters: "Human expertise and accountability can increase trust for YMYL, technical, and B2B buying queries.",
      recommendation: "Show an expert author/reviewer, credentials, and Person schema on research or advice pages.",
    }),
    makeCheck({
      id: "community-entity-signals",
      label: "Community or knowledge-base signals exist",
      status: communitySignals ? "pass" : "warn",
      weight: 3,
      impact: "Medium",
      effort: "High",
      evidence: communitySignals ? "Community/knowledge-base references detected." : "No Wikipedia, Reddit, GitHub, Crunchbase, or similar signals detected on the page.",
      whyItMatters: "LLMs heavily weight public knowledge bases, developer ecosystems, and topical communities for entity recognition.",
      recommendation: "Earn legitimate mentions in topical communities, directories, partner pages, and knowledge bases.",
    }),
  ];

  return makeSection("authority", "Brand authority & entity footprint", checks, "Will AI systems recognize and trust the entity behind the page?");
}

function buildStandardsSection({ headerMap, robots, robotsTxt, llmsTxt, sitemapXml }) {
  const hasLlmsTxt = typeof llmsTxt === "string" && llmsTxt.trim().length > 20;
  const llmsLooksUseful = hasLlmsTxt && /^#\s+/m.test(llmsTxt) && /\[[^\]]+\]\(https?:\/\//.test(llmsTxt);
  const aiDisclosure = headerMap["ai-disclosure"] || headerMap["x-ai-disclosure"];
  const contentUsageHeader = headerMap["content-usage"] || headerMap["ai-usage"] || headerMap["x-robots-tag"];

  const checks = [
    makeCheck({
      id: "llms-txt",
      label: "llms.txt provides an LLM-friendly content map",
      status: llmsLooksUseful ? "pass" : hasLlmsTxt ? "warn" : "warn",
      weight: 4,
      impact: "Low",
      effort: "Low",
      evidence: llmsLooksUseful ? "llms.txt contains headings and absolute links." : hasLlmsTxt ? "llms.txt exists but may need clearer Markdown links." : "No llms.txt content detected.",
      whyItMatters: "llms.txt has mixed adoption, but it is low-cost insurance for documentation and developer-tool LLM workflows.",
      recommendation: "Publish /llms.txt with a concise description, canonical docs, pricing, product, research, and changelog links.",
    }),
    makeCheck({
      id: "xml-sitemap",
      label: "XML sitemap supports discovery",
      status: sitemapXml || robots.sitemaps.length ? "pass" : "fail",
      weight: 4,
      impact: "Medium",
      effort: "Low",
      evidence: sitemapXml ? "Sitemap XML content fetched." : robots.sitemaps.length ? `robots.txt lists ${robots.sitemaps.length} sitemap(s).` : "No sitemap found.",
      whyItMatters: "Sitemaps remain a foundational discovery signal for Googlebot, Bingbot, and downstream AI retrieval systems.",
      recommendation: "Generate a sitemap and include all canonical, indexable pages that should be cited.",
    }),
    makeCheck({
      id: "ai-disclosure-header",
      label: "AI content disclosure/provenance header is present where relevant",
      status: aiDisclosure ? "pass" : "warn",
      weight: 1,
      impact: "Low",
      effort: "Low",
      evidence: aiDisclosure ? `AI-Disclosure: ${aiDisclosure}` : "No AI-Disclosure header detected.",
      whyItMatters: "Provenance headers are emerging, not yet universal, but may become credibility inputs for AI systems.",
      recommendation: "Consider an AI-Disclosure header or page-level disclosure policy for provenance-sensitive content.",
    }),
    makeCheck({
      id: "aipref-readiness",
      label: "AI usage preferences are documented",
      status: contentUsageHeader || robotsTxt ? "pass" : "warn",
      weight: 1,
      impact: "Low",
      effort: "Low",
      evidence: contentUsageHeader ? `Usage-related header detected: ${contentUsageHeader}` : robotsTxt ? "robots.txt is available as the current de facto control surface." : "No usage preference signal detected.",
      whyItMatters: "IETF AIPREF work is moving toward standardized AI usage preferences attached to content.",
      recommendation: "Track AIPREF adoption and keep robots/header usage preferences explicit and documented.",
    }),
  ];

  return makeSection("standards", "Emerging AI standards", checks, "Does the site use low-cost standards that may help future AI retrieval?");
}

function buildPageFacts({ target, headerMap, parsedHtml, robots, robotsTxt, llmsTxt, sitemapXml, timings, httpStatus, brand, category }) {
  return {
    brand,
    category,
    host: target.hostname,
    httpStatus,
    contentType: headerMap["content-type"] || null,
    title: parsedHtml.title,
    description: parsedHtml.meta.description,
    canonical: parsedHtml.canonical,
    language: parsedHtml.lang || null,
    visibleWords: parsedHtml.visibleWordCount,
    headings: parsedHtml.headings.length,
    h1: parsedHtml.headings.find((heading) => heading.level === 1)?.text || null,
    schemaTypes: parsedHtml.schemaTypes,
    numericClaims: parsedHtml.numericClaims.slice(0, 12),
    externalLinks: parsedHtml.externalLinks.length,
    authoritativeLinks: parsedHtml.authoritativeLinks.length,
    entityLinks: parsedHtml.entityLinks.map((link) => link.href).slice(0, 10),
    robotsGroups: robots.groups.length,
    robotsPresent: Boolean(robotsTxt),
    llmsTxtPresent: Boolean(llmsTxt),
    sitemapPresent: Boolean(sitemapXml || robots.sitemaps.length),
    htmlMs: timings.htmlMs || null,
  };
}

function scoreReport(sections) {
  const sectionScores = Object.fromEntries(Object.entries(sections).map(([id, section]) => [id, section.score]));
  const totalWeight = Object.values(SECTION_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const overall = Math.round(
    Object.entries(SECTION_WEIGHTS).reduce((sum, [id, weight]) => sum + (sectionScores[id] ?? 0) * weight, 0) / totalWeight,
  );

  return {
    overall,
    grade: gradeForScore(overall),
    status: overall >= 85 ? "AI citation-ready" : overall >= 70 ? "Strong foundation" : overall >= 50 ? "Needs optimization" : "Major GEO blockers",
    sections: sectionScores,
  };
}

function buildSummary(score, sections, actions, facts) {
  const allChecks = Object.values(sections).flatMap((section) => section.checks.map((check) => ({ ...check, section: section.title })));
  const strengths = allChecks
    .filter((check) => check.status === "pass")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((check) => check.label);
  const risks = allChecks
    .filter((check) => ["fail", "warn"].includes(check.status))
    .sort((a, b) => statusSeverity(b.status) - statusSeverity(a.status) || b.weight - a.weight)
    .slice(0, 4)
    .map((check) => check.label);

  return {
    verdict: score.status,
    oneSentence: `${facts.brand || facts.host} scores ${score.overall}/100 (${score.grade}) for AI search readiness; ${actions.length ? `the top fix is: ${actions[0].title}.` : "no major fixes were detected."}`,
    strengths,
    risks,
  };
}

function buildPrioritizedActions(sections) {
  const impactRank = { High: 0, Medium: 1, Low: 2 };
  const statusRank = { fail: 0, warn: 1, pass: 2, info: 3 };
  return Object.values(sections)
    .flatMap((section) => section.checks.map((check) => ({ section: section.title, sectionId: section.id, ...check })))
    .filter((check) => ["fail", "warn"].includes(check.status) && check.recommendation)
    .sort((a, b) => {
      const statusDelta = statusRank[a.status] - statusRank[b.status];
      if (statusDelta !== 0) return statusDelta;
      const impactDelta = impactRank[a.impact] - impactRank[b.impact];
      if (impactDelta !== 0) return impactDelta;
      return b.weight - a.weight;
    })
    .slice(0, 12)
    .map((check, index) => ({
      priority: index + 1,
      title: check.actionTitle || sentenceCase(check.recommendation.replace(/\.$/, "")),
      section: check.section,
      sectionId: check.sectionId,
      status: check.status,
      impact: check.impact,
      effort: check.effort,
      evidence: check.evidence,
      whyItMatters: check.whyItMatters,
      nextSteps: check.nextSteps || defaultNextSteps(check),
    }));
}

function generatePromptPortfolio({ brand, category, target, parsedHtml }) {
  const cleanBrand = brand || target.hostname.replace(/^www\./, "");
  const cleanCategory = category || "solutions in this category";
  const h2Prompts = parsedHtml.headings
    .filter((heading) => heading.level === 2)
    .slice(0, 3)
    .map((heading) => ({
      intent: "Section extraction",
      prompt: `${heading.text.replace(/\?$/, "")} — what should buyers know?`,
      successSignals: ["The answer cites the audited page", "The answer repeats the section's direct claim", "The answer includes a statistic or source"],
    }));

  return [
    {
      intent: "Brand definition",
      prompt: `What is ${cleanBrand}, and what does it do?`,
      successSignals: ["Correct category", "Concise description", "Citation to the canonical site"],
    },
    {
      intent: "Category recommendation",
      prompt: `What are the best ${cleanCategory} for teams evaluating vendors?`,
      successSignals: ["Brand is mentioned", "Brand appears near direct competitors", "Answer cites comparison or product pages"],
    },
    {
      intent: "Problem-aware buying query",
      prompt: `How can a team improve ${cleanCategory} and what sources should they read?`,
      successSignals: ["Answer references the page's methodology", "Includes proof/statistics", "Cites authoritative sources"],
    },
    {
      intent: "Competitive comparison",
      prompt: `Compare ${cleanBrand} with other ${cleanCategory}.`,
      successSignals: ["Accurate differentiators", "Neutral tone", "Cites owned and third-party sources"],
    },
    {
      intent: "Implementation guidance",
      prompt: `What steps should I take to get results from ${cleanCategory}?`,
      successSignals: ["Answer extracts checklist-style guidance", "Mentions tools or templates", "Cites how-to content"],
    },
    {
      intent: "Trust and evidence",
      prompt: `What evidence supports ${cleanBrand}'s claims?`,
      successSignals: ["Mentions studies, benchmarks, customers, or sourced statistics", "Cites primary sources"],
    },
    {
      intent: "Entity disambiguation",
      prompt: `Is ${cleanBrand} a company, product, or publication?`,
      successSignals: ["Entity type is unambiguous", "SameAs profiles align", "No confusion with similarly named entities"],
    },
    ...h2Prompts,
  ].slice(0, 10);
}

function buildMarketBenchmark() {
  return {
    incumbentPatterns: [
      {
        capability: "Prompt monitoring",
        seenIn: ["Peec AI", "Otterly.AI", "AthenaHQ", "Ahrefs Brand Radar"],
        howThisToolResponds: "Generates a prompt portfolio and evaluates whether page sections directly answer those prompts.",
      },
      {
        capability: "Citation/source analysis",
        seenIn: ["Otterly.AI", "AthenaHQ", "Ahrefs Brand Radar"],
        howThisToolResponds: "Audits outbound authority, crawl access, extractability, schema, and source-worthy statistics.",
      },
      {
        capability: "Share-of-voice and competitor benchmarking",
        seenIn: ["Profound", "Peec AI", "AthenaHQ", "Ahrefs Brand Radar"],
        howThisToolResponds: "Prioritizes entity consistency, brand clarity, and prompts that can be tracked over time against competitors.",
      },
      {
        capability: "Optimization recommendations",
        seenIn: ["AthenaHQ", "Otterly.AI", "Peec AI"],
        howThisToolResponds: "Ranks fixes by impact, effort, and GEO evidence rather than only reporting visibility metrics.",
      },
    ],
  };
}

function makeSection(id, title, checks, summary) {
  const scoredChecks = checks.filter((check) => check.weight > 0 && check.status !== "info");
  const totalWeight = scoredChecks.reduce((sum, check) => sum + check.weight, 0);
  const earned = scoredChecks.reduce((sum, check) => sum + check.weight * statusMultiplier(check.status), 0);
  const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 100;

  return { id, title, summary, score, checks };
}

function makeCheck({ id, label, status, weight, evidence, whyItMatters, recommendation, impact = "Medium", effort = "Medium", actionTitle = null, nextSteps = null }) {
  return {
    id,
    label,
    status,
    weight,
    impact,
    effort,
    evidence,
    whyItMatters,
    recommendation,
    actionTitle,
    nextSteps,
  };
}

function parseHtml(html, target) {
  const source = String(html || "");
  const headHtml = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
  const bodyHtml = source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || source;
  const title = normalizeText(stripTags(source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""));
  const htmlTag = source.match(/<html\b([^>]*)>/i)?.[1] || "";
  const lang = parseAttributes(htmlTag).lang || "";
  const meta = extractMeta(headHtml);
  const canonical = extractCanonical(headHtml, target);
  const headings = extractHeadings(bodyHtml);
  const paragraphs = extractParagraphs(bodyHtml);
  const links = extractLinks(bodyHtml, target);
  const externalLinks = links.filter((link) => link.external);
  const authoritativeLinks = externalLinks.filter((link) => isAuthorityDomain(link.hostname));
  const entityLinks = externalLinks.filter((link) => isEntityDomain(link.hostname));
  const jsonLdBlocks = extractJsonLd(source);
  const schemaObjects = flattenSchemaObjects(jsonLdBlocks.flatMap((block) => (block.valid ? toArray(block.data) : [])));
  const schemaTypes = unique(schemaObjects.flatMap((object) => toArray(object["@type"]).filter(Boolean)));
  const scriptChars = Array.from(source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)).reduce((sum, match) => sum + match[1].length, 0);
  const visibleHtml = bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  const visibleText = normalizeText(stripTags(visibleHtml));
  const visibleWordCount = wordCount(visibleText);
  const numericClaims = extractNumericClaims(visibleText);

  return {
    title,
    headHtml,
    bodyHtml,
    lang,
    meta,
    canonical,
    headings,
    paragraphs,
    links,
    externalLinks,
    authoritativeLinks,
    entityLinks,
    jsonLdBlocks,
    schemaObjects,
    schemaTypes,
    scriptChars,
    visibleText,
    visibleWordCount,
    numericClaims,
  };
}

function extractMeta(headHtml) {
  const meta = { description: "", viewport: "", ogTitle: "", ogDescription: "" };
  for (const match of headHtml.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1]);
    const name = (attrs.name || attrs.property || "").toLowerCase();
    const content = normalizeText(attrs.content || "");
    if (name === "description") meta.description = content;
    if (name === "viewport") meta.viewport = content;
    if (name === "og:title") meta.ogTitle = content;
    if (name === "og:description") meta.ogDescription = content;
  }
  return meta;
}

function extractCanonical(headHtml, target) {
  for (const match of headHtml.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1]);
    if (/\bcanonical\b/i.test(attrs.rel || "") && attrs.href) {
      try {
        return new URL(attrs.href, target.href).href;
      } catch {
        return attrs.href;
      }
    }
  }
  return "";
}

function extractHeadings(html) {
  return Array.from(html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi))
    .map((match) => ({ level: Number(match[1]), text: normalizeText(stripTags(match[2])) }))
    .filter((heading) => heading.text);
}

function extractParagraphs(html) {
  return Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => ({ html: match[0], text: normalizeText(stripTags(match[1])) }))
    .filter((paragraph) => paragraph.text);
}

function extractLinks(html, target) {
  const links = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = parseAttributes(match[1]);
    if (!attrs.href || /^(#|javascript:|mailto:|tel:)/i.test(attrs.href)) continue;
    try {
      const url = new URL(attrs.href, target.href);
      links.push({
        href: url.href,
        hostname: url.hostname.replace(/^www\./i, ""),
        text: normalizeText(stripTags(match[2])),
        rel: attrs.rel || "",
        external: url.origin !== target.origin,
      });
    } catch {
      // Ignore malformed links; they are not useful evidence for GEO scoring.
    }
  }
  return links;
}

function extractJsonLd(html) {
  return Array.from(html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)).map((match) => {
    const raw = decodeHtml(match[1]).trim();
    try {
      return { valid: true, data: JSON.parse(raw), raw };
    } catch (error) {
      return { valid: false, error: error.message, raw };
    }
  });
}

function flattenSchemaObjects(nodes, output = []) {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      flattenSchemaObjects(node, output);
      continue;
    }
    output.push(node);
    if (node["@graph"]) flattenSchemaObjects(toArray(node["@graph"]), output);
    for (const key of ["mainEntity", "author", "publisher", "itemListElement", "about"]) {
      if (node[key]) flattenSchemaObjects(toArray(node[key]), output);
    }
  }
  return output;
}

function parseAttributes(source) {
  const attrs = {};
  for (const match of String(source || "").matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f\d]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function normalizeText(value) {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function extractNumericClaims(text) {
  const matches = text.match(/(?:\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|percent|x|×|million|billion|trillion|k|m|b|users|customers|companies|studies|pages|queries|citations|sources|days|weeks|months|years|ms|seconds|hours)?\b|\b20\d{2}\b)/gi) || [];
  return unique(matches.map((match) => match.trim()).filter((match) => /\d/.test(match))).slice(0, 50);
}

function robotsRuleLength(path) {
  return String(path || "").replace(/[\*\$]/g, "").length;
}

function robotsPathMatches(pattern, path) {
  if (!pattern) return false;
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const regex = pattern.endsWith("$") ? new RegExp(`^${escaped.slice(0, -2)}$`) : new RegExp(`^${escaped}`);
  return regex.test(path);
}

function inferBrand(parsedHtml, target) {
  const organization = parsedHtml.schemaObjects.find((object) => toArray(object["@type"]).includes("Organization") && object.name);
  if (organization?.name) return normalizeText(String(organization.name));

  const firstH1 = parsedHtml.headings.find((heading) => heading.level === 1)?.text;
  if (firstH1 && !/^home$/i.test(firstH1)) return trimEntityName(firstH1);

  if (parsedHtml.title) {
    const firstSegment = parsedHtml.title.split(/\s[|–—-]\s|:/)[0]?.trim();
    if (firstSegment && !/^home$/i.test(firstSegment)) return trimEntityName(firstSegment);
  }

  return target.hostname.replace(/^www\./, "").split(".")[0];
}

function inferCategory(parsedHtml, brand) {
  const candidates = [parsedHtml.title, parsedHtml.meta.description, parsedHtml.headings.find((heading) => heading.level === 1)?.text || ""].filter(Boolean);
  for (const candidate of candidates) {
    const withoutBrand = brand ? candidate.replace(new RegExp(escapeRegex(brand), "ig"), "") : candidate;
    const segment = withoutBrand.split(/\s[|–—-]\s|:/).map((part) => part.trim()).find((part) => wordCount(part) >= 2 && wordCount(part) <= 8);
    if (segment) return segment.replace(/^(is|are|the)\s+/i, "");
  }
  return "AI-search-relevant solutions";
}

function trimEntityName(value) {
  return normalizeText(value).split(/\s[|–—-]\s|:/)[0].split(/\s+(?:is|helps|for)\s+/i)[0].trim();
}

function isAuthorityDomain(hostname) {
  return AUTHORITY_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isEntityDomain(hostname) {
  return SOCIAL_OR_ENTITY_PATTERNS.some((pattern) => pattern.test(hostname));
}

function wordCount(value) {
  return (normalizeText(value).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function statusMultiplier(status) {
  if (status === "pass") return 1;
  if (status === "warn") return 0.5;
  if (status === "info") return 1;
  return 0;
}

function statusSeverity(status) {
  if (status === "fail") return 3;
  if (status === "warn") return 2;
  if (status === "pass") return 1;
  return 0;
}

function gradeForScore(score) {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

function defaultNextSteps(check) {
  return [check.recommendation, "Re-run the audit after publishing the change."];
}

function sentenceCase(value) {
  const text = String(value || "").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function truncate(value, length) {
  const text = normalizeText(value);
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function normalizeHeaders(headers) {
  if (!headers) return {};
  if (typeof headers.forEach === "function") {
    const output = {};
    headers.forEach((value, key) => {
      output[String(key).toLowerCase()] = String(value);
    });
    return output;
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchOptionalText(url, options) {
  try {
    const response = await fetchText(url, options);
    return response.ok ? response : { ...response, text: null };
  } catch (error) {
    return { ok: false, status: 0, text: null, headers: {}, ms: 0, error: error.message, finalUrl: url };
  }
}

async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT_MS, accept = "*/*" } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: accept,
        "User-Agent": "AI-Search-Optimizer/0.1 (+https://localhost; GEO audit)",
      },
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      headers: normalizeHeaders(response.headers),
      ms: Date.now() - started,
      finalUrl: response.url,
    };
  } catch (error) {
    const message = error.name === "AbortError" ? `Request timed out after ${timeoutMs} ms.` : error.message;
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}