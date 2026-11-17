// THE GUARDED SERVICE-ROLE CLIENT (A3).
//
// The Playwright suite needs the service-role key to set up and reset its own test accounts. That
// key bypasses RLS, so a wrong id, an empty filter or a forgotten `.eq()` would write to ANY row in
// production. Every service-role use in tests/ therefore goes through guardAdminClient(), which
// keeps the supabase-js call shapes the specs already use and refuses everything else:
//
//   reads    .from(t).select(…) and auth.admin.listUsers/getUserById pass through unchanged.
//   update   .from(t).update(v)/.delete()/.insert(r)/.upsert(r) are RECORDED, not sent. On await
//   delete   they are checked, the accounts are confirmed (below), and only then replayed on the real
//   insert   client. Only eq/in/match/select/single/maybeSingle may be chained onto a write: neq, gt,
//   upsert   like, or, not, filter, order, limit, … are refused at once.
//   tables   only reviewed per-user tables (OWNER_COLUMN). profiles may only be UPDATED: the suite
//            never creates or deletes an account's profile.
//   filters  update/delete need at least one filter on the table's owner column (eq/in/match) whose
//            values are all verified account ids (valid UUIDs, never an empty list).
//   rows     every inserted/upserted row carries the owner column = a verified id; upsert must
//            resolve conflicts on a column set that contains the owner column.
//   values   any id-like column written (id, student_id, user_id, teacher_id) must be null or a
//            verified id; teacher_id only a verified TEACHER; `role` only the target's expected role
//            (a test account can never be given another role, let alone super_admin).
//   auth     only auth.admin.updateUserById(<verified pupil/teacher id>, { password }) may write.
//            createUser, deleteUser, inviteUserByEmail, generateLink, … are refused: the suite never
//            creates or deletes users (A2).
//   other    rpc, functions, storage, schema, channel, … — refused. Any property the guard does not
//            know is refused, so a new supabase-js API cannot slip past it.
//
// CONFIRMATION. `verified` is only a list of ids. Before the FIRST write is sent the guard awaits
// `confirm()` once (memoised); every write waits for it and none is sent if it rejects. For specs,
// tests/e2e-admin.mjs passes a confirm() that re-runs the read-only account verification and
// requires the same four ids, so a hand-made E2E_VERIFIED_ACCOUNTS record naming other users can
// never lead to a write. global-setup, which has just verified, passes a confirm() that resolves.
//
// A refusal throws (or rejects) an E2EGuardError: loud, never a silent no-op. Nothing is sent first.
// Plain ESM, no dependencies: tests/unit/e2e-guard.test.mjs drives it with a fake client.

import { ACCOUNT_KINDS, isUuid } from "./e2e-accounts.mjs";

export class E2EGuardError extends Error {
  constructor(message) {
    super(`E2E-vagt: ${message}`);
    this.name = "E2EGuardError";
  }
}

// Reviewed per-user tables → the column that names the account a row belongs to. (Built from pairs:
// tests/unit/credential-hygiene.test.mjs reads `password…: "<literal>"` as a credential assignment.)
export const OWNER_COLUMN = Object.freeze(Object.fromEntries([
  ["profiles", "id"],
  ["question_instances", "student_id"],
  ["daily_login_rewards", "student_id"],
  ["user_items", "user_id"],
  ["student_progress", "student_id"],
  ["student_quest_progress", "student_id"],
  ["student_weekly_quest_progress", "student_id"],
  ["user_achievements", "student_id"],
  ["password_help_requests", "student_id"],
]));
// Tables whose rows are an account's identity: update only, never insert/upsert/delete.
export const UPDATE_ONLY_TABLES = Object.freeze(["profiles"]);
export const ID_COLUMNS = Object.freeze(["id", "student_id", "user_id", "teacher_id"]);
export const WRITE_CHAIN = Object.freeze(["eq", "in", "match", "select", "single", "maybeSingle"]);
export const INSERT_CHAIN = Object.freeze(["select", "single", "maybeSingle"]);
export const PASSWORD_KINDS = Object.freeze(["primary", "teacher", "student2"]);

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function refuse(message) {
  throw new E2EGuardError(message);
}

function checkVerified(verified) {
  if (!verified || typeof verified !== "object" || !verified.ids || !verified.roles) refuse("ingen verificerede konti");
  for (const kind of ACCOUNT_KINDS) if (!isUuid(verified.ids[kind])) refuse(`verificeret ${kind} er ikke et UUID`);
  if (new Set(ACCOUNT_KINDS.map((k) => verified.ids[k])).size !== ACCOUNT_KINDS.length) refuse("verificerede id'er er ikke forskellige");
}

