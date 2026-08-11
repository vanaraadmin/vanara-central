const cloudflareWorkersUrl = new URL("./cloudflare-workers-test-shim.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: cloudflareWorkersUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
