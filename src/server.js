import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { auditWebsite } from "./analyzer.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = resolve(__dirname, "..", "public");
const PORT = Number(process.env.PORT || 3000);

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const rateLimitMap = new Map();
const TRUSTED_PROXY_IPV4_RANGES = [/^10\./, /^127\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./];
const TRUSTED_PROXY_IPV6_RANGES = [/^::1$/i, /^fc/i, /^fd/i, /^fe80:/i, /^::ffff:(10|127)\./i, /^::ffff:172\.(1[6-9]|2\d|3[01])\./i, /^::ffff:192\.168\./i];

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  record.count += 1;
  return record.count > RATE_LIMIT_MAX_REQUESTS;
}

function normalizeIp(value) {
  return String(value || "").trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function isTrustedProxyIp(value) {
  const ip = normalizeIp(value);
  if (!ip) return false;
  return TRUSTED_PROXY_IPV4_RANGES.some((range) => range.test(ip)) || TRUSTED_PROXY_IPV6_RANGES.some((range) => range.test(ip));
}

function getClientIp(request) {
  const remoteAddress = normalizeIp(request.socket.remoteAddress);
  const forwardedAddress = String(request.headers["x-forwarded-for"] || "")
    .split(",")[0]
    ?.trim();

  if (isTrustedProxyIp(remoteAddress) && forwardedAddress) {
    return forwardedAddress;
  }

  return remoteAddress || "unknown";
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS * 2).unref();

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; script-src 'self'; connect-src 'self'",
  "AI-Disclosure": "human-authored",
  "Content-Usage": "ai-allowed",
};

function setSecurityHeaders(response) {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.setHeader(header, value);
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

export function createServer() {
  return createHttpServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    setSecurityHeaders(response);

    try {
      if (request.method === "GET" && requestUrl.pathname === "/api/health") {
        return sendJson(response, 200, { ok: true, service: "lumenyl" });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/audit") {
        const clientIp = getClientIp(request);
        if (isRateLimited(clientIp)) {
          return sendJson(response, 429, { error: "Too many requests. Please wait before analyzing another URL." });
        }
        const body = await readJsonBody(request);
        if (!body.url || typeof body.url !== "string") {
          return sendJson(response, 400, { error: "Provide a website URL for AI readiness analysis as { url }." });
        }
        const report = await auditWebsite(body.url);
        return sendJson(response, 200, report);
      }

if (request.method === "GET" || request.method === "HEAD") {
  if (existsSync(publicDir)) return serveStatic(request, response, requestUrl.pathname);
  return sendJson(response, 404, { error: "Not found." });
}

      sendJson(response, 405, { error: "This endpoint does not support the requested method." });
    } catch (error) {
      const isClientError = /valid website|http or https|returned HTTP|URL|too large|not allowed|not publicly|not resolve/i.test(error.message);
      const status = isClientError ? 400 : 500;
      const message = isClientError ? error.message : "Unexpected analysis service error.";
      sendJson(response, status, { error: message });
      if (!isClientError) console.error("Audit error:", error);
    }
  });
}

function serveStatic(request, response, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const normalizedPath = normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = resolve(join(publicDir, normalizedPath));

  if (!absolutePath.startsWith(publicDir) || !existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Resource not found");
    return;
  }

  const contentType = MIME_TYPES[extname(absolutePath)] || "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": contentType.includes("text/html") ? "no-store" : "public, max-age=3600",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(absolutePath).pipe(response);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 20_000) {
        rejectBody(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolveBody(data ? JSON.parse(data) : {});
      } catch {
        rejectBody(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", rejectBody);
  });
}

export default createServer();

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => {
    console.log(`Lumenyl AI Search Intelligence running at http://localhost:${PORT}`);
  });
}
