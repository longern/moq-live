import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

const isolationHeaders = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
};

function collectHashInputs(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".git" || entry === "dist" || entry === "node_modules") {
      continue;
    }
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectHashInputs(fullPath, files);
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function computeBuildHash() {
  const hash = createHash("sha256");
  const files = collectHashInputs(rootDir).sort();
  for (const file of files) {
    hash.update(relative(rootDir, file));
    hash.update("\n");
    hash.update(readFileSync(file));
    hash.update("\n");
  }
  return hash.digest("hex").slice(0, 12);
}

const buildHash = computeBuildHash();

export default defineConfig({
  plugins: [preact()],
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash),
  },
  server: {
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
});
