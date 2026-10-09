// A stand-in for the CDN's @supabase/supabase-js ESM build, for SELF-SERVED specs that must never
// reach the real project. js/supabase.js imports createClient from cdn.jsdelivr.net; a spec routes
// that URL to FAKE_SUPABASE_MODULE, and every *.supabase.co request is aborted on top.
//
// The fake is driven by `window.__FAKE` (installed with page.addInitScript before navigation):
//
//   session        { user: { id } } | null
//   profile        the row returned for any profiles .maybeSingle() read
//   students       get_teacher_visibility rows (also mapped for get_my_students)
//   rosterError    when set, get_teacher_visibility returns this as `error`
//   instances      question_instances rows for the review-queue query
//   longQuestionIds  ids of questions whose answer_type is 'long'
//   createResponse  "ok" | { status, code } — what create-student answers
//   signInError    when set, signInWithPassword fails with it
//
// Everything the page does is recorded on `window.__FAKE.log` so a spec can assert on it.
export const FAKE_SUPABASE_MODULE = String.raw`
const F = () => window.__FAKE;
// Recorded on the page AND reported to the spec (window.__fakeReport, an exposed binding), so a
// spec can still see what happened after the page navigated away.
const log = (entry) => {
  F().log = F().log || [];
  F().log.push(entry);
  try { if (window.__fakeReport) window.__fakeReport(JSON.parse(JSON.stringify(entry))); } catch (e) {}
};

// A sign-in survives navigation within the tab, as a real persisted session would.
const SESSION_KEY = "__fake_session";
function currentSession() {
  if (F().session) return F().session;
  try { const s = sessionStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

function resolveQuery(table, ops, mode) {
  const f = F();
  const sel = (ops.find(o => o.op === "select") || {}).args?.[0] || "";
  const ins = ops.filter(o => o.op === "in");

  if (table === "profiles") {
    if (ops.some(o => o.op === "update")) return { data: null, error: null };
    // The review queue resolves the teacher's own pupils: profiles where teacher_id = caller.
    if (mode === "many" && ops.some(o => o.op === "eq" && o.args[0] === "teacher_id")) {
      return { data: (f.students || []).map(s => ({ id: s.student_id })), error: null };
    }
    return { data: f.profile ?? null, error: null, status: f.profile ? 200 : 406 };
  }

  if (table === "question_instances") {
    // The engagement panel's activity query filters on answered=true; the review queue does not.
    if (ops.some(o => o.op === "eq" && o.args[0] === "answered")) return { data: [], error: null };
    const ids = (ins.find(o => o.args[0] === "student_id") || { args: [null, []] }).args[1];
    const rows = (f.instances || []).filter(r =>
      ids.includes(r.student_id) && r.teacher_score == null && r.user_answer != null);
    return { data: rows, error: null };
  }

  if (table === "questions") {
    const ids = (ins.find(o => o.args[0] === "id") || { args: [null, []] }).args[1];
    const isLongFilter = ops.some(o => o.op === "eq" && o.args[0] === "answer_type" && o.args[1] === "long");
    const longIds = f.longQuestionIds || [];
    return { data: ids.filter(id => !isLongFilter || longIds.includes(id)).map(id => ({ id })), error: null };
  }

  return { data: mode === "single" ? null : [], error: null };
}

function builder(table) {
  const ops = [];
  const chain = {};
  for (const op of ["select", "eq", "neq", "in", "is", "not", "gte", "lte", "order", "limit", "update", "insert", "upsert"]) {
    chain[op] = (...args) => { ops.push({ op, args }); return chain; };
  }
  chain.maybeSingle = async () => { log({ table, ops, mode: "single" }); return resolveQuery(table, ops, "single"); };
  chain.single = chain.maybeSingle;
  chain.then = (res, rej) => {
    log({ table, ops, mode: "many" });
    return Promise.resolve(resolveQuery(table, ops, "many")).then(res, rej);
  };
  return chain;
}

export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: currentSession() }, error: null }),
      signInWithPassword: async (creds) => {
        log({ auth: "signIn", email: creds.email });
        if (F().signInError) return { data: null, error: { message: F().signInError } };
        F().session = F().session || { user: { id: "student-1" } };
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(F().session)); } catch (e) {}
        return { data: { session: F().session }, error: null };
      },
      updateUser: async (attrs) => { log({ auth: "updateUser", hasPassword: typeof attrs.password === "string" }); return { data: {}, error: null }; },
      signOut: async () => {
        log({ auth: "signOut" });
        F().session = null;
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        return { error: null };
      },
      setSession: async () => ({ data: null, error: { message: "stub" } }),
      resetPasswordForEmail: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (table) => builder(table),
    rpc: async (fn, args) => {
      log({ rpc: fn, args });
      const f = F();
      if (fn === "get_teacher_visibility") {
        if (f.rosterError) return { data: null, error: { message: f.rosterError } };
        return { data: (f.students || []).map(s => ({ ...s })), error: null };
      }
      if (fn === "get_my_students") {
        return { data: (f.students || []).map(s => ({
          student_id: s.student_id, display_name: s.display_name, xp: 0, prestige_score: 0,
          spotlight_label: null, spotlight_message: null, spotlight_set_at: null })), error: null };
      }
      return { data: null, error: null };
    },
    functions: {
      invoke: async (name, opts) => {
        const f = F();
        log({ invoke: name, body: opts?.body });
        if (name !== "create-student") return { data: null, error: { message: "unknown function" } };
        const r = f.createResponse ?? "ok";
        if (r === "ok") {
          const email = String(opts.body.email);
          f.students = f.students || [];
          f.students.push({
            student_id: "new-" + f.students.length, display_name: email.split("@")[0],
            selected_grade: null, placement_band: null, current_band: 1, total_attempts: 0,
            recent_correct_pct: 0, trend: "stable", active_domains: null });
          return { data: { success: true }, error: null };
        }
        const res = new Response(JSON.stringify({ error: r.code }), {
          status: r.status, headers: { "Content-Type": "application/json" } });
        return { data: null, error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: res } };
      },
    },
  };
}
`;

export const TEACHER_ID = "t-0000";

export function student(over: Record<string, unknown>) {
  return {
    student_id: "s-x", display_name: "elev", selected_grade: 7, placement_band: 3, current_band: 3,
    total_attempts: 12, recent_correct_pct: 75, trend: "stable", active_domains: null,
    ...over,
  };
}

// Three pupils: one placed, one who has chosen a grade but not finished placement, one brand new.
export const THREE_STUDENTS = [
  student({ student_id: "s-anna", display_name: "anna.h", selected_grade: 7, placement_band: 2, current_band: 3 }),
  student({ student_id: "s-bo",   display_name: "bo.k",   selected_grade: 8, placement_band: null, current_band: 1, total_attempts: 0 }),
  student({ student_id: "s-cy",   display_name: "cy.l",   selected_grade: null, placement_band: null, current_band: 1, total_attempts: 0 }),
];
