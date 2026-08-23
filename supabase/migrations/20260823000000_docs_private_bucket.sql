-- Internal documentation delivery: a PRIVATE storage bucket, readable only by super_admin.
--
-- WHY STORAGE AND NOT THE CDN. The frontend is an asset-only Cloudflare Worker, so anything the
-- build publishes is world-readable. The decision register and the 167A specs carry pilot details
-- and per-cohort counts, so they must never become static assets: a client-side role check in
-- docs.html would gate the PAGE while leaving /docs/<file>.md fetchable by anyone. Putting the
-- files in a private bucket moves the check to where it cannot be bypassed — Postgres RLS — and
-- keeps CDN exposure at exactly zero, which is what it is today.
--
-- WHO CAN READ. `super_admin` only. Teachers and students have no reason to read the register, and
-- the app's role model already lives in public.profiles.role.
--
-- WHO CAN WRITE. Nobody through this policy. Uploads run from tools/publish-docs.mjs with the
-- service role, which bypasses RLS; there is deliberately no INSERT/UPDATE/DELETE policy, so a
-- compromised super_admin session cannot alter what the documentation says.

insert into storage.buckets (id, name, public)
values ('docs', 'docs', false)
on conflict (id) do update set public = false;

drop policy if exists "docs_read_super_admin" on storage.objects;

create policy "docs_read_super_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'docs'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
  )
);
