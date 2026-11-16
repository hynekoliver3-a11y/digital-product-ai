// Local server. On Vercel, public/ and api/ are served directly and this file is unused.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { POST } from "./api/chat.js";

const PORT = Number(process.env.PORT) || 3000;
const page = new URL("./public/index.html", import.meta.url);

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await readFile(page));
      return;
    }

    if (req.method === "POST" && req.url === "/api/chat") {
      const abort = new AbortController();
      res.on("close", () => abort.abort());
      const response = await POST(
        new Request(`http://localhost${req.url}`, {
          method: "POST",
          headers: req.headers,
          body: Readable.toWeb(req),
          duplex: "half",
          signal: abort.signal,
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      Readable.fromWeb(response.body).pipe(res);
      return;
    }

    res.writeHead(404).end("Not found");
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(PORT, () => console.log(`Digital Product AI running at http://localhost:${PORT}`));
