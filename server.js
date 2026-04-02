const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");
const { parseModulesFromCsvText } = require("./backend/csvModuleParser");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const SAMPLE_MODULES_PATH = path.join(ROOT_DIR, "backend", "sampleModules.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

let moduleCatalog = [];
let catalogSource = "sample";

function sendJson(res, statusCode, payload)
{
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, text)
{
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function safeResolveStaticPath(requestPath)
{
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const absolute = path.resolve(ROOT_DIR, `.${cleanPath}`);
  if (!absolute.startsWith(ROOT_DIR))
  {
    return "";
  }
  return absolute;
}

function loadSampleModules()
{
  const raw = fs.readFileSync(SAMPLE_MODULES_PATH, "utf8");
  moduleCatalog = JSON.parse(raw);
  catalogSource = "sample";
}

function loadModulesFromCsv(csvPath)
{
  const absolutePath = path.resolve(csvPath);
  const csvText = fs.readFileSync(absolutePath, "utf8");
  moduleCatalog = parseModulesFromCsvText(csvText);
  catalogSource = "csv";
  return moduleCatalog.length;
}

function handleApiRequest(req, res, url)
{
  if (req.method === "GET" && url.pathname === "/api/modules")
  {
    if (catalogSource === "sample")
    {
      try
      {
        loadSampleModules();
      }
      catch {
        return sendJson(res, 500, { error: "Failed to read sample modules." });
      }
    }

    return sendJson(res, 200, { modules: moduleCatalog });
  }

  if (req.method === "POST" && url.pathname === "/api/modules/load")
  {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024)
      {
        req.destroy();
      }
    });

    req.on("end", () => {
      try
      {
        const payload = body ? JSON.parse(body) : {};
        const csvPath = String(payload.csvPath || process.env.CSV_FILE || "").trim();
        if (!csvPath)
        {
          return sendJson(res, 400, { error: "csvPath is required (or set CSV_FILE env var)." });
        }

        const count = loadModulesFromCsv(csvPath);
        return sendJson(res, 200, {
          ok: true,
          message: `Loaded ${count} modules from CSV.`,
          moduleCount: count,
        });
      }
      catch (error)
      {
        return sendJson(res, 400, { error: error.message });
      }
    });

    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function handleStaticRequest(req, res, url)
{
  const filePath = safeResolveStaticPath(url.pathname);
  if (!filePath)
  {
    return sendText(res, 403, "Forbidden");
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile())
    {
      return sendText(res, 404, "Not found");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      sendText(res, 500, "Internal server error");
    });

    res.writeHead(200, { "Content-Type": contentType });
    stream.pipe(res);
  });
}

function initializeCatalog()
{
  loadSampleModules();

  const startupCsvPath = String(process.env.CSV_FILE || "").trim();
  if (!startupCsvPath)
  {
    return;
  }

  try
  {
    const count = loadModulesFromCsv(startupCsvPath);
    console.log(`[startup] Loaded ${count} modules from ${startupCsvPath}`);
  }
  catch (error)
  {
    console.error(`[startup] Failed to load CSV from ${startupCsvPath}: ${error.message}`);
    console.error("[startup] Falling back to sample modules.");
    loadSampleModules();
  }
}

initializeCatalog();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname.startsWith("/api/"))
  {
    return handleApiRequest(req, res, url);
  }

  return handleStaticRequest(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log("API endpoints:");
  console.log("  GET  /api/modules");
  console.log("  POST /api/modules/load  { \"csvPath\": \"/absolute/path/to/file.csv\" }");
});
