# 汉字 Hanzi Home

A self-hosted Chinese (English → Mandarin) trainer in the style of Duolingo, built to be used on your phone over your home network. It covers handwriting with stroke-order checking, pronunciation, recall and sentence translation. Gemma 4 handles the parts that need language understanding. Everything else works without it.

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

## Running it

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
