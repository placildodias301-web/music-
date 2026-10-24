/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { alphaTab } from "@coderline/alphatab-vite";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

interface LicenceEntry {
  name: string;
  version: string;
  licence: string;
  kind: "app" | "build" | "server" | "font";
}

/** Open-source licences, read at build time from what is actually installed. */
function collectLicences(): LicenceEntry[] {
  const out: LicenceEntry[] = [];
  const npm = (deps: Record<string, string> | undefined, kind: LicenceEntry["kind"]) => {
    for (const name of Object.keys(deps ?? {}).sort()) {
      const file = join(root, "node_modules", name, "package.json");
      if (!existsSync(file)) continue;
      const meta = JSON.parse(readFileSync(file, "utf8")) as { version?: string; license?: string | { type?: string } };
      const licence = typeof meta.license === "string" ? meta.license : (meta.license?.type ?? "See package");
      out.push({ name, version: meta.version ?? "", licence, kind });
    }
  };
  npm(pkg.dependencies, "app");
  npm(pkg.devDependencies, "build");

  // Backend packages (from the local venv, when present at build time).
  const backend = join(root, "..", "backend");
  const site = join(backend, "venv", "Lib", "site-packages");
  const requirements = join(backend, "requirements.txt");
  if (existsSync(site) && existsSync(requirements)) {
    const wanted = readFileSync(requirements, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim().split(/[<>=[;\s]/)[0].toLowerCase().replace(/_/g, "-"))
      .filter(Boolean);
    for (const dir of readdirSync(site).filter((d) => d.endsWith(".dist-info"))) {
      const metaPath = join(site, dir, "METADATA");
      if (!existsSync(metaPath)) continue;
      const meta = readFileSync(metaPath, "utf8");
      const name = /^Name: (.+)$/m.exec(meta)?.[1]?.trim() ?? "";
      if (!wanted.includes(name.toLowerCase().replace(/_/g, "-"))) continue;
      const licence =
        /^License-Expression: (.+)$/m.exec(meta)?.[1]?.trim() ||
        /^Classifier: License :: OSI Approved :: (.+)$/m.exec(meta)?.[1]?.trim() ||
        /^License: (.{1,40})$/m.exec(meta)?.[1]?.trim() ||
        "See package";
      out.push({ name, version: /^Version: (.+)$/m.exec(meta)?.[1]?.trim() ?? "", licence, kind: "server" });
    }
  }

  // Fonts bundled for the PDF export.
  const fonts = join(backend, "assets", "fonts");
  if (existsSync(fonts)) {
    for (const file of readdirSync(fonts).filter((f) => f.startsWith("OFL-"))) {
      out.push({ name: file.replace(/^OFL-|\.txt$/g, ""), version: "", licence: "OFL-1.1", kind: "font" });
    }
  }
  return out;
}

function licencesModule(): Plugin {
  const id = "virtual:licences";
  return {
    name: "wilsify-licences",
    resolveId: (source) => (source === id ? "\0" + id : null),
    load: (resolved) => (resolved === "\0" + id ? `export default ${JSON.stringify(collectLicences())};` : null),
  };
}

// https://vite.dev/config/
export default defineConfig({
  // alphaTab (Sheet Music page): serves its notation font, piano soundfont and audio worker.
  plugins: [react(), tailwindcss(), licencesModule(), alphaTab()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Unit tests run in Node; component/route tests get a DOM from jsdom. The setup file wires Testing Library and
  // resets DOM, storage, history, timers and mocks after every test so nothing leaks between tests.
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
