# AI Search Optimizer

A dependency-free Node.js web app for auditing a website's GEO/AEO readiness: crawler access, server-rendered content, schema.org, answer-first passages, statistics with citations, entity footprint, llms.txt, sitemaps, and prioritized AI-search optimization actions.

## Why this exists

Many GEO/AEO workflows focus on AI visibility monitoring, prompt tracking, source/citation analysis, share-of-voice, and recommendations. This project turns those patterns into an actionable website audit that answers: **can AI answer engines fetch, understand, trust, extract, and cite this page?**

## Run locally

```bash
npm test
npm start
```

Open <http://localhost:3000>, enter a URL, and run the audit.

## TDD coverage

The initial red/green tests cover URL normalization, robots.txt parsing, retrieval-vs-training crawler access, positive GEO scoring, and blocker detection for JavaScript-thin pages with blocked AI retrieval crawlers.