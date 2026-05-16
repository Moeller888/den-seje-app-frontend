// ── Toast system ──────────────────────────────────────────────────────────────
// Usage: showToast("Message", "success" | "error" | "info", durationMs?)
// Self-contained: injects its own styles + container on first call.
// Safe to import on any page — no duplicate DOM mounts per document load.

const CONTAINER_ID = "dsj-toast-container";
const STYLES_ID    = "dsj-toast-styles";

const COLORS = {
  success: { bg: "#1b5e20", border: "#2e7d32", color: "#a5d6a7" },
  error:   { bg: "#4a0000", border: "#c62828", color: "#ef9a9a" },
  info:    { bg: "#0d1a2e", border: "#1565c0", color: "#90caf9" },
};

function ensureContainer() {
  if (document.getElementById(CONTAINER_ID)) return;

  if (!document.getElementById(STYLES_ID)) {
    const style = document.createElement("style");
    style.id = STYLES_ID;
    style.textContent = `
    #${CONTAINER_ID} {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      max-width: 290px;
    }
    .dsj-toast {
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid;
      font-family: Arial, sans-serif;
      font-size: 13px;
      font-weight: bold;
      line-height: 1.35;
      pointer-events: none;
      animation: dsj-in 200ms ease both;
    }
    .dsj-toast.dsj-out {
      animation: dsj-out 200ms ease both;
    }
    @keyframes dsj-in {
      from { opacity: 0; transform: translateX(18px); }
      to   { opacity: 1; transform: translateX(0);    }
    }
    @keyframes dsj-out {
      from { opacity: 1; transform: translateX(0);    }
      to   { opacity: 0; transform: translateX(18px); }
    }
  `;
    document.head.appendChild(style);
  }

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  document.body.appendChild(container);
}

export function showToast(message, type = "info", duration = 2800) {
  ensureContainer();
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const colors = COLORS[type] ?? COLORS.info;
  const toast = document.createElement("div");
  toast.className = "dsj-toast";
  toast.textContent = message;
  toast.style.background  = colors.bg;
  toast.style.borderColor = colors.border;
  toast.style.color       = colors.color;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("dsj-out");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, duration);
}
