import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { auditWebsite } from "./analyzer.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = resolve(__dirname, "..", "public");
const PORT = Number(process.env.PORT || 3000);

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

    try {
      if (request.method === "GET" && requestUrl.pathname === "/api/health") {
        return sendJson(response, 200, { ok: true, service: "lumenyl" });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/audit") {
        const body = await readJsonBody(request);
        if (!body.url || typeof body.url !== "string") {
          return sendJson(response, 400, { error: "Provide a website URL for AI readiness analysis as { url }." });
        }
        const report = await auditWebsite(body.url);
        return sendJson(response, 200, report);
      }

      if (request.method === "GET" || request.method === "HEAD") {
        return serveStatic(request, response, requestUrl.pathname);
      }

      sendJson(response, 405, { error: "This endpoint does not support the requested method." });
    } catch (error) {
      const status = /valid website|http or https|returned HTTP|URL/i.test(error.message) ? 400 : 500;
      sendJson(response, status, { error: error.message || "Unexpected analysis service error." });
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => {
    console.log(`Lumenyl AI Search Intelligence running at http://localhost:${PORT}`);
  });
}