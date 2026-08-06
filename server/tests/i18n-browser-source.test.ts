import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const languageProvider = readFileSync(new URL("../../src/providers/LanguageProvider.tsx", import.meta.url), "utf8");
const appRouter = readFileSync(new URL("../../src/router/AppRouter.tsx", import.meta.url), "utf8");

test("browser auto-translate is disabled while app language follows the user profile", () => {
  assert.match(indexHtml, /<html[^>]*lang="en"[^>]*translate="no"[^>]*class="notranslate"/);
  assert.match(indexHtml, /<meta name="google" content="notranslate" \/>/);
  assert.match(indexHtml, /<body[^>]*translate="no"[^>]*class="notranslate"/);
  assert.match(indexHtml, /<div id="root"[^>]*translate="no"[^>]*class="notranslate"/);

  assert.match(languageProvider, /document\.documentElement\.lang = language/);
  assert.match(languageProvider, /document\.documentElement\.setAttribute\("translate", "no"\)/);
  assert.match(languageProvider, /document\.body\.setAttribute\("translate", "no"\)/);
  assert.match(languageProvider, /document\.getElementById\("root"\)\?\.setAttribute\("translate", "no"\)/);
  assert.doesNotMatch(languageProvider, /navigator\.language/);

  assert.match(appRouter, /user\.data\?\.preferredLanguage/);
  assert.match(appRouter, /changeLanguage\(preferred\)/);
});
