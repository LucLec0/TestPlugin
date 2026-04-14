const http = require("http");
const path = require("path");
const fs = require("fs");

const PORT = Number(process.env.PORT || 8080);
const ROOT_DIR = __dirname;

const MIME_BY_EXT = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function textResponse(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(text);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (_err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

function extractOpenAiText(json) {
  if (!json) return "";
  if (typeof json.output_text === "string" && json.output_text.trim()) return json.output_text.trim();
  if (Array.isArray(json.output)) {
    const chunks = [];
    json.output.forEach((item) => {
      if (!Array.isArray(item?.content)) return;
      item.content.forEach((part) => {
        if (typeof part?.text === "string" && part.text.trim()) chunks.push(part.text.trim());
      });
    });
    if (chunks.length) return chunks.join(" ").trim();
  }
  const maybeChatCompletion = json?.choices?.[0]?.message?.content;
  if (typeof maybeChatCompletion === "string" && maybeChatCompletion.trim()) return maybeChatCompletion.trim();
  return "";
}

async function callOpenAiProxy({ key, model, prompt }) {
  const requests = [
    {
      url: "https://api.openai.com/v1/responses",
      body: {
        model,
        input: prompt
      }
    },
    {
      url: "https://api.openai.com/v1/chat/completions",
      body: {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9
      }
    }
  ];

  let lastError = "OpenAI request failed";
  for (const request of requests) {
    let response;
    try {
      response = await fetch(request.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify(request.body)
      });
    } catch (error) {
      lastError = error?.message || "Network error";
      continue;
    }

    let json = null;
    try {
      json = await response.json();
    } catch (_ignore) {
      json = null;
    }

    if (!response.ok) {
      lastError = json?.error?.message || `OpenAI upstream error (${response.status})`;
      continue;
    }

    const text = extractOpenAiText(json);
    if (text) {
      return { ok: true, text };
    }
    lastError = "OpenAI returned empty text";
  }

  return { ok: false, error: lastError };
}

function serveStatic(req, res) {
  const rawUrlPath = (req.url || "/").split("?")[0];
  const normalized = decodeURIComponent(rawUrlPath === "/" ? "/index.html" : rawUrlPath);
  const safePath = path.normalize(normalized).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT_DIR, safePath);
  if (!filePath.startsWith(ROOT_DIR)) {
    textResponse(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      textResponse(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    textResponse(res, 200, "ok");
    return;
  }

  if (req.method === "POST" && req.url === "/api/openai/chat") {
    try {
      const body = await readJsonBody(req);
      const key = String(body?.key || "").trim();
      const model = String(body?.model || "gpt-4.1-mini").trim();
      const prompt = String(body?.prompt || "").trim();
      if (!key || !prompt) {
        jsonResponse(res, 400, { ok: false, error: "key and prompt are required" });
        return;
      }

      const result = await callOpenAiProxy({ key, model, prompt });
      if (!result.ok) {
        jsonResponse(res, 502, { ok: false, error: result.error || "OpenAI call failed" });
        return;
      }
      jsonResponse(res, 200, { ok: true, text: result.text });
    } catch (error) {
      jsonResponse(res, 500, { ok: false, error: error?.message || "Unexpected proxy error" });
    }
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  jsonResponse(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[survivor-server] http://localhost:${PORT}`);
});

