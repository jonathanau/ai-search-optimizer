import test from "node:test";
import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";

import {
  auditArtifacts,
  auditWebsite,
  assessCrawlerAccess,
  normalizeAuditUrl,
  parseRobotsTxt,
} from "../src/analyzer.js";

const strongHtml = `<!doctype html>
<html lang="en">
<head>
  <title>Acme GEO Platform | AI Search Visibility Software</title>
  <meta name="description" content="Acme helps B2B teams win AI search citations with prompt tracking, structured answers, and verifiable source analysis.">
  <link rel="canonical" href="https://example.com/geo-platform">
  <meta property="og:title" content="Acme GEO Platform">
  <script type="application/ld+json">
  {
    "@context":"https://schema.org",
    "@type":"Organization",
    "name":"Acme",
    "url":"https://example.com",
    "sameAs":["https://www.linkedin.com/company/acme", "https://www.crunchbase.com/organization/acme"]
  }
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org", "@type":"FAQPage", "mainEntity":[]}
  </script>
</head>
<body>
  <article>
    <h1>Acme GEO Platform</h1>
    <p><strong>Acme is AI search visibility software for B2B marketing teams.</strong> It helps teams measure brand mentions, citations, sentiment, and share of voice across ChatGPT, Perplexity, Gemini, Claude, and Google AI Overviews.</p>
    <h2>What is generative engine optimization?</h2>
    <p>Generative engine optimization means making pages easy for AI assistants to understand, extract, cite, and trust. In a 2024 Princeton study, adding verifiable statistics improved AI visibility by 30% to 41%.</p>
    <p>According to <a href="https://dl.acm.org/doi/10.1145/3637528.3671900">ACM KDD research</a>, content with clear statistics and citations can improve generated-answer visibility. Gartner projects traditional search traffic will decline 25% by 2026.</p>
    <h2>How Acme improves AI search visibility</h2>
    <p>Teams use Acme to monitor prompts, compare competitors, identify citation gaps, and rewrite pages with answer-first summaries.</p>
    <h3>Frequently asked questions</h3>
    <p>What should a GEO audit include? A GEO audit should include crawler access, structured data, source quality, answer extraction, statistics, and entity consistency.</p>
    <a href="https://www.gartner.com/en/newsroom">Gartner newsroom</a>
    <a href="https://en.wikipedia.org/wiki/Search_engine_optimization">Wikipedia reference</a>
  </article>
</body>
</html>`;

test("normalizes user-entered website URLs", () => {
  assert.equal(normalizeAuditUrl("example.com/path").href, "https://example.com/path");
  assert.equal(normalizeAuditUrl("http://example.com").protocol, "http:");
  assert.throws(() => normalizeAuditUrl("javascript:alert(1)"), /http or https/i);
});

test("parses robots.txt groups and distinguishes retrieval vs training crawlers", () => {
  const robots = parseRobotsTxt(`
    User-agent: GPTBot
    Disallow: /

    User-agent: OAI-SearchBot
    Allow: /

    User-agent: Claude-SearchBot
    Disallow: /private

    User-agent: PerplexityBot
    Disallow: /
  `);

  assert.equal(assessCrawlerAccess(robots, "GPTBot", "/").allowed, false);
  assert.equal(assessCrawlerAccess(robots, "OAI-SearchBot", "/").allowed, true);
  assert.equal(assessCrawlerAccess(robots, "Claude-SearchBot", "/blog").allowed, true);
  assert.equal(assessCrawlerAccess(robots, "PerplexityBot", "/").allowed, false);
});

test("awards strong GEO scores for answer-first, cited, structured content", () => {
  const report = auditArtifacts({
    url: "https://example.com/geo-platform",
    html: strongHtml,
    headers: { "content-type": "text/html; charset=utf-8", "ai-disclosure": "human-authored" },
    robotsTxt: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
    llmsTxt: "# Acme\n\n> Acme helps teams optimize for AI search.\n\n## Docs\n- [GEO guide](https://example.com/geo-guide)",
    sitemapXml: "<urlset><url><loc>https://example.com/geo-platform</loc></url><url><loc>https://example.com/geo-guide</loc></url></urlset>",
    timings: { htmlMs: 180 },
  });

  assert.ok(report.score.overall >= 78, `expected strong overall score, got ${report.score.overall}`);
  assert.equal(report.sections.access.checks.find((check) => check.id === "retrieval-crawlers").status, "pass");
  assert.equal(report.sections.content.checks.find((check) => check.id === "answer-first").status, "pass");
  assert.equal(report.sections.content.checks.find((check) => check.id === "statistics-with-sources").status, "pass");
  assert.equal(report.sections.structure.checks.find((check) => check.id === "structured-data").status, "pass");
  assert.ok(report.promptPortfolio.length >= 6);
  assert.ok(report.prioritizedActions.some((action) => action.impact === "High"));
});

