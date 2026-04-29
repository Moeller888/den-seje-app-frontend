import type { SupabaseClient } from "./supabase.ts";

// ── Signed upload URLs (for /init) ────────────────────────────────────────────

export async function createSignedUploadUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (error) {
    throw new Error(
      `Failed to create signed upload URL for ${bucket}/${path}: ${error.message}`,
    );
  }
  if (!data || typeof data.signedUrl !== "string" || data.signedUrl.trim() === "") {
    throw new Error(
      `Signed upload URL response for ${bucket}/${path} was empty`,
    );
  }
  return data.signedUrl;
}

// ── File download ─────────────────────────────────────────────────────────────

export async function downloadFileBytes(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error) {
    throw new Error(`Failed to download ${bucket}/${path}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Download of ${bucket}/${path} returned empty body`);
  }

  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

// ── File upload ───────────────────────────────────────────────────────────────

export async function uploadFileBytes(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Failed to upload to ${bucket}/${path}: ${error.message}`);
  }
}

// ── File deletion ─────────────────────────────────────────────────────────────

export async function deleteStorageFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(`Failed to delete ${bucket}/${path}: ${error.message}`);
  }
}
