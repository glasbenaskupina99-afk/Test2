# 汉字 Hanzi Home

A Chinese (English → Mandarin) trainer in the style of Duolingo. Run it as an **offline Android app** with Gemma on the phone, or self-host it and use it from your phone over your home network. It covers handwriting with stroke-order checking, pronunciation, recall and sentence translation. Gemma 4 handles the parts that need language understanding. Everything else works without it.

**Why it exists:** writing on paper means your earlier attempts stay in view, so you end up copying them. Here every character starts on a fresh pad, gets checked stroke by stroke, and is wiped as soon as you finish it. Nothing to peek at, and no paper used up.

## Features

| Mode | What you do |
|---|---|
| 🌱 **Learn new words** | See the word with an animated stroke order, audio, pinyin and an optional AI memory hook → trace it → write it from memory → a mixed quiz (multiple choice, speaking, writing). |
| 🏋️ **Practice** | Spaced-repetition review. Each word has three cards that are scheduled separately: **writing** (from the English prompt only, with no outline), **speaking** and **recall** (multiple choice or typed pinyin). Mistakes come back at the end of the session. |
| 💬 **Sentences** | Gemma writes new sentences using the words you already know, focusing on the ones you get wrong. You can **hand-write** them (characters you haven't learned show a tracing guide), **type** them (Gemma grades your translation, so valid alternative wordings count), or **say** them from memory. 50 built-in sentences are used if AI is off. |

Also included: 153 HSK 1 words in 10 themed units, adding your own words (Gemma can fill in the characters and meaning), streaks, a daily XP goal, stats, the "trickiest words" list, and dark mode.

### What uses AI and what doesn't

| Task | How |
|---|---|
| Stroke and stroke-order grading | [Hanzi Writer](https://hanziwriter.org) with Make Me a Hanzi data. No AI, runs in the browser. |
| Scheduling (SRS) | SM-2-style algorithm, no AI. |
| Pinyin answers, tone checking | Local, using `pypinyin`. |
| Audio playback | Your phone's built-in Chinese voice. |
| Sentence generation, translation grading, memory hooks, auto-filling new words | **Gemma** |
| Pronunciation | Your choice: phone speech recognition (compared syllable by syllable, tones included), **Gemma audio**, or record yourself and compare against the native voice. |

## 📱 Android app (no server)

The `mobile/` folder wraps the same app as an Android app that works completely offline. Your progress, stroke data, the voice, speech recognition and Gemma all live on the phone.

**Install:** open this repo's **Releases** page on your phone, download `HanziHome.apk` from the newest release, and open it. Android will ask you to allow installs from your browser. Every push builds a new release (GitHub Actions → *Build Android app*), and installing a newer APK updates the app while keeping your progress.

**Gemma on the phone:** open **Settings → Gemma on this phone → Find model files**, choose the plain `.litertlm` file, and tap **Download**. Gemma 4 E2B is about 2.6 GB and needs 6 GB or more of RAM; E4B is about 3.7 GB and needs 8 GB or more. You only download it once, over Wi-Fi or mobile data (it's a few GB, so mind your data plan); after that it runs offline through [LiteRT-LM](https://github.com/google-ai-edge/LiteRT-LM). If Hugging Face says access is denied, accept the model's licence on huggingface.co and paste an access token. You can also import a `.litertlm` file you already have. Start with the **CPU** processor. **GPU** is faster but can crash on phones with less RAM.

**🇯🇵 Japanese kanji course:** tap the flag at the top left of the home screen to switch between 🇨🇳 Chinese (HSK 1) and 🇯🇵 Japanese. The Japanese course has 113 beginner (JLPT N5) words in 9 themed units, including verbs and adjectives with kana endings (行く, 大きい). It uses Japanese stroke order from [hanzi-writer-data-jp](https://github.com/k1LoW/hanzi-writer-data-jp), based on animCJK. Hiragana loops that animCJK splits into two pieces are merged back at build time, so あ is 3 strokes as you'd write it. You can type readings in romaji or kana (`taberu` or `たべる`). The Japanese voice and speech recognition come from your phone, and Gemma writes and grades Japanese sentences. Each course keeps its own words and progress; your streak and XP are shared.

**Pronunciation** uses Android's speech recognition. For it to work offline, install the Chinese (Mandarin) and/or Japanese offline speech packs: Android Settings → Google → Voice / speech.

**Backups:** progress is stored only on the phone, so use **Settings → Backup → Export** now and then.

Build it yourself (needs Node 22, JDK 21 and the Android SDK):

```bash
cd mobile
npm install
npm run apk        # → android/app/build/outputs/apk/debug/app-debug.apk
```

The APK is signed with `mobile/android/app/hanzi.keystore`, a key committed to the repo so that every build can update the installed app. That's fine for a personal app, but don't reuse the key for anything you publish.

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
