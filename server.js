// Blends Barbershop portal: static pages + one JSON record for the shop info form.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "info.json");
const EDIT_CODE = process.env.EDIT_CODE || "";
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

fs.mkdirSync(DATA_DIR, { recursive: true });

function codeOk(req) {
  if (!EDIT_CODE) return true;
  const given = String(req.headers["x-portal-code"] || "");
  const a = Buffer.from(given), b = Buffer.from(EDIT_CODE);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/health") return send(res, 200, { ok: true });

  if (url.pathname === "/api/info") {
    if (!codeOk(req)) return send(res, 401, { error: "Wrong access code" });
    if (req.method === "GET") {
      if (!fs.existsSync(DATA_FILE)) return send(res, 200, {});
      return send(res, 200, fs.readFileSync(DATA_FILE, "utf8"));
    }
    if (req.method === "PUT") {
      let body = "";
      req.on("data", c => { body += c; if (body.length > 500000) req.destroy(); });
      req.on("end", () => {
        let data;
        try { data = JSON.parse(body); } catch { return send(res, 400, { error: "Bad JSON" }); }
        if (typeof data !== "object" || data === null || Array.isArray(data)) return send(res, 400, { error: "Bad data" });
        data.updatedAt = new Date().toISOString();
        const tmp = DATA_FILE + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, DATA_FILE);
        send(res, 200, { ok: true, updatedAt: data.updatedAt });
      });
      return;
    }
    return send(res, 405, { error: "Method not allowed" });
  }

  if (url.pathname === "/api/needs-code") return send(res, 200, { needsCode: Boolean(EDIT_CODE) });

  let file = path.normalize(path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(PUBLIC)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    send(res, 200, buf, TYPES[path.extname(file)] || "application/octet-stream");
  });
});

server.listen(PORT, () => console.log("Portal listening on " + PORT + (EDIT_CODE ? " (access code on)" : " (no access code)")));
