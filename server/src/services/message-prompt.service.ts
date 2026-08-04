import type { MessagePromptKey } from "../types/messages.js";

export interface PromptMetadata {
  key: MessagePromptKey;
  version: string;
  checksumAlgorithm: "sha256";
  checksum: string;
}

export interface LoadedPrompt extends PromptMetadata {
  text: string;
}

export const DEFAULT_WARAPORN_PROMPT_KEY: MessagePromptKey = "waraporn-general-requests-v4-rc3";

const WARAPORN_GENERAL_REQUESTS_METADATA: PromptMetadata = {
  key: DEFAULT_WARAPORN_PROMPT_KEY,
  version: "SYSTEM_PROMPT_V4_RC3_HARD_EXECUTION_GATE",
  checksumAlgorithm: "sha256",
  checksum: "1534c2d9654b2ccca292784110d31b7a6aa739fb498709913bd3278ca5e6848e",
};

const PROMPT_REGISTRY = {
  [DEFAULT_WARAPORN_PROMPT_KEY]: WARAPORN_GENERAL_REQUESTS_METADATA,
} as const satisfies Record<MessagePromptKey, PromptMetadata>;

const PROMPT_ASSET_PATHS = {
  [DEFAULT_WARAPORN_PROMPT_KEY]: "../assets/prompts/waraporn-general-requests-v4-rc3.prompt.txt",
} as const satisfies Record<MessagePromptKey, string>;

function promptFor(key: MessagePromptKey): PromptMetadata {
  return PROMPT_REGISTRY[key];
}

function isNodeRuntime(): boolean {
  const maybeProcess = (globalThis as unknown as { process?: { versions?: { node?: string } } }).process;
  return typeof maybeProcess?.versions?.node === "string";
}

async function promptTextFor(key: MessagePromptKey): Promise<string> {
  if (isNodeRuntime()) {
    const fsPromisesModule = "node:fs/promises";
    const { readFile } = (await import(fsPromisesModule)) as {
      readFile(path: URL, encoding: "utf8"): Promise<string>;
    };
    return readFile(new URL(PROMPT_ASSET_PATHS[key], import.meta.url), "utf8");
  }
  const module = await import("../assets/prompts/waraporn-general-requests-v4-rc3.prompt.txt?raw");
  return typeof module.default === "string" ? module.default : String(module.default);
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function listPromptVersions(): PromptMetadata[] {
  return Object.values(PROMPT_REGISTRY).map((prompt) => ({
    key: prompt.key,
    version: prompt.version,
    checksumAlgorithm: prompt.checksumAlgorithm,
    checksum: prompt.checksum,
  }));
}

export function getPromptVersion(key: MessagePromptKey = DEFAULT_WARAPORN_PROMPT_KEY): string {
  return promptFor(key).version;
}

export function getPromptChecksum(key: MessagePromptKey = DEFAULT_WARAPORN_PROMPT_KEY): string {
  return promptFor(key).checksum;
}

export async function loadPrompt(key: MessagePromptKey = DEFAULT_WARAPORN_PROMPT_KEY): Promise<LoadedPrompt> {
  return {
    ...promptFor(key),
    text: await promptTextFor(key),
  };
}

export async function verifyPromptChecksum(key: MessagePromptKey = DEFAULT_WARAPORN_PROMPT_KEY): Promise<boolean> {
  const prompt = await loadPrompt(key);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prompt.text));
  return bytesToHex(digest) === prompt.checksum;
}