// Wrap `raw` (a supabase-js service-role client). `verified` comes from readVerified()/verifyAccounts().
// `confirm` (required): async check awaited once before the first write is sent.
export function guardAdminClient(raw, verified, { confirm } = {}) {
  if (!raw || typeof raw.from !== "function" || !raw.auth?.admin) refuse("ingen gyldig klient");
  checkVerified(verified);
  if (typeof confirm !== "function") refuse("ingen bekræftelse af kontiene (confirm mangler)");
  const ids = new Set(ACCOUNT_KINDS.map((k) => verified.ids[k]));
  const roleOf = (id) => verified.roles[id];
  const kindOf = (id) => ACCOUNT_KINDS.find((k) => verified.ids[k] === id);
  const isVerified = (v) => isUuid(v) && ids.has(v);

  let confirmation = null;
  const confirmed = () => {
    if (confirmation === null) confirmation = Promise.resolve().then(() => confirm());
    return confirmation;
  };

  function checkTable(table, method) {
    if (typeof table !== "string" || !has(OWNER_COLUMN, table)) {
      refuse(`skrivning til tabellen ${JSON.stringify(table)} er ikke gennemgået`);
    }
    if (method !== "update" && UPDATE_ONLY_TABLES.includes(table)) refuse(`${table}.${method}: tabellen må kun opdateres`);
    return OWNER_COLUMN[table];
  }

  // Values written to a row (update values or an inserted row), given the row's owner id(s).
  function checkValues(table, values, ownerIds, { isInsert }) {
    if (!isPlainObject(values)) refuse(`${table}: værdierne skal være ét objekt`);
    const owner = OWNER_COLUMN[table];
    if (!isInsert && has(values, owner)) refuse(`${table}: ejerkolonnen ${owner} må ikke ændres`);
    for (const col of ID_COLUMNS) {
      if (!has(values, col)) continue;
      if (col === owner && isInsert) continue; // checked by the caller
      const v = values[col];
      if (v === null) continue;
      if (!isVerified(v)) refuse(`${table}.${col}: må kun pege på en verificeret testkonto`);
      if (col === "teacher_id" && roleOf(v) !== "teacher") refuse(`${table}.teacher_id: skal være en verificeret testlærer`);
    }
    if (has(values, "role")) {
      if (table !== "profiles") refuse(`${table}: kolonnen role kan ikke skrives`);
      for (const id of ownerIds) {
        if (values.role !== roleOf(id)) refuse(`profiles.role: ${kindOf(id)} kan kun have rollen "${roleOf(id)}"`);
      }
    }
  }

  // A recorded write: chain methods are collected, `validate` runs on await, then the accounts are
  // confirmed, then `send(chain)` replays everything on the real client.
  function deferred(label, allowed, validate, send) {
    const chain = [];
    const builder = {};
    for (const name of allowed) {
      builder[name] = (...args) => { chain.push([name, args]); return proxy; };
    }
    builder.then = (onFulfilled, onRejected) => {
      let p;
      try {
        validate(chain);
        p = confirmed().then(() => send(chain));
      } catch (e) {
        p = Promise.reject(e);
      }
      return p.then(onFulfilled, onRejected);
    };
    builder.catch = (onRejected) => builder.then(undefined, onRejected);
    builder.finally = (f) => builder.then((v) => { f?.(); return v; }, (e) => { f?.(); throw e; });
    const proxy = new Proxy(builder, {
      get(target, prop) {
        if (has(target, prop)) return target[prop];
        if (typeof prop === "symbol") return undefined;
        refuse(`${label}: .${String(prop)}() er ikke tilladt i en skrivning (kun ${allowed.join(", ")})`);
      },
    });
    return proxy;
  }

  const replay = (q, chain) => {
    for (const [name, args] of chain) q = q[name](...args);
    return q;
  };

  function guardedInsert(table, method, rows, opts) {
    const owner = checkTable(table, method);
    const list = Array.isArray(rows) ? rows : [rows];
    if (list.length === 0) refuse(`${table}.${method}: ingen rækker`);
    for (const row of list) {
      if (!isPlainObject(row)) refuse(`${table}.${method}: hver række skal være ét objekt`);
      if (!isVerified(row[owner])) refuse(`${table}.${method}: ${owner} skal være en verificeret testkonto`);
      checkValues(table, row, [row[owner]], { isInsert: true });
    }
    if (opts !== undefined && !isPlainObject(opts)) refuse(`${table}.${method}: ugyldige indstillinger`);
    if (method === "upsert") {
      const conflict = opts && typeof opts.onConflict === "string" ? opts.onConflict.split(",").map((c) => c.trim()) : [];
      if (!conflict.includes(owner)) refuse(`${table}.upsert: onConflict skal omfatte ejerkolonnen ${owner}`);
    }
    return deferred(`${table}.${method}`, INSERT_CHAIN, () => {}, (chain) => replay(raw.from(table)[method](rows, opts), chain));
  }

  // update/delete: record the chain, validate on await, then replay on the real client.
  function guardedWrite(table, method, values, opts) {
    const owner = checkTable(table, method);
    if (method === "update" && !isPlainObject(values)) refuse(`${table}.update: værdierne skal være ét objekt`);
    if (opts !== undefined && !isPlainObject(opts)) refuse(`${table}.${method}: ugyldige indstillinger`);
    const validate = (chain) => {
      const targets = [];
      let ownerFilters = 0;
      for (const [name, args] of chain) {
        if ((name === "eq" || name === "in") && typeof args[0] !== "string") refuse(`${table}.${method}: ugyldig filterkolonne`);
        if (name === "eq" && args[0] === owner) { ownerFilters++; targets.push(args[1]); }
        if (name === "in" && args[0] === owner) {
          ownerFilters++;
          if (!Array.isArray(args[1]) || args[1].length === 0) refuse(`${table}.${method}: in(${owner}) kræver en ikke-tom liste`);
          targets.push(...args[1]);
        }
        if (name === "match") {
          if (!isPlainObject(args[0])) refuse(`${table}.${method}: match kræver ét objekt`);
          if (has(args[0], owner)) { ownerFilters++; targets.push(args[0][owner]); }
        }
      }
      if (ownerFilters === 0) refuse(`${table}.${method}: uden filter på ejerkolonnen ${owner} (ufiltreret eller bred skrivning)`);
      for (const t of targets) {
        if (!isUuid(t)) refuse(`${table}.${method}: ${owner} er ikke et gyldigt UUID`);
        if (!ids.has(t)) refuse(`${table}.${method}: ${owner} er ikke en verificeret testkonto`);
      }
      if (method === "update") checkValues(table, values, [...new Set(targets)], { isInsert: false });
    };
    const send = (chain) => replay(method === "update" ? raw.from(table).update(values, opts) : raw.from(table).delete(opts), chain);
    return deferred(`${table}.${method}`, WRITE_CHAIN, validate, send);
  }

  function table(name) {
    const t = {
      select: (...args) => raw.from(name).select(...args),
      insert: (rows, opts) => guardedInsert(name, "insert", rows, opts),
      upsert: (rows, opts) => guardedInsert(name, "upsert", rows, opts),
      update: (values, opts) => guardedWrite(name, "update", values, opts),
      delete: (opts) => guardedWrite(name, "delete", undefined, opts),
    };
    return new Proxy(t, {
      get(target, prop) {
        if (has(target, prop)) return target[prop];
        if (typeof prop === "symbol") return undefined;
        refuse(`.from(${JSON.stringify(name)}).${String(prop)} er ikke tilladt`);
      },
    });
  }

  const admin = {
    listUsers: (...args) => raw.auth.admin.listUsers(...args),
    getUserById: (...args) => raw.auth.admin.getUserById(...args),
    updateUserById: (id, attributes) => {
      if (!isVerified(id)) return Promise.reject(new E2EGuardError("updateUserById: kun verificerede testkonti"));
      if (!PASSWORD_KINDS.includes(kindOf(id))) return Promise.reject(new E2EGuardError(`updateUserById: ${kindOf(id)} har ingen adgangskode`));
      if (!isPlainObject(attributes) || Object.keys(attributes).join(",") !== "password"
        || typeof attributes.password !== "string" || attributes.password === "") {
        return Promise.reject(new E2EGuardError("updateUserById: kun { password } må ændres"));
      }
      const password = attributes.password;
      return confirmed().then(() => raw.auth.admin.updateUserById(id, { password }));
    },
  };
  const adminProxy = new Proxy(admin, {
    get(target, prop) {
      if (has(target, prop)) return target[prop];
      if (typeof prop === "symbol") return undefined;
      refuse(`auth.admin.${String(prop)} er ikke tilladt (testkørslen opretter, sletter og inviterer aldrig brugere)`);
    },
  });
  const auth = new Proxy({ admin: adminProxy }, {
    get(target, prop) {
      if (prop === "admin") return target.admin;
      if (typeof prop === "symbol") return undefined;
      refuse(`auth.${String(prop)} er ikke tilladt på service-role-klienten`);
    },
  });
  const client = { from: (name) => table(name), auth };
  return new Proxy(client, {
    get(target, prop) {
      if (has(target, prop)) return target[prop];
      if (typeof prop === "symbol") return undefined;
      // Thenable probes (await client) and inspection must not throw.
      if (prop === "then" || prop === "toJSON" || prop === "constructor") return undefined;
      refuse(`.${String(prop)} er ikke tilladt på service-role-klienten (kun from og auth.admin)`);
    },
  });
}
