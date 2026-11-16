import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const SYSTEM_PROMPT = readFileSync(new URL("../prompt.md", import.meta.url), "utf8");

const MODEL = process.env.MODEL || "claude-opus-5-5";
const EFFORT = process.env.EFFORT || "high";
const MAX_MESSAGES = 200;
const MAX_CHARS = 400_000;
// A long web-search turn can stop with "pause_turn"; resending it lets the server resume.
const MAX_CONTINUATIONS = 5;

let client;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function accessAllowed(request) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return true;
  const given = Buffer.from(request.headers.get("x-access-code") || "");
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return false;
  let chars = 0;
  for (const [i, m] of messages.entries()) {
    const role = i % 2 === 0 ? "user" : "assistant";
    if (!m || m.role !== role || typeof m.content !== "string" || !m.content.trim()) return false;
    chars += m.content.length;
  }
  return messages.length % 2 === 1 && chars <= MAX_CHARS;
}

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "The ANTHROPIC_API_KEY on the server was rejected.";
  if (err instanceof Anthropic.PermissionDeniedError) return `The API key cannot use this model or feature: ${err.message}`;
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Claude API. Wait a minute and try again.";
  if (err instanceof Anthropic.BadRequestError) return `The Claude API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the Claude API.";
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status}): ${err.message}`;
  return "Unexpected server error.";
}

export async function POST(request) {
  if (!accessAllowed(request)) return json(401, { error: "Access code required." });
  if (!process.env.ANTHROPIC_API_KEY) {
    return json(500, { error: "ANTHROPIC_API_KEY is not set on the server." });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Body must be JSON." });
  }
  if (!validMessages(body?.messages)) {
    return json(400, { error: "messages must alternate user/assistant text, starting and ending with user." });
  }

  client ??= new Anthropic();
  const messages = body.messages.map(({ role, content }) => ({ role, content }));
  const today = new Date().toISOString().slice(0, 10);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        for (let turn = 0; ; turn++) {
          const run = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 64000,
              system: `${SYSTEM_PROMPT}\nToday's date is ${today}.`,
              cache_control: { type: "ephemeral" },
              output_config: { effort: EFFORT },
              tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
              // If the model declines a request, the API re-runs it on a fallback model.
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
              messages,
            },
            { signal: request.signal },
          );

          for await (const event of run) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ type: "text", text: event.delta.text });
            } else if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
              send({ type: "status", text: "Searching the web…" });
            }
          }

          const message = await run.finalMessage();
          if (message.stop_reason === "pause_turn" && turn < MAX_CONTINUATIONS) {
            messages.push({ role: "assistant", content: message.content });
            continue;
          }
          if (message.stop_reason === "refusal") {
            send({ type: "error", message: "The model declined this request." });
          } else if (message.stop_reason === "max_tokens" || message.stop_reason === "pause_turn") {
            send({ type: "error", message: "The reply was cut off before it finished. Ask it to continue." });
          }
          break;
        }
        send({ type: "done" });
      } catch (err) {
        if (!request.signal.aborted) {
          console.error(err);
          send({ type: "error", message: describeError(err) });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // client already disconnected
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
