# Sourced by .github/workflows/isolated-e2e.yml (bash). Which registry the Supabase CLI pulls its images from,
# and when to switch to the next one. No loop and no retry of its own: the workflow's two bounded start loops
# (stack: 4 attempts, Edge Runtime: 3) are the only retries, exactly as before.
#
# WHY (CI stability, 2026-11-19): Docker Hub limits anonymous pulls to 100 per hour per IP address
# ("ratelimit-limit: 100;w=3600"), and GitHub-hosted runners share addresses. Run 44384257941 (2026-11-18) failed
# all three Edge Runtime starts on "toomanyrequests" for supabase/edge-runtime:v1.73.13 within one minute: a retry
# against the same registry cannot succeed inside the hour, so a pull failure moves the NEXT attempt to the
# next registry instead.
#
# SAME CONTENT, NOT A DIFFERENT IMAGE: public.ecr.aws is the Supabase CLI's own default registry and ghcr.io
# Supabase's mirror. On 2026-11-19 the manifest digest of every image the isolated stack runs was identical in all
# three (registry API, read-only): supabase/postgres:17.6.1.063, kong:2.8.1, mailpit:v1.22.3, postgrest:v14.1,
# gotrue:v2.188.1, realtime:v2.86.3, storage-api:v1.54.0, edge-runtime:v1.73.13. Every run logs the digest of
# each running Supabase container (iso_audit_images), so a run can be compared with that list. No credential is
# used anywhere: all three are anonymous pulls of public images.
#
# A failure that is NOT a pull failure (the runtime container dying while booting — SIGBUS, run 40650983690 —
# or a port conflict) keeps the registry: switching would only re-download the same image.

ISO_REGISTRIES=(docker.io public.ecr.aws ghcr.io)
iso_registry_index=0
# A later step starts from the registry an earlier step ended on (exported to $GITHUB_ENV); an unknown value
# starts from the first.
for iso_i in "${!ISO_REGISTRIES[@]}"; do
  if [ "${ISO_REGISTRIES[$iso_i]}" = "${SUPABASE_INTERNAL_IMAGE_REGISTRY:-}" ]; then iso_registry_index=$iso_i; fi
done
unset iso_i

# Exports the registry for the next CLI call (the CLI reads SUPABASE_INTERNAL_IMAGE_REGISTRY).
iso_use_registry() {
  export SUPABASE_INTERNAL_IMAGE_REGISTRY="${ISO_REGISTRIES[$iso_registry_index]}"
}

# Prints the class of a failed attempt from its log: rate-limit | pull | other.
iso_failure_class() {
  local log="$1"
  if [ ! -f "$log" ]; then echo other; return 0; fi
  if grep -qiE 'toomanyrequests|rate ?limit' "$log"; then echo rate-limit; return 0; fi
  if grep -qiE 'failed to pull|error pulling image|pull access denied|manifest unknown|TLS handshake timeout|i/o timeout|no such host|connection reset by peer|unexpected EOF' "$log"; then echo pull; return 0; fi
  echo other
}

# After a failed attempt: classify it into ISO_FAILURE_CLASS and move to the next registry only for a pull failure.
# Call it directly, never as $(iso_after_failure …): a command substitution is a subshell, and the move would be lost.
iso_after_failure() {
  ISO_FAILURE_CLASS=$(iso_failure_class "$1")
  if [ "$ISO_FAILURE_CLASS" != other ]; then
    iso_registry_index=$(( (iso_registry_index + 1) % ${#ISO_REGISTRIES[@]} ))
  fi
}

# Audit trail: image and repo digest of every running Supabase container.
iso_audit_images() {
  local img
  for img in $(docker ps --format '{{.Image}}' | sort -u); do
    case "$img" in
      *supabase/*|*kong*|*mailpit*|*postgrest*) echo "image $img $(docker image inspect --format '{{join .RepoDigests " "}}' "$img")" ;;
    esac
  done
}
