// ── Azure Speech synthesis over WebSocket (157P) ─────────────────────────────
// The REST endpoint returns audio only. Word timings (WordBoundary) are only sent on the
// Speech WebSocket protocol, so the Worker speaks that protocol directly: one connection
// per clip, one SSML turn, collect the MP3 chunks and the word boundaries, close.
//
// The subscription key is sent as a request header from the Worker to Azure only. It never
// appears in a response, a log line or an error message.

import { TTS_BLANK, TTS_FORMAT } from "../js/read-aloud/tts-key.js";

export class TtsError extends Error {
  /** @param {string} code  stable, key-free code safe to return to the browser */
  constructor(code, detail) {
    super(code);
    this.name = "TtsError";
    this.code = code;
    this.detail = typeof detail === "string" ? detail : "";
  }
}

const TICKS_PER_MS = 10000; // Azure offsets are in 100 ns ticks

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Spoken length of a gap-fill blank (TTS_BLANK). */
export const BLANK_BREAK_MS = 600;

/** Escaped run text with every TTS_BLANK replaced by a fixed SSML pause. */
function ssmlText(text) {
  return String(text).split(TTS_BLANK).map(escapeXml).join('<break time="' + BLANK_BREAK_MS + 'ms"/>');
}

/** One <voice> element per language run, in order. Text is XML-escaped; blanks become pauses. */
export function buildSsml(canonical) {
  const runs = canonical && Array.isArray(canonical.segments) ? canonical.segments : [];
  const body = runs.map((run) => '<voice name="' + escapeXml(run.voice) + '">' + ssmlText(run.text) + "</voice>").join("");
  return '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="da-DK">' + body + "</speak>";
}

function requestId() {
  return globalThis.crypto.randomUUID().replace(/-/g, "");
}

function textMessage(path, contentType, rid, body) {
  return "Path: " + path + "\r\nX-RequestId: " + rid + "\r\nX-Timestamp: " + new Date().toISOString() +
    "\r\nContent-Type: " + contentType + "\r\n\r\n" + body;
}

function parseHeaders(block) {
  const headers = {};
  for (const line of block.split("\r\n")) {
    const at = line.indexOf(":");
    if (at > 0) headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }
  return headers;
}

/** Split a text frame into its headers and body. */
export function parseTextFrame(data) {
  const text = String(data);
  const split = text.indexOf("\r\n\r\n");
  if (split < 0) return { headers: parseHeaders(text), body: "" };
  return { headers: parseHeaders(text.slice(0, split)), body: text.slice(split + 4) };
}

/** Binary frame: 2-byte big-endian header length, the header text, then audio bytes. */
export function parseBinaryFrame(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 2) return { headers: {}, audio: new Uint8Array(0) };
  const headerLength = (bytes[0] << 8) | bytes[1];
  const headerEnd = Math.min(bytes.length, 2 + headerLength);
  const headers = parseHeaders(new TextDecoder().decode(bytes.subarray(2, headerEnd)));
  return { headers, audio: bytes.subarray(headerEnd) };
}

/** WordBoundary entries of one audio.metadata body → [{w, t, d}] in milliseconds. */
export function wordBoundariesFrom(body) {
  let parsed;
  try { parsed = JSON.parse(body); } catch (_e) { return []; }
  const items = parsed && Array.isArray(parsed.Metadata) ? parsed.Metadata : [];
  const words = [];
  for (const item of items) {
    if (!item || item.Type !== "WordBoundary" || !item.Data) continue;
    const data = item.Data;
    const text = data.text && typeof data.text.Text === "string" ? data.text.Text : "";
    const boundaryType = data.text && typeof data.text.BoundaryType === "string" ? data.text.BoundaryType : "WordBoundary";
    if (!text || boundaryType !== "WordBoundary") continue;
    const offset = Number(data.Offset);
    const duration = Number(data.Duration);
    if (!Number.isFinite(offset) || offset < 0) continue;
    words.push({
      w: text,
      t: Math.round(offset / TICKS_PER_MS),
      d: Number.isFinite(duration) && duration > 0 ? Math.round(duration / TICKS_PER_MS) : 0,
    });
  }
  return words;
}

