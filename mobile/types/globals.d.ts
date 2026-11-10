// Globals shared by the in-app backend (mobile/src) and the UI (app/static/js).

/** Set by esbuild at build time. */
declare const __APP_VERSION__: string;
declare const __EDITION__: "east" | "heritage";

/** Hanzi Writer, loaded as a classic script from vendor/. */
declare const HanziWriter: any;

interface Window {
  /** The in-app backend: answers the UI's /api/... requests without a server. */
  __localApi?: (path: string, opts?: { method?: string; body?: unknown }) => Promise<any>;
  /** Native plugins (Android app): Gemma, speech, notifications, widget, OCR, file sharing. */
  __native?: any;
  __appVersion?: string;
  __edition?: "east" | "heritage";
  __course?: string;
  __charDataUrl?: (c: string) => string;
  __syncUrl?: string;
  __backupUrl?: string;
  __accountUrl?: string;
  __splashAudio?: AudioContext;
  __gemmaMock?: any;
  __notifyMock?: any;
  __ocrMock?: any;
  __widgetMock?: any;
  HanziWriter?: any;
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
  webkitAudioContext?: typeof AudioContext;
  initSqlJs?: (opts?: { locateFile?: (f: string) => string }) => Promise<any>;
}
