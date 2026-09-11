import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ApiRequest, execute } from "@zim/core";

export const MAX_REQUEST_BYTES = 64 * 1024;

const publicDirectory = path.resolve(__dirname, "../public");
const browserScript = path.resolve(__dirname, "browser/app.js");

interface BodyResult {
  readonly tooLarge: boolean;
  readonly text: string;
}

function readBody(request: IncomingMessage): Promise<BodyResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    request.on("end", () =>
      resolve({ tooLarge, text: tooLarge ? "" : Buffer.concat(chunks).toString("utf8") }),
    );
    request.on("error", reject);
  });
}

function securityHeaders(response: ServerResponse): void {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'",
  );
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function sendFile(
  response: ServerResponse,
  file: string,
  contentType: string,
): Promise<void> {
  try {
    const content = await readFile(file);
    response.writeHead(200, { "content-type": contentType, "cache-control": "no-cache" });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: "Asset not found" });
  }
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  securityHeaders(response);
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET") {
    if (requestUrl.pathname === "/") {
      await sendFile(
        response,
        path.join(publicDirectory, "index.html"),
        "text/html; charset=utf-8",
      );
      return;
    }
    if (requestUrl.pathname === "/styles.css") {
      await sendFile(response, path.join(publicDirectory, "styles.css"), "text/css; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/app.js") {
      await sendFile(response, browserScript, "text/javascript; charset=utf-8");
      return;
    }
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/v1") {
    const body = await readBody(request);
    if (body.tooLarge) {
      sendJson(response, 413, {
        version: "1.0",
        status: "error",
        error: { code: "REQUEST_TOO_LARGE", message: "Request exceeds 65536 bytes" },
      });
      return;
    }
    try {
      const parsed = JSON.parse(body.text) as ApiRequest;
      sendJson(response, 200, execute(parsed));
    } catch {
      sendJson(response, 400, {
        version: "1.0",
        status: "error",
        error: { code: "INVALID_JSON", message: "Request body must be valid JSON" },
      });
    }
    return;
  }
  sendJson(response, 404, { error: "Route not found" });
}

export function createGuiServer(): Server {
  return createServer((request, response) => {
    void handle(request, response).catch((caught: unknown) => {
      if (!response.headersSent) {
        sendJson(response, 500, {
          version: "1.0",
          status: "error",
          error: {
            code: "GUI_SERVER_ERROR",
            message: caught instanceof Error ? caught.message : "Unexpected GUI server failure",
          },
        });
      } else response.end();
    });
  });
}

if (require.main === module) {
  const configuredPort = Number(process.env.ZIM_GUI_PORT ?? "3210");
  const port = Number.isInteger(configuredPort) && configuredPort >= 0 ? configuredPort : 3210;
  createGuiServer().listen(port, "127.0.0.1", () => {
    console.log(`Zim GUI available at http://127.0.0.1:${port}`);
  });
}
