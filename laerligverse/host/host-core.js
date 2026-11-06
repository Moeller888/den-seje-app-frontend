// D-321: the Lærligverse HOST — plain JavaScript (no build), DOM-free so Node can test it.
//
// The host is the only party that holds the pupil's session and calls Lærlig's backend. The game runs on
// its own origin in an iframe and talks to the host only through laerligverse.bridge/2 (./bridge/, generated
// from the TypeScript source). Nothing here ever posts a token to the game: the bridge protocol has no field
// for one, and every outgoing message is validated by the bridge before it is sent.
import { BridgeHost, createLaerligTaskService } from "./bridge/index.js";

/**
 * A browser origin the host may trust: exactly `scheme://host[:port]`, ASCII only (an IDN such as
 * lærlig.dk must be written in punycode, as `event.origin` is), https — or http on loopback for local
 * development. Returns the origin unchanged or throws.
 * @param {unknown} origin
 * @returns {string}
 */
export function assertOrigin(origin) {
  if (typeof origin !== "string" || origin.length === 0 || origin.length > 200) throw new Error("origin: not a string");
  if (!/^[\x21-\x7e]+$/.test(origin)) throw new Error(`origin: must be ASCII (punycode), got ${JSON.stringify(origin)}`);
  let u;
  try {
    u = new URL(origin);
  } catch {
    throw new Error(`origin: not a URL: ${origin}`);
  }
  if (u.origin !== origin) throw new Error(`origin: must be exactly scheme://host[:port], got ${origin}`);
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && loopback)) throw new Error(`origin: https required (http only on loopback): ${origin}`);
  return origin;
}

/**
 * Session for the REAL Lærlig page: the existing supabase-js client (js/supabase.js) owns the session,
 * keeps it in its own storage and refreshes it. The host only asks for the current access token.
 * @param {{ auth: { getSession(): Promise<{ data: { session: { access_token?: string } | null } }>, signOut(): Promise<unknown>, onAuthStateChange?(cb: (event: string) => void): unknown } }} supabase
 */
export function supabaseSessionProvider(supabase) {
  let signedOut = false;
  supabase.auth.onAuthStateChange?.((event) => {
    if (event === "SIGNED_OUT") signedOut = true;
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") signedOut = false;
  });
  return {
    kind: "supabase",
    async getAccessToken() {
      if (signedOut) return null;
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      return typeof token === "string" && token.length > 0 ? token : null;
    },
    async signOut() {
      signedOut = true;
      await supabase.auth.signOut();
    },
  };
}

/**
 * LOCAL DEVELOPMENT AND TESTS ONLY: password sign-in against a local Supabase Auth (synthetic accounts).
 * Tokens are kept in this object's memory — never in storage, never in a URL — and refreshed shortly
 * before they expire. A failed refresh signs the pupil out.
 * @param {{ supabaseUrl: string, anonKey: string, fetchImpl?: typeof fetch, now?: () => number }} o
 */
