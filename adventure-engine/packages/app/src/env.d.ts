// Minimal typing of Vite's import.meta.env (the app only uses these fields).
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.css";
