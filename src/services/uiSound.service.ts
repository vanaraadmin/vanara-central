export const UI_TAP_VOLUME = 0.2;

const UI_SOUND_PREFERENCE_KEY = "vanara.interfaceSounds.enabled";
const UI_TAP_SOFT_SRC = "/audio/ui-tap-soft.mp3";

let uiTapAudio: HTMLAudioElement | null = null;
let uiTapUnavailable = false;

export function interfaceSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(UI_SOUND_PREFERENCE_KEY) !== "false";
}

export function setInterfaceSoundsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(UI_SOUND_PREFERENCE_KEY, enabled ? "true" : "false");
}

function resetAudioPosition(audio: HTMLAudioElement): void {
  audio.pause();

  try {
    audio.currentTime = 0;
  } catch {
    // Some browsers reject seeking while the future asset is not loaded yet.
  }
}

function getUiTapAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined" || uiTapUnavailable) return null;

  if (!uiTapAudio) {
    // TODO: Add the official Vanara UI Tap asset at public/audio/ui-tap-soft.mp3.
    uiTapAudio = new Audio(UI_TAP_SOFT_SRC);
    uiTapAudio.preload = "auto";
    uiTapAudio.volume = UI_TAP_VOLUME;
    uiTapAudio.addEventListener("error", () => {
      uiTapUnavailable = true;
      uiTapAudio = null;
    });
  }

  return uiTapAudio;
}

export function playUiTap(): void {
  if (!interfaceSoundsEnabled()) return;

  const audio = getUiTapAudio();
  if (!audio) return;

  try {
    resetAudioPosition(audio);
    audio.volume = UI_TAP_VOLUME;
    const playback = audio.play();
    if (playback) {
      playback.catch(() => {
        if (audio.error) {
          uiTapUnavailable = true;
          uiTapAudio = null;
        }
      });
    }
  } catch {
    if (audio.error) {
      uiTapUnavailable = true;
      uiTapAudio = null;
    }
  }
}
