import { describe, expect, it } from "vitest";
import { writeDirectory, type FsDirHandle } from "../src/io.ts";

/**
 * A folder that, like Windows and macOS, does not tell upper and lower case
 * apart: an existing entry keeps the name it was created with.
 */
class CaseInsensitiveDir {
  readonly kind = "directory";
  readonly entries = new Map<string, { name: string; dir?: CaseInsensitiveDir; data?: Uint8Array }>();

  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  async *values(): AsyncIterable<never> {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<CaseInsensitiveDir> {
    let e = this.entries.get(name.toLowerCase());
    if (e === undefined) {
      if (options?.create !== true) throw new Error(`NotFoundError: ${name}`);
      e = { name, dir: new CaseInsensitiveDir(name) };
      this.entries.set(name.toLowerCase(), e);
    }
    return e.dir as CaseInsensitiveDir;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    let e = this.entries.get(name.toLowerCase());
    if (e === undefined) {
      if (options?.create !== true) throw new Error(`NotFoundError: ${name}`);
      e = { name, data: new Uint8Array() };
      this.entries.set(name.toLowerCase(), e);
    }
    const entry = e;
    return {
      kind: "file" as const,
      name: entry.name,
      getFile: () => Promise.reject(new Error("not used")),
      createWritable: () =>
        Promise.resolve({
          write: (data: unknown) => {
            entry.data = data as Uint8Array;
            return Promise.resolve();
          },
          close: () => Promise.resolve(),
          abort: () => Promise.resolve(),
        }),
    };
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entries.delete(name.toLowerCase())) throw new Error(`NotFoundError: ${name}`);
  }

  /** The text of a file (path with "/"), or null when it does not exist. */
  text(path: string): string | null {
    const parts = path.split("/");
    const dir = parts.slice(0, -1).reduce<CaseInsensitiveDir | undefined>((d, p) => d?.entries.get(p.toLowerCase())?.dir, this);
    const data = dir?.entries.get((parts.at(-1) as string).toLowerCase())?.data;
    return data === undefined ? null : new TextDecoder().decode(data);
  }
}

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

async function folder(files: Record<string, string>): Promise<CaseInsensitiveDir> {
  const root = new CaseInsensitiveDir("project");
  await writeDirectory(root as unknown as FsDirHandle, new Map(Object.entries(files).map(([k, v]) => [k, bytes(v)])), new Set());
  return root;
}

describe("writeDirectory", () => {
  it("a case-only rename (attic → Attic) does not delete the scene that was just written (final review F2)", async () => {
    const root = await folder({ "project.json": "{}", "scenes/attic.json": "old" });
    await writeDirectory(root as unknown as FsDirHandle, new Map([["project.json", bytes("{}")], ["scenes/Attic.json", bytes("new")]]), new Set(["scenes/attic.json"]));
    expect(root.text("scenes/Attic.json")).toBe("new");
  });

  it("removes owned files that left the project and never touches other files (H2)", async () => {
    const root = await folder({ "project.json": "{}", "scenes/old.json": "x", "notes.md": "mine", "assets/source.psd": "art" });
    await writeDirectory(root as unknown as FsDirHandle, new Map([["project.json", bytes("{}")], ["scenes/new.json", bytes("y")]]), new Set(["scenes/old.json"]));
    expect(root.text("scenes/old.json")).toBeNull();
    expect(root.text("scenes/new.json")).toBe("y");
    expect(root.text("notes.md")).toBe("mine");
    expect(root.text("assets/source.psd")).toBe("art");
  });
});
