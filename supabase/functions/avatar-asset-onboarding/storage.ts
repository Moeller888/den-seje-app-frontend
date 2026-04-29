import type { SupabaseClient } from "./supabase.ts";

const BUCKET = "avatar-assets";

export interface StorageVerificationResult {
  exists: boolean;
  error: string | null;
}

// Verify that a file exists at the given path in the avatar-assets bucket.
// Uses a directory listing narrowed by filename — does not download the file.
export async function verifyAssetFileExists(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<StorageVerificationResult> {
  if (!storagePath || storagePath.trim() === "") {
    return { exists: false, error: "storage_path is empty" };
  }

  const normalised = storagePath.trim().replace(/^\/+/, "");
  const lastSlash = normalised.lastIndexOf("/");
  const dir = lastSlash === -1 ? "" : normalised.slice(0, lastSlash);
  const filename = lastSlash === -1 ? normalised : normalised.slice(lastSlash + 1);

  if (!filename) {
    return { exists: false, error: "storage_path resolves to an empty filename" };
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(dir, { search: filename, limit: 1 });

  if (error) {
    return {
      exists: false,
      error: `Storage lookup failed: ${error.message}`,
    };
  }

  if (!data || data.length === 0) {
    return {
      exists: false,
      error: `File not found at "${storagePath}" in bucket "${BUCKET}"`,
    };
  }

  const match = data.find((f) => f.name === filename);
  if (!match) {
    return {
      exists: false,
      error: `File "${filename}" not found at path "${storagePath}" in bucket "${BUCKET}"`,
    };
  }

  return { exists: true, error: null };
}

// Return the public URL for an asset file.
// Does not verify existence — call verifyAssetFileExists first if needed.
export function getAssetFileUrl(supabase: SupabaseClient, storagePath: string): string {
  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath.trim().replace(/^\/+/, ""));
  return data.publicUrl;
}
