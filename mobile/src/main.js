// Android app entry: wires the shared web UI to an in-app backend and native plugins.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { LocalNotifications } from "@capacitor/local-notifications";
import * as backend from "./backend.js";

const isNative = Capacitor.isNativePlatform();
const Gemma = registerPlugin("Gemma");
const Widget = registerPlugin("Widget");
const Ocr = registerPlugin("Ocr");
const KEY = "hanzi-db";

const storage = isNative
  ? {
      load: async () => (await Preferences.get({ key: KEY })).value,
      save: (v) => Preferences.set({ key: KEY, value: v }),
    }
  : {
      // Browser preview (npx serve www): keep data in localStorage.
      load: async () => { try { return localStorage.getItem(KEY); } catch { return null; } },
      save: async (v) => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } },
    };

// Chinese and Japanese stroke orders differ, so each course has its own stroke data.
window.__appVersion = __APP_VERSION__;
window.__charDataUrl = (c) => `${window.__course === "ja" ? "chars-ja" : "chars"}/${encodeURIComponent(c)}.json`;

function recognize(language = "zh-CN") {
  const p = (async () => {
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== "granted") perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") throw new Error("Microphone permission denied");
    try {
      const res = await SpeechRecognition.start({ language, maxResults: 4, popup: false, partialResults: false });
      return (res && res.matches) || [];
    } catch (e) {
      if (/no match|no speech|didn't|timeout|7|6/i.test(e.message || "")) return [];
      throw e;
    }
  })();
  p.stop = () => SpeechRecognition.stop().catch(() => {});
  return p;
}

if (isNative) {
  window.__native = {
    gemma: Gemma,
    widget: Widget,
    ocr: Ocr,
    notifications: LocalNotifications,
    speak: (text, rate, lang = "zh-CN") => TextToSpeech.speak({ text, lang, rate: rate / 0.8, pitch: 1, volume: 1, category: "playback" }),
    stopSpeaking: () => TextToSpeech.stop().catch(() => {}),
    recognize,
    shareFile: async (name, text) => {
      const r = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: name, files: [r.uri] });
    },
  };
} else if (window.__gemmaMock) {
  // Used by browser tests to exercise the on-device AI code paths.
  window.__native = { gemma: window.__gemmaMock, notifications: window.__notifyMock, ocr: window.__ocrMock, widget: window.__widgetMock, shareFile: async () => {} };
}

// Browser version: work offline and be installable as an app.
if (!isNative && "serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("service worker", e));
}

await backend.init(storage);
window.__localApi = backend.handle;
backend.setOnSynced(() => window.dispatchEvent(new Event("bloomko-synced")));

// Load Gemma in the background shortly after start, so the first AI answer doesn't
// have to wait for the model to load (can be turned off in Settings).
if (isNative) {
  setTimeout(async () => {
    try {
      const s = await backend.handle("/api/settings");
      if (!s.ai_enabled || !s.gemma_preload) return;
      const st = await Gemma.status();
      if (st.hasModel && !st.loaded && !st.loading) await Gemma.load({ backend: s.gemma_backend || "cpu" });
    } catch (e) {
      console.warn("Gemma preload failed", e);
    }
  }, 4000);
}
await import("../../app/static/js/app.js");
