import warapornGeneralRequestsPrompt from "../assets/prompts/waraporn-general-requests-v4-rc3.prompt.txt?raw";
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
  [DEFAULT_WARAPORN_PROMPT_KEY]: {
    ...WARAPORN_GENERAL_REQUESTS_METADATA,
    text: warapornGeneralRequestsPrompt,
  },
} as const satisfies Record<MessagePromptKey, LoadedPrompt>;

function promptFor(key: MessagePromptKey): LoadedPrompt {
  return PROMPT_REGISTRY[key];
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

export function loadPrompt(key: MessagePromptKey = DEFAULT_WARAPORN_PROMPT_KEY): LoadedPrompt {
  return promptFor(key);
}

export async function verifyPromptChecksum(key: MessagePromptKey = DEFAULT_WARAPORN_PROMPT_KEY): Promise<boolean> {
  const prompt = promptFor(key);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prompt.text));
  return bytesToHex(digest) === prompt.checksum;
}
