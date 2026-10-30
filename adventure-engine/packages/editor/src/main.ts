import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./style.css";
import { EditorApp } from "./app.ts";
import { EditorStore } from "./store.ts";

const root = document.getElementById("editor");
if (root === null) throw new Error("missing #editor");
// The undo history keeps the last 200 commands (configurable here).
const app = new EditorApp(new EditorStore(200), root);
document.documentElement.dataset["editor"] = "ready";
void app;
