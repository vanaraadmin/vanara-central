const INTERFACE_SOUNDS_STORAGE_KEY = "vanara.interfaceSounds.enabled";
const SAMPLE_RATE = 44_100;
const DURATION_SECONDS = 0.22;

let audioContext: AudioContext | null = null;
let navigationBuffer: AudioBuffer | null = null;
let activeSource: AudioBufferSourceNode | null = null;

export function interfaceSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(INTERFACE_SOUNDS_STORAGE_KEY) !== "false";
}

function ensureAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
}

function createNavigationBuffer(context: AudioContext): AudioBuffer {
  const frameCount = Math.floor(SAMPLE_RATE * DURATION_SECONDS);
  const buffer = context.createBuffer(1, frameCount, SAMPLE_RATE);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    const t = index / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.018);
    const release = Math.max(0, 1 - t / DURATION_SECONDS);
    const envelope = attack * release * release;
    const low = Math.sin(2 * Math.PI * 392 * t);
    const high = Math.sin(2 * Math.PI * 784 * t) * 0.34;
    data[index] = (low + high) * envelope * 0.075;
  }

  return buffer;
}

export function setInterfaceSoundsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INTERFACE_SOUNDS_STORAGE_KEY, enabled ? "true" : "false");
}

export function playNavigationSound(): void {
  if (!interfaceSoundsEnabled()) return;

  try {
    const context = ensureAudioContext();
    navigationBuffer ??= createNavigationBuffer(context);
    try {
      activeSource?.stop();
    } catch {
      activeSource = null;
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = navigationBuffer;
    gain.gain.value = 0.72;
    source.connect(gain);
    gain.connect(context.destination);
    source.addEventListener("ended", () => {
      if (activeSource === source) activeSource = null;
    });

    activeSource = source;
    void context.resume();
    source.start();
  } catch {
    activeSource = null;
  }
}
