const http = require("http");

const PORT = Number(process.env.PORT || 8787);

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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

  if (req.method === "POST" && req.url === "/openai/chat") {
    try {
      const body = await readJsonBody(req);
      const { apiKey, model, prompt } = body || {};
      const key = String(apiKey || "").trim();
      const selectedModel = String(model || "gpt-4.1-mini").trim();
      const promptText = String(prompt || "").trim();

      if (!key || !promptText) {
        jsonResponse(res, 400, {
          ok: false,
          error: "apiKey and prompt are required"
        });
        return;
      }

      const payload = {
        model: selectedModel,
        input: promptText
      };

      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify(payload)
      });

      let upstreamJson = null;
      try {
        upstreamJson = await upstream.json();
      } catch (_err) {
        upstreamJson = null;
      }

      if (!upstream.ok) {
        const message =
          upstreamJson?.error?.message || `OpenAI upstream error (${upstream.status})`;
        jsonResponse(res, upstream.status, {
          ok: false,
          status: upstream.status,
          error: message,
          raw: upstreamJson
        });
        return;
      }

      jsonResponse(res, 200, {
        ok: true,
        status: 200,
        raw: upstreamJson
      });
    } catch (err) {
      jsonResponse(res, 500, {
        ok: false,
        error: err?.message || "Unexpected proxy error"
      });
    }
    return;
  }

  jsonResponse(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[survivor-proxy] listening on http://localhost:${PORT}`);
});

