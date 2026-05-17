// ── Toast system ──────────────────────────────────────────────────────────────
// Usage: showToast("Message", "success" | "error" | "info", durationMs?)
// Self-contained: injects its own base styles + container on first call.
// Colors are driven by CSS classes (.dsj-toast--success etc.) defined in
// theme.css, so toasts automatically follow the active theme.

const CONTAINER_ID = "dsj-toast-container";
const STYLES_ID    = "dsj-toast-styles";

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

  const toast = document.createElement("div");
  toast.className = `dsj-toast dsj-toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("dsj-out");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, duration);
}
