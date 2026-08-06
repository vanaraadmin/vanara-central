export type PwaUpdateStatus = "idle" | "unsupported" | "ready" | "update-available";

type UpdateCallback = () => void;

function serviceWorkersAvailable(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

export function registerVanaraServiceWorker(onUpdate?: UpdateCallback): void {
  if (!serviceWorkersAvailable()) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) onUpdate?.();
          });
        });
      })
      .catch(() => {
        // PWA registration must never block the operational app.
      });
  });
}

export async function checkVanaraUpdate(): Promise<PwaUpdateStatus> {
  if (!serviceWorkersAvailable()) return "unsupported";
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return "ready";
  await registration.update();
  return registration.waiting ? "update-available" : "ready";
}

export async function applyVanaraUpdate(): Promise<PwaUpdateStatus> {
  if (!serviceWorkersAvailable()) return "unsupported";
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.waiting) return checkVanaraUpdate();

  return new Promise((resolve) => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
      resolve("ready");
    });
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  });
}