/** Default connector: an outbound WebSocket from the Worker (fetch with Upgrade). */
async function connectWorkerSocket(url, headers) {
  const response = await fetch(url, { headers: { ...headers, Upgrade: "websocket" } });
  const socket = response.webSocket;
  if (!socket) throw new TtsError(response.status === 401 || response.status === 403 ? "azure_auth" : "azure_connect", String(response.status));
  socket.accept();
  return socket;
}

/**
 * Synthesise one canonical request.
 * @param {object} canonical            from canonicalTtsRequest()
 * @param {{key:string, region:string, timeoutMs?:number,
 *          connect?:(url:string, headers:Record<string,string>) => Promise<any>}} config
 * @returns {Promise<{audio:Uint8Array, words:{w:string,t:number,d:number}[]}>}
 */
export async function synthesizeAzure(canonical, config) {
  const cfg = config && typeof config === "object" ? config : {};
  if (typeof cfg.key !== "string" || cfg.key.length === 0) throw new TtsError("azure_not_configured");
  if (typeof cfg.region !== "string" || !/^[a-z0-9]+$/.test(cfg.region)) throw new TtsError("azure_not_configured");
  const connect = typeof cfg.connect === "function" ? cfg.connect : connectWorkerSocket;
  const timeoutMs = Number.isFinite(cfg.timeoutMs) ? cfg.timeoutMs : 20000;

  const connectionId = requestId();
  const url = "https://" + cfg.region + ".tts.speech.microsoft.com/cognitiveservices/websocket/v1?X-ConnectionId=" + connectionId;
  const socket = await connect(url, { "Ocp-Apim-Subscription-Key": cfg.key, "X-ConnectionId": connectionId });

  return await new Promise((resolve, reject) => {
    const chunks = [];
    const words = [];
    let settled = false;
    let queue = Promise.resolve();

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(1000, "done"); } catch (_e) { /* already closed */ }
      if (error) { reject(error); return; }
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (total === 0) { reject(new TtsError("azure_empty_audio")); return; }
      const audio = new Uint8Array(total);
      let at = 0;
      for (const chunk of chunks) { audio.set(chunk, at); at += chunk.length; }
      resolve({ audio, words });
    }

    const timer = setTimeout(() => finish(new TtsError("azure_timeout")), timeoutMs);

    function handle(data) {
      if (typeof data === "string") {
        const frame = parseTextFrame(data);
        const path = frame.headers.path || "";
        if (path === "audio.metadata") words.push(...wordBoundariesFrom(frame.body));
        else if (path === "turn.end") finish(null);
        return;
      }
      const frame = parseBinaryFrame(data);
      if ((frame.headers.path || "") === "audio" && frame.audio.length > 0) chunks.push(frame.audio.slice());
    }

    socket.addEventListener("message", (event) => {
      const data = event ? event.data : null;
      queue = queue.then(async () => {
        if (settled) return;
        if (data && typeof data === "object" && typeof data.arrayBuffer === "function" && !(data instanceof ArrayBuffer)) {
          handle(await data.arrayBuffer());
        } else {
          handle(data);
        }
      }).catch(() => finish(new TtsError("azure_protocol")));
    });
    socket.addEventListener("close", (event) => {
      queue.then(() => {
        const code = event && Number(event.code);
        finish(new TtsError(code === 1007 || code === 1008 ? "azure_rejected" : "azure_closed", String(code)));
      });
    });
    socket.addEventListener("error", () => finish(new TtsError("azure_socket")));

    try {
      const rid = requestId();
      socket.send(textMessage("speech.config", "application/json", rid, JSON.stringify({
        context: {
          system: { name: "SpeechSDK", version: "1.43.0", build: "JavaScript", lang: "JavaScript" },
          os: { platform: "Cloudflare Workers", name: "workerd", version: "1" },
        },
      })));
      socket.send(textMessage("synthesis.context", "application/json", rid, JSON.stringify({
        synthesis: {
          audio: {
            metadataOptions: {
              bookmarkEnabled: false,
              punctuationBoundaryEnabled: false,
              sentenceBoundaryEnabled: false,
              sessionEndEnabled: true,
              visemeEnabled: false,
              wordBoundaryEnabled: true,
            },
            outputFormat: TTS_FORMAT,
          },
          language: { autoDetection: false },
        },
      })));
      socket.send(textMessage("ssml", "application/ssml+xml", rid, buildSsml(canonical)));
    } catch (_e) {
      finish(new TtsError("azure_socket"));
    }
  });
}
