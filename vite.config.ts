import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const tm30TemplateSource = resolve("src/TM30_template/Template-InformAccom-ImportExcel.xlsx");
const tm30TemplateOutput = resolve("dist/client/TM30_template/Template-InformAccom-ImportExcel.xlsx");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "vanara-tm30-template-asset",
      closeBundle() {
        mkdirSync(dirname(tm30TemplateOutput), { recursive: true });
        copyFileSync(tm30TemplateSource, tm30TemplateOutput);
      },
    },
    cloudflare({
      configPath: "./wrangler.jsonc",
    }),
  ],
});
