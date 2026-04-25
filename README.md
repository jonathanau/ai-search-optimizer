# Lumenyl AI Search Intelligence

A dependency-free Node.js web app for benchmarking a website's readiness for frontier AI answer engines. Lumenyl evaluates whether systems such as ChatGPT, Claude, Perplexity, Gemini / Google AI Overviews, and Microsoft Copilot can discover, understand, trust, extract, and cite a page.

Lumenyl checks crawler access, server-rendered content, schema.org depth, answer-ready passages, evidence-backed claims, entity authority, `llms.txt`, sitemaps, and prioritized AI-search visibility actions.

## Why this exists

Modern discovery is shifting from ranked links to AI-generated answers. Lumenyl translates enterprise GEO, prompt intelligence, citation analysis, and entity optimization patterns into an actionable readiness brief that answers: **can frontier AI systems discover, understand, trust, extract, and cite this page?**

## What it analyzes

Lumenyl produces a scored AI readiness report across six weighted dimensions:

- **AI crawler access & indexability** — robots.txt availability, retrieval-crawler permissions, on-demand fetcher access, training-crawler policy separation, and sitemap discovery.
- **Answer quality & citation potential** — answer-first summaries, numeric/statistical claims, authoritative citations, concise passages, FAQ-style coverage, expert language, original data, and freshness signals.
- **Structured data & entity intelligence** — JSON-LD/schema.org coverage, Organization/Product/Person-style entity identifiers, title and meta description quality, heading hierarchy, and Open Graph summaries.
- **Technical retrieval performance** — HTML content type, server-rendered text availability, response speed, canonical tags, language metadata, and viewport metadata.
- **Brand authority & entity footprint** — consistent brand signals, sameAs/entity links, authoritative outbound references, author/reviewer cues, and public knowledge/community signals.
- **Emerging AI standards** — `llms.txt`, sitemap hygiene, AI/provenance disclosure headers, and early AI content-usage preference signals.

## Report output

Each audit returns:

- An overall readiness score and status, from critical blockers to AI citation-ready.
- Section-level scores for access, content, structure, technical, authority, and standards.
- An intelligence snapshot with detected brand, visible content depth, schema types, authority signals, robots.txt, `llms.txt`, and sitemap status.
- A prioritized AI visibility roadmap sorted by severity, impact, and effort.
- Diagnostic checks with evidence, strategic rationale, recommendations, and next steps.
- A prompt portfolio to monitor in frontier answer engines.
- A benchmark panel mapping Lumenyl's checks to common AI search intelligence platform patterns.

## Features

- Runs locally with Node.js 18+ and no runtime dependencies.
- Fetches and analyzes a target page, `robots.txt`, `llms.txt`, and sitemap candidates.
- Distinguishes AI retrieval crawlers from training crawlers and user-triggered fetchers.
- Parses visible HTML, metadata, headings, paragraphs, links, JSON-LD, and numeric claims.
- Provides a browser UI plus a JSON API for programmatic audits.
- Uses Node's built-in test runner for analyzer coverage.

## Run locally

Requirements:

- Node.js 18 or newer

Install or clone the project, then run:

```bash
npm test
npm start
```

Open <http://localhost:3000>, enter a URL, and run the AI readiness analysis.

For development with automatic server restarts:

```bash
npm run dev
```

## API

The local server exposes a single audit endpoint:

```bash
curl -s http://localhost:3000/api/audit \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}' | jq
```

The response includes the analyzed URL, score object, summary, page facts, section diagnostics, prioritized actions, prompt portfolio, and market benchmark metadata.

## Project structure

```text
public/             Browser UI assets
  index.html        App shell and audit form
  app.js            Report rendering and client-side API call
  style.css         Visual styling
src/
  server.js         Dependency-free static server and /api/audit endpoint
  analyzer.js       URL normalization, fetching, parsing, scoring, and recommendations
test/
  analyzer.test.js  Node test runner coverage for analyzer behavior
```

## Example use cases

- Check whether a product, documentation, or thought-leadership page can be retrieved and cited by AI answer engines.
- Find accidental robots.txt blocks for AI retrieval crawlers without conflating them with training opt-outs.
- Identify pages that rely too heavily on client-side rendering for citation-worthy content.
- Prioritize content updates that add answer-first summaries, evidence, statistics, FAQs, and entity clarity.
- Track readiness for emerging AI discovery standards such as `llms.txt` and AI usage preference headers.

## Limitations

Lumenyl is a readiness benchmark, not a guarantee of inclusion in any AI answer engine. Frontier systems use private ranking, retrieval, freshness, safety, personalization, and citation-selection logic that can change without notice.

The analyzer inspects public page artifacts from a single URL at audit time. It does not log into private sites, execute full browser rendering, crawl an entire domain, measure actual AI citations, or query external LLM/search APIs.

## License

Apache-2.0
