import uiTapSoftSrc from "../assets/sounds/click.mp3";

export const UI_TAP_VOLUME = 0.2;

const UI_SOUND_PREFERENCE_KEY = "vanara.interfaceSounds.enabled";
const UI_TAP_SOFT_SRC = uiTapSoftSrc;

let uiTapAudio: HTMLAudioElement | null = null;
let uiTapUnavailable = false;
const warnedFailures = new Set<string>();

function warnUiSoundFailure(reason: string, error?: unknown): void {
  if (!import.meta.env.DEV || warnedFailures.has(reason)) return;
  warnedFailures.add(reason);
  console.warn(`[Vanara UI sound] ${reason}`, error ?? "");
}

export function interfaceSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(UI_SOUND_PREFERENCE_KEY) !== "false";
  } catch (error) {
    warnUiSoundFailure("Unable to read the interface sound preference.", error);
    return true;
  }
}

export function setInterfaceSoundsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(UI_SOUND_PREFERENCE_KEY, enabled ? "true" : "false");
  } catch (error) {
    warnUiSoundFailure("Unable to store the interface sound preference.", error);
  }
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
    uiTapAudio = new Audio(UI_TAP_SOFT_SRC);
    uiTapAudio.preload = "auto";
    uiTapAudio.volume = UI_TAP_VOLUME;
    uiTapAudio.addEventListener("error", () => {
      uiTapUnavailable = true;
      uiTapAudio = null;
      warnUiSoundFailure(`Unable to load ${UI_TAP_SOFT_SRC}.`);
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
      playback.catch((error) => {
        warnUiSoundFailure("Browser rejected uiTapSoft playback.", error);
        if (audio.error) {
          uiTapUnavailable = true;
          uiTapAudio = null;
        }
      });
    }
  } catch (error) {
    warnUiSoundFailure("Unable to play uiTapSoft.", error);
    if (audio.error) {
      uiTapUnavailable = true;
      uiTapAudio = null;
    }
  }
}
