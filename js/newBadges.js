// Session-scoped "Ny!" badge tracking.
//
// Badges persist through page reload (sessionStorage survives F5) but
// clear when the user navigates away to a different page.
//
// The leftWith key defers the clear decision:
//   pagehide fires for both reload and navigation — we can't distinguish there.
//   So we save a snapshot ("leftWith") on pagehide, then on the next page load
//   we check performance.getEntriesByType("navigation")[0].type:
//     "navigate"      → fresh navigation → remove leftWith IDs from newBadges
//     "reload"        → F5 → keep newBadges as-is
//     "back_forward"  → back/forward → keep newBadges as-is
//
// IDs added after leaving (e.g. shop purchase → addBadge("avatar", id)) survive
// the clear because they were not in leftWith when the user left.
//
// sessionStorage layout:
//   newBadges.<feature>  — JSON array of currently-badged item IDs
//   leftWith.<feature>   — transient snapshot saved on pagehide, cleared on load

function _k(prefix, feature) { return prefix + "." + feature; }

function _getSet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function _setSet(key, set) {
  if (set.size === 0) sessionStorage.removeItem(key);
  else sessionStorage.setItem(key, JSON.stringify([...set]));
}

// Call once per page, synchronously before first render.
// Registers the pagehide listener that snapshots the badge set on unload.
export function initBadges(feature) {
  const navType  = performance.getEntriesByType("navigation")[0]?.type ?? "navigate";
  const leftKey  = _k("leftWith",  feature);
  const badgeKey = _k("newBadges", feature);

  if (navType === "navigate") {
    const leftWith = _getSet(leftKey);
    if (leftWith.size > 0) {
      const current = _getSet(badgeKey);
      for (const id of leftWith) current.delete(id);
      _setSet(badgeKey, current);
    }
  }
  sessionStorage.removeItem(leftKey);

  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    _setSet(leftKey, _getSet(badgeKey));
  });
}

// Add id to the badge set for feature. Safe to call from any page.
export function addBadge(feature, id) {
  const key = _k("newBadges", feature);
  const set = _getSet(key);
  set.add(String(id));
  _setSet(key, set);
}

// Returns true if id should show a "Ny!" badge for feature.
export function hasBadge(feature, id) {
  return _getSet(_k("newBadges", feature)).has(String(id));
}
