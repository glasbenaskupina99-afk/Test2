# Bloomko

A Chinese (English → Mandarin) trainer in the style of Duolingo. Run it as an **offline Android app** with Gemma on the phone, or self-host it and use it from your phone over your home network. It covers handwriting with stroke-order checking, pronunciation, recall and sentence translation. Gemma 4 handles the parts that need language understanding. Everything else works without it.

**Why it exists:** writing on paper means your earlier attempts stay in view, so you end up copying them. Here every character starts on a fresh pad, gets checked stroke by stroke, and is wiped as soon as you finish it. Nothing to peek at, and no paper used up.

## Features

| Mode | What you do |
|---|---|
| 🌱 **Learn new words** | See the word with an animated stroke order, audio, pinyin and an optional AI memory hook → trace it → write it from memory → a mixed quiz (multiple choice, speaking, writing). |
| 🏋️ **Practice** | Spaced-repetition review. Each word has three cards that are scheduled separately: **writing** (from the English prompt only, with no outline), **speaking** and **recall** (multiple choice or typed pinyin). Mistakes come back at the end of the session. |
| ✍️ / 👆 **With or without writing** | When you tap Learn new words or Practice, you pick **With writing** (trace and write by hand) or **Choice only**. Choice only is a no-writing mode: choose the character for an English word, pick the meaning of a character, pick its pinyin or reading, or listen and pick the character. Choice-only practice only updates the recall reviews, so writing reviews stay due until you actually write. |
| 🍃 **Look-alikes** | Tell apart characters that are easy to mix up (未/末, 己/已, 人/入/八, 待/持/特 …): pick the right one for a meaning, or the meaning for a character, then see them side by side with what tells them apart. Groups with characters you've learned and ones you got wrong come first. Chinese and Japanese. |
| 💬 **Sentences** | Gemma writes new sentences using the words you already know, focusing on the ones you get wrong. You can **hand-write** them (characters you haven't learned show a tracing guide), **type** them (Gemma grades your translation, so valid alternative wordings count), or **say** them from memory. 50 built-in sentences are used if AI is off. |

**Grammar:** lessons of three grammar points for the selected level (HSK 1–3: 211 points, JLPT N5–N3: 262) unlock as you learn the level's words. Each point shows the pattern, an example built from words you know (grammar highlighted), an explanation and more examples — Gemma can write a fresh example from your own words. A short quiz follows (what does the highlighted part do? / fill the gap), and learned grammar comes back in Practice.

Also included: HSK 1–3 following the official HSK 3.0 (2021) word lists (508 + 761 + 1001 words in themed units), adding your own words or importing a whole list from a textbook, Anki or Pleco (`word, reading, meaning` per line, pasted or as a .txt/.csv file — each list becomes its own level) (Gemma can fill in the characters and meaning), a daily XP goal, stats, the "trickiest words" list, and dark mode.

**Streak plant (Android app 1.3):** your streak is a plant that grows while you practise every day and droops when today's practice is still missing. **Raindrops** are streak freezes: if you miss a day, a raindrop waters the plant so the streak survives, and that day shows a dried leaf. You earn one for every 7 days in a row (you can keep 2). **Today's plan** on the home screen shows the reviews and new words left with a time estimate, and an optional **daily reminder** (Settings → Daily reminder) sends a leaf-themed notification at your chosen time, only on days you haven't practised yet.

### What uses AI and what doesn't

| Task | How |
|---|---|
| Stroke and stroke-order grading | [Hanzi Writer](https://hanziwriter.org) with Make Me a Hanzi data. No AI, runs in the browser. |
| Scheduling (SRS) | [FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm) in the app and browser version (older SM-2 progress carries over); the Python server version still uses SM-2. No AI. |
| Pinyin answers, tone checking | Local, using `pypinyin`. |
| Audio playback | Your phone's built-in Chinese voice. |
| Sentence generation, translation grading, memory hooks, auto-filling new words | **Gemma** |
| Pronunciation | Your choice: phone speech recognition (compared syllable by syllable, tones included), **Gemma audio**, or record yourself and compare against the native voice. |

## 💻 On a computer (in the browser)

Open **https://glasbenaskupina99-afk.github.io/Test2/** in Chrome or Edge. Nothing to install or host:

- **Your data** stays in this browser. Use Settings → Backup to move it between devices, and the same backup file works in the Android app.
- **Writing** works with the mouse, a touchscreen or a pen tablet.
- **Voice and speech recognition** come from the browser. Chrome and Edge have both; Firefox has no speech recognition, so it uses record-and-compare instead.
- **Installing:** use the install icon in the address bar to get Bloomko as its own app window. It also works offline.
- **Gemma on the computer:** install [Ollama](https://ollama.com) and run `ollama pull gemma4:e4b`. Then set the environment variable `OLLAMA_ORIGINS=https://glasbenaskupina99-afk.github.io` and restart Ollama, so the site is allowed to talk to it. Finally press **Settings → Test connection**, and allow access to your local network if the browser asks.

Each push builds a new APK and updates only the APK download; the web app stays as it was. To publish the web app too, go to Actions → *Build app (Android + web)* → *Run workflow* and tick **Publish web app too**. Both are served from the `gh-pages` branch. **One-time setup:** Settings → Pages → Source: *Deploy from a branch* → `gh-pages` / `(root)`.

## 📱 Android app (no server)

The `mobile/` folder wraps the same app as an Android app that works completely offline. Your progress, stroke data, the voice, speech recognition and Gemma all live on the phone.

**Install:** on your phone, open **https://glasbenaskupina99-afk.github.io/Test2/Bloomko.apk** (or the newest file on the repo's **Releases** page) and open the downloaded file. Android will ask you to allow installs from your browser. Every push builds a new version (GitHub Actions → *Build app (Android + web)*), and installing a newer APK updates the app while keeping your progress.

**Gemma on the phone:** open **Settings → Gemma on this phone → Find model files**, choose the plain `.litertlm` file, and tap **Download**. Gemma 4 E2B is about 2.6 GB and needs 6 GB or more of RAM; E4B is about 3.7 GB and needs 8 GB or more. You only download it once, over Wi-Fi or mobile data (it's a few GB, so mind your data plan); after that it runs offline through [LiteRT-LM](https://github.com/google-ai-edge/LiteRT-LM). If Hugging Face says access is denied, accept the model's licence on huggingface.co and paste an access token. You can also import a `.litertlm` file you already have. Start with the **CPU** processor. **GPU** is faster but can crash on phones with less RAM.

**🇯🇵 Japanese kanji course:** tap the flag at the top left of the home screen to switch between 🇨🇳 Chinese (HSK 1) and 🇯🇵 Japanese. The Japanese course has four levels, which you pick right after choosing the language (or later by tapping the flag). **Kana** (142 characters) teaches hiragana and katakana stroke by stroke, with dakuten; kana are quizzed against other kana of the same script, and the reading is asked as romaji. **JLPT N5** has 778 words, **JLPT N4** 672 and **JLPT N3** 1942 (about 3,400 in total, roughly the unofficial JLPT estimates). Besides kanji words they include words written only in kana (ちょっと, もう) and katakana loanwords (コーヒー); those are practised through meaning, listening and speaking rather than handwriting. The kanji words cover the N5–N3 kanji sets. Every course word ships with a ready-made memory hook and example sentence. "Learn new words" draws from the chosen level, while Practice and Sentences cover everything you've learned. When you're on N3, Gemma writes harder sentences. It uses Japanese stroke order from [hanzi-writer-data-jp](https://github.com/k1LoW/hanzi-writer-data-jp), based on animCJK. Hiragana loops that animCJK splits into two pieces are merged back at build time, so あ is 3 strokes as you'd write it. You can type readings in romaji or kana (`taberu` or `たべる`). The Japanese voice and speech recognition come from your phone, and Gemma writes and grades Japanese sentences. Each course keeps its own words and progress; your streak and XP are shared.

**Pronunciation** uses Android's speech recognition. For it to work offline, install the Chinese (Mandarin) and/or Japanese offline speech packs: Android Settings → Google → Voice / speech.

**Backups:** progress is stored only on the phone, so use **Settings → Backup → Export** now and then.

Build it yourself (needs Node 22, JDK 21 and the Android SDK):

```bash
cd mobile
npm install
npm run apk        # → android/app/build/outputs/apk/debug/app-debug.apk
```

The APK is signed with `mobile/android/app/hanzi.keystore`, a key committed to the repo so that every build can update the installed app. That's fine for a personal app, but don't reuse the key for anything you publish.

## 🌐 Website (bloomko.eu)

`site/` is the static "coming soon" landing page. It's plain HTML with no build step, served by a **Cloudflare Worker** with static assets (`wrangler.jsonc` at the repo root; deploy command `npx wrangler deploy`). Alternatively with **Cloudflare Pages**:
Pages → *Connect to Git* → this repo → build command: *(none)* → build output directory: `site` → then *Custom domains* → `bloomko.eu`.
Pushing changes under `site/` doesn't trigger the Android build.
"Notify me" sign-ups are handled by `worker/index.js` and stored in a Workers KV namespace bound as `NOTIFY` (created automatically on the first deploy). To see them: Cloudflare dashboard → *Storage & Databases → KV* → the namespace → each key is an email address.

## Running it as a server

Requires Python 3.10+.

```bash
pip install -r requirements.txt
python run.py
```

It prints the addresses to open, e.g. `https://192.168.1.20:8443`. Open that on your phone and accept the certificate warning once (Advanced → Proceed). **HTTPS matters:** phone browsers only give websites the microphone over HTTPS, so the app creates a self-signed certificate on first start. Use `python run.py --http` for plain HTTP on port 8000. Everything except the microphone will still work.

On first start the app downloads the full stroke database (about 13 MB, roughly 9,500 characters) into `data/chars`. After that it works offline. All your progress is stored in `data/hanzi.db`.

Tip: on Android/iOS use "Add to Home screen" to get a full-screen, app-like experience.

### Gemma 4

Any OpenAI-compatible server works. With [Ollama](https://ollama.com):

```bash
ollama pull gemma4:e4b
python run.py      # defaults to http://localhost:11434/v1 and model gemma4:e4b
```

If the model runs on another machine, change the URL and model in the app's **Settings** screen, or set environment variables:

```bash
LLM_BASE_URL=http://192.168.1.50:11434/v1 LLM_MODEL=gemma4:e4b python run.py
```

Then use **Settings → Test connection**.

**Pronunciation with Gemma audio:** the small Gemma 4 variants (E2B/E4B) understand audio. The app records you, converts the recording to 16 kHz WAV in the browser, and sends it as an OpenAI `input_audio` message. Your server has to accept audio input. llama.cpp's `llama-server` with the model's multimodal projector (`--mmproj`) does; at the time of writing, not every Ollama build does. If the server rejects audio, the app tells you and lets you grade yourself for that attempt. The default pronunciation mode, phone speech recognition, needs no AI at all.

### Docker

```bash
docker compose up -d
docker compose exec ollama ollama pull gemma4:e4b
```

Open `https://<server-ip>:8443`. Data is stored in `./data`.

## Settings worth knowing

- **Stroke strictness**: Strict, Normal or Relaxed stroke matching.
- **Show a hint after**: how many misses before the next stroke is highlighted. Set it to "Never" for a hard mode.
- **Pronunciation checker**: phone, Gemma audio, or self-assessment.
- **New words per lesson**, **reviews per practice**, **sentences per session**, **daily goal**.

## Project layout

```
run.py                 start script (HTTPS cert, LAN addresses)
app/main.py            FastAPI routes
app/ai.py              Gemma prompts (OpenAI-compatible client)
app/srs.py             spaced repetition
app/pinyin.py          pinyin/tone comparison, speech scoring
app/chardata.py        stroke data download + cache
app/data/              HSK 1 word list, fallback sentences
app/static/            the web app (vanilla JS modules, no build step)
```

## Credits

- [Hanzi Writer](https://github.com/chanind/hanzi-writer) (MIT)
- Stroke data from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) / hanzi-writer-data (Arphic Public License)
- [pypinyin](https://github.com/mozillazg/python-pinyin) (MIT)