test("flags GEO blockers for JavaScript-thin pages and blocked AI retrieval bots", () => {
  const weakHtml = `<!doctype html><html><head><title>Home</title><script>${"window.__APP__={};".repeat(500)}</script></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
  const report = auditArtifacts({
    url: "https://example.com/",
    html: weakHtml,
    headers: { "content-type": "text/html" },
    robotsTxt: "User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n\nUser-agent: *\nAllow: /",
    llmsTxt: null,
    sitemapXml: null,
    timings: { htmlMs: 3100 },
  });

  assert.ok(report.score.overall < 55, `expected weak overall score, got ${report.score.overall}`);
  assert.equal(report.sections.access.checks.find((check) => check.id === "retrieval-crawlers").status, "fail");
  assert.equal(report.sections.technical.checks.find((check) => check.id === "server-rendered-content").status, "fail");
  assert.equal(report.sections.content.checks.find((check) => check.id === "answer-first").status, "fail");
  assert.match(report.prioritizedActions[0].title, /crawler|server-render|answer/i);
});

test("blocks redirects to internal addresses during audit fetches", async () => {
  const responses = new Map([
    ["https://example.com/", new Response("", { status: 302, headers: { Location: "http://169.254.169.254/latest/meta-data" } })],
    ["https://example.com/robots.txt", new Response("User-agent: *\nAllow: /", { status: 200 })],
    ["https://example.com/llms.txt", new Response("", { status: 404 })],
  ]);
  const validateUrl = async (url) => {
    const href = String(url);
    if (/169\.254\.169\.254/.test(href)) throw new Error("Internal addresses are not allowed.");
  };

  await assert.rejects(
    auditWebsite("https://example.com", {
      validateUrl,
      fetchImpl: async (url) => {
        const response = responses.get(url);
        if (!response) throw new Error(`unexpected fetch for ${url}`);
        return response;
      },
    }),
    /internal addresses|not publicly routable/i,
  );
});

test("ignores sitemap URLs that resolve to internal addresses", async () => {
  const seenUrls = [];
  const responses = new Map([
    ["https://example.com/", new Response(strongHtml, { status: 200, headers: { "Content-Type": "text/html" } })],
    ["https://example.com/robots.txt", new Response("User-agent: *\nAllow: /\nSitemap: http://169.254.169.254/latest/meta-data", { status: 200 })],
    ["https://example.com/llms.txt", new Response("", { status: 404 })],
  ]);
  const validateUrl = async (url) => {
    const href = String(url);
    if (/169\.254\.169\.254/.test(href)) throw new Error("Internal addresses are not allowed.");
  };

  const report = await auditWebsite("https://example.com", {
    validateUrl,
    fetchImpl: async (url) => {
      seenUrls.push(url);
      const response = responses.get(url);
      if (!response) throw new Error(`unexpected fetch for ${url}`);
      return response;
    },
  });

  assert.equal(report.pageFacts.sitemapPresent, true);
  assert.deepEqual(seenUrls, ["https://example.com/", "https://example.com/robots.txt", "https://example.com/llms.txt"]);
});

test("rejects oversized responses before buffering the full body", async () => {
  const largeChunk = new Uint8Array(1024 * 1024).fill(65);

  await assert.rejects(
    auditWebsite("https://example.com", {
      validateUrl: async () => {},
      fetchImpl: async (url) => {
        if (url === "https://example.com/") {
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(largeChunk);
                controller.enqueue(largeChunk);
                controller.enqueue(largeChunk);
                controller.close();
              },
            }),
            { status: 200, headers: { "Content-Type": "text/html" } },
          );
        }
        if (url === "https://example.com/robots.txt") return new Response("", { status: 404 });
        if (url === "https://example.com/llms.txt") return new Response("", { status: 404 });
        throw new Error(`unexpected fetch for ${url}`);
      },
    }),
    /response too large/i,
  );
});
