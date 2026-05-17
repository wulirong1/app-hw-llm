const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

loadEnv();

const port = Number(process.env.PORT || 3001);

const server = createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/chat") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  try {
    const body = await readJson(req);
    const messages = normalizeMessages(body.messages);

    if (!process.env.GROQ_API_KEY) {
      sendJson(res, 500, { error: "Missing GROQ_API_KEY in server/.env" });
      return;
    }

    if (messages.length === 0) {
      sendJson(res, 400, { error: "messages must include at least one item" });
      return;
    }

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "你是 ChatMate，一個友善、簡潔、使用繁體中文回答的 AI 助理。",
            },
            ...messages,
          ],
          temperature: 0.7,
        }),
      },
    );

    const data = await groqResponse.json();

    if (!groqResponse.ok) {
      sendJson(res, groqResponse.status, {
        error: data.error?.message || "Groq API error",
      });
      return;
    }

    sendJson(res, 200, {
      reply: data.choices?.[0]?.message?.content || "",
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || "Server error",
    });
  }
});

server.listen(port, () => {
  console.log(`Chat server running on http://localhost:${port}`);
});

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), "server/.env");
    const env = readFileSync(envPath, "utf8");

    for (const line of env.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // The API route returns a clear error if GROQ_API_KEY is still missing.
  }
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolveRequest, rejectRequest) => {
    let rawBody = "";

    req.on("data", (chunk) => {
      rawBody += chunk;
    });

    req.on("end", () => {
      try {
        resolveRequest(JSON.parse(rawBody || "{}"));
      } catch {
        rejectRequest(new Error("Invalid JSON body"));
      }
    });

    req.on("error", rejectRequest);
  });
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => {
      return (
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim()
      );
    })
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}
