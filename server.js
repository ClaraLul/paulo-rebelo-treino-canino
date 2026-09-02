const crypto = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = __dirname;
const port = Number(process.env.PORT || 8080);
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const contentFile = path.join(dataDir, "content.json");
const requestsFile = path.join(dataDir, "requests.json");
const sessions = new Map();
const maxBodySize = 2 * 1024 * 1024;

const demoHashes = {
  paulo: "822bfda4f01fd54b614905a0d875e80ae0210477a4971c3b22e97d1dd6c3372c",
  super: "9a0ee89e00a006877eca0c28eebeb38aa301469b9cce8012b6ee04b13079a7e8"
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".svg": "image/svg+xml"
};

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function passwordHashFor(role) {
  if (role === "super") return process.env.SUPER_ADMIN_PASSWORD_HASH || demoHashes.super;
  return process.env.PAULO_ADMIN_PASSWORD_HASH || demoHashes.paulo;
}

function readDefaultContent() {
  const source = fs.readFileSync(path.join(root, "assets", "content.js"), "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.window.PAULO_DEFAULT_CONTENT;
}

function ensureContentFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(contentFile)) {
    fs.writeFileSync(contentFile, JSON.stringify(readDefaultContent(), null, 2));
  }
}

function readContent() {
  ensureContentFile();
  return JSON.parse(fs.readFileSync(contentFile, "utf8"));
}

function writeContent(content) {
  ensureContentFile();
  fs.writeFileSync(contentFile, JSON.stringify(content, null, 2));
}

function ensureRequestsFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(requestsFile)) {
    fs.writeFileSync(requestsFile, "[]");
  }
}

function readRequests() {
  ensureRequestsFile();
  return JSON.parse(fs.readFileSync(requestsFile, "utf8"));
}

function writeRequests(requests) {
  ensureRequestsFile();
  fs.writeFileSync(requestsFile, JSON.stringify(requests, null, 2));
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").filter(Boolean).map((item) => {
    const [key, ...value] = item.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
}

function currentSession(request) {
  const token = parseCookies(request).paulo_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBodySize) {
        reject(new Error("Body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  let target = path.join(root, clean);
  if (!path.normalize(target).startsWith(root)) return null;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, "index.html");
  }
  return target;
}

async function handleApi(request, response, pathname) {
  try {
    if (request.method === "GET" && pathname === "/api/content") {
      sendJson(response, 200, readContent());
      return true;
    }

    if (request.method === "GET" && pathname === "/api/session") {
      const session = currentSession(request);
      sendJson(response, 200, { authenticated: Boolean(session), role: session?.role || "" });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/login") {
      const body = await readBody(request);
      const role = body.role === "super" ? "super" : "paulo";
      if (sha256(body.password || "") !== passwordHashFor(role)) {
        sendJson(response, 401, { error: "Invalid login" });
        return true;
      }
      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, { role, expires: Date.now() + 1000 * 60 * 60 * 12 });
      sendJson(response, 200, { role }, {
        "set-cookie": `paulo_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
      });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/requests") {
      const body = await readBody(request);
      const entry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        name: String(body.name || "").trim(),
        email: String(body.email || "").trim(),
        phone: String(body.phone || "").trim(),
        dogName: String(body.dogName || "").trim(),
        dogAge: String(body.dogAge || "").trim(),
        contactPreference: String(body.contactPreference || "").trim(),
        reason: String(body.reason || "").trim(),
        message: String(body.message || "").trim(),
        status: "new"
      };
      if (!entry.name || !entry.email || !entry.message) {
        sendJson(response, 400, { error: "Missing required fields" });
        return true;
      }
      const requests = readRequests();
      requests.unshift(entry);
      writeRequests(requests);
      sendJson(response, 201, { ok: true });
      return true;
    }

    if (request.method === "GET" && pathname === "/api/requests") {
      const session = currentSession(request);
      if (!session) {
        sendJson(response, 401, { error: "Not authenticated" });
        return true;
      }
      sendJson(response, 200, readRequests());
      return true;
    }

    if (request.method === "DELETE" && pathname.startsWith("/api/requests/")) {
      const session = currentSession(request);
      if (!session) {
        sendJson(response, 401, { error: "Not authenticated" });
        return true;
      }
      const id = decodeURIComponent(pathname.replace("/api/requests/", ""));
      const requests = readRequests();
      writeRequests(requests.filter((entry) => entry.id !== id));
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/logout") {
      const token = parseCookies(request).paulo_session;
      if (token) sessions.delete(token);
      sendJson(response, 200, { ok: true }, {
        "set-cookie": "paulo_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
      });
      return true;
    }

    if (request.method === "PUT" && pathname === "/api/content") {
      const session = currentSession(request);
      if (!session) {
        sendJson(response, 401, { error: "Not authenticated" });
        return true;
      }
      writeContent(await readBody(request));
      sendJson(response, 200, { ok: true });
      return true;
    }

    return false;
  } catch (error) {
    sendJson(response, 500, { error: error.message });
    return true;
  }
}

http.createServer(async (request, response) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (pathname.startsWith("/api/") && await handleApi(request, response, pathname)) return;

  const file = resolveFile(request.url);
  if (!file || !fs.existsSync(file)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
    "cache-control": path.extname(file).toLowerCase() === ".html" ? "no-store" : "public, max-age=3600"
  });
  fs.createReadStream(file).pipe(response);
}).listen(port, () => {
  ensureContentFile();
  console.log(`Paulo Rebelo site: http://localhost:${port}`);
});