export function passwordSessionProvider({ supabaseUrl, anonKey, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  let state = null; // { access, refresh, expiresAt }
  const listeners = new Set();
  const notify = (s) => listeners.forEach((f) => f(s));
  const grant = async (type, body) => {
    const res = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=${type}`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || typeof json.access_token !== "string") return null;
    return { access: json.access_token, refresh: json.refresh_token ?? null, expiresAt: now() + (Number(json.expires_in) || 3600) * 1000 };
  };
  return {
    kind: "password-local",
    /** @param {string} email @param {string} password */
    async signIn(email, password) {
      state = await grant("password", { email, password });
      notify(state ? "signed-in" : "failed");
      return state !== null;
    },
    async getAccessToken() {
      if (state === null) return null;
      if (state.expiresAt - now() < 60_000) {
        state = state.refresh ? await grant("refresh_token", { refresh_token: state.refresh }) : null;
        notify(state ? "refreshed" : "signed-out");
      }
      return state?.access ?? null;
    },
    async signOut() {
      const token = state?.access;
      state = null;
      notify("signed-out");
      if (token) await fetchImpl(`${supabaseUrl}/auth/v1/logout`, { method: "POST", headers: { apikey: anonKey, authorization: `Bearer ${token}` } }).catch(() => undefined);
    },
    /** @param {(s: string) => void} f */
    onChange(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
  };
}

/**
 * The EdgeCaller the backend adapter needs: a fresh access token for every call, and NO network request at
 * all when the pupil is signed out (the adapter turns the 401 into session_expired for the game).
 * Network failures propagate as exceptions (the adapter treats them as transient).
 * @param {{ supabaseUrl: string, anonKey: string, session: { getAccessToken(): Promise<string | null> }, fetchImpl?: typeof fetch }} o
 */
export function createEdgeCaller({ supabaseUrl, anonKey, session, fetchImpl = globalThis.fetch }) {
  return async (fn, body) => {
    if (fn !== "get-next-question" && fn !== "process-event") throw new Error(`edge caller: unknown function ${fn}`);
    const token = await session.getAccessToken();
    if (!token) return { status: 401, body: { error: "Unauthorized", reason: "signed_out" } };
    const res = await fetchImpl(`${supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: { apikey: anonKey, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

/**
 * Wires the bridge host to the real backend. Refuses to start unless `flags.laerligverseBackend === true`
 * (the flag is off by default; only an explicit configuration turns it on).
 * @param {{
 *   gameOrigin: string, gameWindow: unknown, postToGame: (m: unknown) => void,
 *   session: { getAccessToken(): Promise<string | null> }, supabaseUrl: string, anonKey: string,
 *   subject?: "historie" | "engelsk" | "dansk", flags: { laerligverseBackend: boolean },
 *   objectiveMap?: Record<string, string> | null, h5Submissions?: boolean,
 *   sequence?: { contextOfStep: Record<string, string> } | null,
 *   randomId: () => string, store?: { getItem(k: string): string | null, setItem(k: string, v: string): void, removeItem(k: string): void },
 *   onEvent?: (e: { type: string, reason?: string, code?: string }) => void, fetchImpl?: typeof fetch,
 * }} o
 */
export function createLaerligverseHost(o) {
  const gameOrigin = assertOrigin(o.gameOrigin);
  assertOrigin(new URL(o.supabaseUrl).origin);
  const call = createEdgeCaller({ supabaseUrl: o.supabaseUrl, anonKey: o.anonKey, session: o.session, fetchImpl: o.fetchImpl });
  // D-330: both extensions are OFF unless the (non-production) page configuration turns them on.
  const service = createLaerligTaskService(o.flags, {
    call,
    subject: o.subject ?? "historie",
    ...(o.objectiveMap ? { objectiveMap: o.objectiveMap } : {}),
    ...(o.h5Submissions === true ? { h5Submissions: true } : {}),
    // D-338: the server decides the step; this only maps it to the world's activity. Off unless configured.
    ...(o.sequence ? { sequence: o.sequence } : {}),
  });
  let destroyed = false;
  const host = new BridgeHost({
    gameOrigin,
    gameWindow: o.gameWindow,
    post: (m) => {
      if (!destroyed) o.postToGame(m);
    },
    service,
    randomId: o.randomId,
    store: o.store,
    onReject: (reason) => o.onEvent?.({ type: "reject", reason }),
    onServiceError: (err) => o.onEvent?.({ type: "service-error", code: err && typeof err === "object" && "code" in err ? String(err.code) : "unknown" }),
  });
  return {
    /** Feed every `message` event of the host window here. */
    handleMessage(e) {
      if (destroyed) return Promise.resolve();
      return host.onMessage({ origin: e.origin, source: e.source, data: e.data });
    },
    get sessionNonce() {
      return host.sessionNonce;
    },
    /** Stops all further replies (page unload, sign-out of the whole app). */
    destroy() {
      destroyed = true;
    },
  };
}
