import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const tm30TemplateSource = resolve("src/TM30_template/Template-InformAccom-ImportExcel.xlsx");
const tm30TemplateOutput = resolve("dist/client/TM30_template/Template-InformAccom-ImportExcel.xlsx");
const clientOutput = resolve("dist/client");
const buildIdPlaceholder = "__VANARA_BUILD_ID__";

function currentCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function buildId(command: string): string {
  if (command !== "build") return "development";
  const explicit = process.env.VANARA_BUILD_ID?.trim();
  if (explicit) return explicit.replace(/[^a-zA-Z0-9._-]/g, "-");
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `${currentCommit()}-${timestamp}`;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function entryAssetPaths(html: string): string[] {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
}

function finalizePwaBuild(releaseBuildId: string): void {
  const serviceWorkerPath = resolve(clientOutput, "sw.js");
  if (!existsSync(serviceWorkerPath)) return;
  const serviceWorker = readFileSync(serviceWorkerPath, "utf8");
  if (!serviceWorker.includes(buildIdPlaceholder)) return;
  writeFileSync(serviceWorkerPath, serviceWorker.replaceAll(buildIdPlaceholder, releaseBuildId));

  const html = readFileSync(resolve(clientOutput, "index.html"), "utf8");
  const entries = entryAssetPaths(html).map((url) => {
    const bytes = readFileSync(resolve(clientOutput, url.replace(/^\//, "")));
    return { url, sha256: sha256(bytes) };
  });
  if (entries.length === 0) throw new Error("PWA build manifest has no entry assets");

  writeFileSync(resolve(clientOutput, "app-version.json"), `${JSON.stringify({
    buildId: releaseBuildId,
    commit: currentCommit(),
    entryAssets: entries,
  }, null, 2)}\n`);
}

export default defineConfig(({ command }) => {
  const releaseBuildId = buildId(command);
  return {
    define: {
      __VANARA_BUILD_ID__: JSON.stringify(releaseBuildId),
    },
    plugins: [
      react(),
      {
        name: "vanara-build-assets",
        closeBundle() {
          mkdirSync(dirname(tm30TemplateOutput), { recursive: true });
          copyFileSync(tm30TemplateSource, tm30TemplateOutput);
          if (command === "build") finalizePwaBuild(releaseBuildId);
        },
      },
      cloudflare({
        configPath: "./wrangler.jsonc",
        remoteBindings: command !== "serve",
      }),
    ].filter(Boolean),
  };
});
