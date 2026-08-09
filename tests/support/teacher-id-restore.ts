// Section 173: safe capture/restore of the test student's teacher_id.
//
// Extracted from password-help.spec.ts so the dangerous paths can be exercised with fakes. The
// spec imports the same module the tests do.
//
// THE BUG THIS EXISTS TO PREVENT
// The previous version stored the original value in a single `string | null`, where null meant
// BOTH "the original was null" and "we never managed to read it". If beforeAll failed after the
// student id was resolved but before the lookup succeeded, afterAll would then write
// teacher_id = null onto a real student — and report success, because it compared null to null.
//
// Here "captured" is tracked separately from the value, and a restore may never write unless a
// value was actually captured.

export interface RestoreDeps {
  // Must throw on a query error. Returning null means the row exists and the column is null.
  readTeacherId(studentId: string): Promise<string | null>;
  // Must throw on a write error.
  writeTeacherId(studentId: string, value: string | null): Promise<void>;
}

export interface RestoreState {
  captured: boolean;
  original: string | null;
  mutationAttempted: boolean;
  mutationConfirmed: boolean;
}

export function createRestoreState(): RestoreState {
  return { captured: false, original: null, mutationAttempted: false, mutationConfirmed: false };
}

// Captures the original value. `captured` flips only after a successful, error-checked read, so
// a throw here leaves the state provably uncaptured.
export async function captureOriginal(
  studentId: string,
  deps: RestoreDeps,
  state: RestoreState,
): Promise<string | null> {
  const value = await deps.readTeacherId(studentId);
  state.original = value;
  state.captured = true;
  return value;
}

// Call before deliberately changing teacher_id, so cleanup knows a restore is required even if
// the mutation itself later fails halfway.
export function markMutationAttempted(state: RestoreState): void {
  state.mutationAttempted = true;
}

export function markMutationConfirmed(state: RestoreState): void {
  state.mutationConfirmed = true;
}

// Never throws. Returns null on success, or a message describing what went wrong, so a cleanup
// failure can be reported ALONGSIDE a primary test failure rather than replacing it.
export async function restoreOriginal(
  studentId: string,
  deps: RestoreDeps,
  state: RestoreState,
): Promise<string | null> {
  if (!state.captured) {
    // Never write a value we do not know. Writing the sentinel would corrupt a real row.
    if (state.mutationAttempted) {
      return "cannot restore teacher_id: a mutation was attempted but the original value was " +
             "never captured — refusing to write. Restore this student manually.";
    }
    return null; // nothing was changed and nothing is known: there is nothing to undo
  }

  try {
    await deps.writeTeacherId(studentId, state.original);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return `restore update failed: ${message}`;
  }

  let observed: string | null;
  try {
    observed = await deps.readTeacherId(studentId);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return `restore verification read failed: ${message}`;
  }

  if (observed !== state.original) {
    return "restore verification failed: teacher_id does not match the captured original";
  }

  return null;
}
