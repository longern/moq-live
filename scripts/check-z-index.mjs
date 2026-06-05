import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("../src/styles/", import.meta.url);
const MAX_LOCAL_Z_INDEX = 9;

async function listCssFiles(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
    if (entry.isDirectory()) {
      files.push(...await listCssFiles(entryUrl));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".css")) {
      files.push(entryUrl);
    }
  }

  return files;
}

function getRelativePath(fileUrl) {
  return join("src/styles", fileUrl.pathname.slice(ROOT.pathname.length));
}

const violations = [];
const files = await listCssFiles(ROOT);

for (const fileUrl of files) {
  const source = await readFile(fileUrl, "utf8");
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    const match = line.match(/\bz-index\s*:\s*(-?\d+)\b/);
    if (!match) {
      return;
    }

    const value = Number(match[1]);
    if (Number.isFinite(value) && Math.abs(value) > MAX_LOCAL_Z_INDEX) {
      violations.push(`${getRelativePath(fileUrl)}:${index + 1} uses z-index ${value}; use a --z-* token for global layers.`);
    }
  });
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}
