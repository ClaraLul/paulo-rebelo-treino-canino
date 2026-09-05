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
const maxUploadSize = 12 * 1024 * 1024;
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const useSupabase = Boolean(supabaseUrl && supabaseKey);
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY || "";
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET || "";
const cloudinaryFolder = process.env.CLOUDINARY_FOLDER || "paulo-rebelo";
const useCloudinary = Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);

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
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".svg": "image/svg+xml"
};

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function sha1(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
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

function readLocalContent() {
  ensureContentFile();
  return JSON.parse(fs.readFileSync(contentFile, "utf8"));
}

function writeLocalContent(content) {
  ensureContentFile();
  fs.writeFileSync(contentFile, JSON.stringify(content, null, 2));
}

async function supabaseRequest(route, options = {}) {
  const response = await fetch(`${supabaseUrl}${route}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Supabase error ${response.status}`);
  }
  return payload;
}

async function writeRemoteContent(content) {
  await supabaseRequest("/rest/v1/site_content?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ id: "main", content, updated_at: new Date().toISOString() }])
  });
}

async function readRemoteContent() {
  const rows = await supabaseRequest("/rest/v1/site_content?id=eq.main&select=content", { method: "GET" });
  if (rows.length && rows[0].content) return rows[0].content;

  const initial = fs.existsSync(contentFile) ? readLocalContent() : readDefaultContent();
  await writeRemoteContent(initial);
  return initial;
}

async function readContent() {
  return useSupabase ? readRemoteContent() : readLocalContent();
}

async function writeContent(content) {
  if (useSupabase) {
    await writeRemoteContent(content);
    return;
  }
  writeLocalContent(content);
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

async function readRemoteRequests() {
  const rows = await supabaseRequest("/rest/v1/contact_requests?select=id,created_at,payload&order=created_at.desc", { method: "GET" });
  return rows.map((row) => ({ ...(row.payload || {}), id: row.id, createdAt: row.created_at }));
}

async function readStoredRequests() {
  return useSupabase ? readRemoteRequests() : readRequests();
}

async function addStoredRequest(entry) {
  if (useSupabase) {
    await supabaseRequest("/rest/v1/contact_requests", {
      method: "POST",
      body: JSON.stringify([{ id: entry.id, created_at: entry.createdAt, payload: entry }])
    });
    return;
  }
  const requests = readRequests();
  requests.unshift(entry);
  writeRequests(requests);
}

async function deleteStoredRequest(id) {
  if (useSupabase) {
    await supabaseRequest(`/rest/v1/contact_requests?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return;
  }
  const requests = readRequests();
  writeRequests(requests.filter((entry) => entry.id !== id));
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

function readRawBody(request, limit = maxUploadSize) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Upload too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseMultipartUpload(request, body) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(request.headers["content-type"] || "");
  const boundary = match && (match[1] || match[2]);
  if (!boundary) throw new Error("Missing upload boundary");

  const marker = Buffer.from(`--${boundary}`);
  const nameMatch = /name="file";\s*filename="([^"]+)"/i;
  let offset = 0;

  while (offset < body.length) {
    const start = body.indexOf(marker, offset);
    if (start === -1) break;
    const headerStart = start + marker.length + 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) break;

    const headers = body.slice(headerStart, headerEnd).toString("utf8");
    const filename = nameMatch.exec(headers)?.[1] || "";
    const contentType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim().toLowerCase() || "";
    const dataStart = headerEnd + 4;
    const next = body.indexOf(Buffer.from(`\r\n--${boundary}`), dataStart);
    if (next === -1) break;

    if (filename) {
      return {
        filename,
        contentType,
        data: body.slice(dataStart, next)
      };
    }
    offset = next + 2;
  }

  throw new Error("No file uploaded");
}

function validateUploadedImage(upload) {
  const allowed = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif"
  };
  const extension = allowed[upload.contentType];
  if (!extension) throw new Error("Only image uploads are allowed");
  if (!upload.data.length) throw new Error("Uploaded file is empty");
  return extension;
}

async function uploadToCloudinary(upload) {
  validateUploadedImage(upload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sha1(`folder=${cloudinaryFolder}&timestamp=${timestamp}${cloudinaryApiSecret}`);
  const form = new FormData();
  form.append("file", new Blob([upload.data], { type: upload.contentType }), upload.filename);
  form.append("api_key", cloudinaryApiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", cloudinaryFolder);
  form.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`, {
    method: "POST",
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "Cloudinary upload failed");
  return payload.secure_url;
}

function saveUploadedImageLocally(upload) {
  const extension = validateUploadedImage(upload);
  const base = path.basename(upload.filename, path.extname(upload.filename))
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "imagem";
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${base}${extension}`;
  const picturesDir = path.join(root, "Pictures");
  fs.mkdirSync(picturesDir, { recursive: true });
  fs.writeFileSync(path.join(picturesDir, filename), upload.data);
  return `Pictures/${filename}`;
}

async function saveUploadedImage(upload) {
  return useCloudinary ? uploadToCloudinary(upload) : saveUploadedImageLocally(upload);
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
      sendJson(response, 200, await readContent());
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
      await addStoredRequest(entry);
      sendJson(response, 201, { ok: true });
      return true;
    }

    if (request.method === "GET" && pathname === "/api/requests") {
      const session = currentSession(request);
      if (!session) {
        sendJson(response, 401, { error: "Not authenticated" });
        return true;
      }
      sendJson(response, 200, await readStoredRequests());
      return true;
    }

    if (request.method === "DELETE" && pathname.startsWith("/api/requests/")) {
      const session = currentSession(request);
      if (!session) {
        sendJson(response, 401, { error: "Not authenticated" });
        return true;
      }
      const id = decodeURIComponent(pathname.replace("/api/requests/", ""));
      await deleteStoredRequest(id);
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

    if (request.method === "POST" && pathname === "/api/upload") {
      const session = currentSession(request);
      if (!session) {
        sendJson(response, 401, { error: "Not authenticated" });
        return true;
      }
      const upload = parseMultipartUpload(request, await readRawBody(request));
      sendJson(response, 201, { path: await saveUploadedImage(upload) });
      return true;
    }

    if (request.method === "PUT" && pathname === "/api/content") {
      const session = currentSession(request);
      if (!session) {
        sendJson(response, 401, { error: "Not authenticated" });
        return true;
      }
      await writeContent(await readBody(request));
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
  const extension = path.extname(file).toLowerCase();
  const isAdminFile = path.relative(root, file).replaceAll("\\", "/").startsWith("admin/");
  response.writeHead(200, {
    "content-type": types[extension] || "application/octet-stream",
    "cache-control": extension === ".html" || isAdminFile ? "no-store" : "public, max-age=3600"
  });
  fs.createReadStream(file).pipe(response);
}).listen(port, () => {
  if (!useSupabase) ensureContentFile();
  console.log(`Paulo Rebelo site: http://localhost:${port}`);
});
