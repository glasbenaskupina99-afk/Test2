"""Gemma (or any OpenAI-compatible model) for the parts that need language smarts.

AI is used for:
  * generating practice sentences from the words you already know
  * grading free translations (so valid alternatives are accepted)
  * example sentences + memory hooks for new words
  * filling in pinyin / meaning when you add your own words
  * pronunciation feedback from a recording (only if the server accepts audio)

Everything else (stroke grading, scheduling, pinyin checks) is deterministic and
works without a model.
"""
import json
import re

import httpx

from . import settings
from .pinyin import hanzi_only

SYSTEM = (
    "You are a patient Mandarin Chinese tutor for an English-speaking beginner. "
    "Use Simplified Chinese characters for Chinese text. The student only reads English: write every "
    "explanation, memory hook, breakdown, translation and piece of feedback in ENGLISH, quoting characters only when needed. "
    "Always answer with a single JSON object and nothing else."
)


class AIError(Exception):
    pass


def _config():
    s = settings.get_all()
    if not s["ai_enabled"]:
        raise AIError("AI is turned off in settings")
    return s


def _parse_json(text: str):
    text = text.strip()
    # Drop <think> blocks and code fences some models add.
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = min([i for i in (text.find("{"), text.find("[")) if i >= 0], default=-1)
        end = max(text.rfind("}"), text.rfind("]"))
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise AIError(f"Model did not return JSON: {text[:200]}")


async def chat(user_content, *, temperature=0.7, timeout=120.0, json_mode=True):
    s = _config()
    url = s["llm_base_url"].rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {s['llm_api_key']}"} if s["llm_api_key"] else {}
    body = {
        "model": s["llm_model"],
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user_content}],
        "temperature": temperature,
        "stream": False,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.post(url, json=body, headers=headers)
            if r.status_code == 400 and json_mode:
                # Some servers don't support response_format; the prompt asks for JSON anyway.
                body.pop("response_format")
                r = await client.post(url, json=body, headers=headers)
        except httpx.HTTPError as e:
            raise AIError(f"Could not reach model server at {s['llm_base_url']}: {e}") from e
    if r.status_code != 200:
        raise AIError(f"Model server error {r.status_code}: {r.text[:300]}")
    content = r.json()["choices"][0]["message"].get("content") or ""
    return _parse_json(content)


async def status() -> dict:
    s = settings.get_all()
    if not s["ai_enabled"]:
        return {"ok": False, "enabled": False, "message": "AI is turned off"}
    url = s["llm_base_url"].rstrip("/") + "/models"
    headers = {"Authorization": f"Bearer {s['llm_api_key']}"} if s["llm_api_key"] else {}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(url, headers=headers)
        models = [m.get("id") for m in r.json().get("data", [])]
    except Exception as e:  # noqa: BLE001 — any failure just means "offline"
        return {"ok": False, "enabled": True, "message": f"Can't reach {s['llm_base_url']} ({e.__class__.__name__})"}
    found = s["llm_model"] in models or any(m and m.split(":")[0] == s["llm_model"] for m in models)
    msg = "Connected" if found else f"Server is up but model '{s['llm_model']}' isn't listed"
    return {"ok": found, "enabled": True, "model": s["llm_model"], "models": models, "message": msg}


# ---------------------------------------------------------------- features


async def generate_sentences(known: list[dict], focus: list[dict], count: int, avoid: list[str]) -> list[dict]:
    vocab = "; ".join(f"{w['hanzi']} ({w['english']})" for w in known[:300])
    focus_txt = ", ".join(w["hanzi"] for w in focus) or "any"
    avoid_txt = " / ".join(avoid[:30]) or "none"
    prompt = f"""Create {count} short, natural Mandarin practice sentences for a beginner.

Rules:
- Use ONLY words from this vocabulary list (plus very common particles if unavoidable): {vocab}
- Try to include these focus words: {focus_txt}
- 3 to 10 Chinese characters each. Everyday, natural sentences a native speaker would say.
- Vary the grammar (statements, questions with 吗/什么/哪儿, negation with 不/没).
- Don't repeat these recent sentences: {avoid_txt}
- "en" is a natural English translation. "zh" is the Chinese in simplified characters, no spaces.

Return JSON: {{"sentences": [{{"en": "...", "zh": "..."}}]}}"""
    data = await chat(prompt, temperature=0.9)
    items = data.get("sentences", data) if isinstance(data, dict) else data
    out = []
    for it in items if isinstance(items, list) else []:
        if isinstance(it, dict) and it.get("en") and hanzi_only(it.get("zh", "")):
            out.append({"en": str(it["en"]).strip(), "zh": str(it["zh"]).strip()})
    if not out:
        raise AIError("Model returned no usable sentences")
    return out


async def grade_translation(english: str, reference: str, answer: str) -> dict:
    prompt = f"""A student translated an English sentence into Chinese.

English: {english}
Reference translation: {reference}
Student's answer: {answer}

Decide whether the student's answer is a correct, natural translation. Different but valid
wordings are correct. Ignore punctuation and spacing. Be encouraging but honest.

Return JSON: {{"correct": true/false, "score": 0-100, "feedback": "one or two short sentences in English",
"corrected": "the best correct Chinese version closest to the student's answer"}}"""
    data = await chat(prompt, temperature=0.2)
    return {
        "correct": bool(data.get("correct")),
        "score": int(data.get("score", 0) or 0),
        "feedback": str(data.get("feedback", "")),
        "corrected": str(data.get("corrected", reference)),
    }


async def word_extras(word: dict) -> dict:
    prompt = f"""Help me remember the Chinese word {word['hanzi']} ({word['pinyin']}) meaning "{word['english']}".

Return JSON: {{
 "example_zh": "a short, simple example sentence using it (simplified characters)",
 "example_en": "its English translation",
 "mnemonic": "a vivid one-sentence memory hook IN ENGLISH linking the shape/components of the character(s) to the meaning",
 "components": "brief breakdown IN ENGLISH of the character components/radicals, e.g. 亻 person + 尔 you"
}}"""
    data = await chat(prompt, temperature=0.6)
    return {k: str(data.get(k, "")) for k in ("example_zh", "example_en", "mnemonic", "components")}


async def fill_word(query: str) -> dict:
    prompt = f"""The user wants to add a word to their Chinese study list. Their input: "{query}"
It may be English, pinyin or Chinese characters. Pick the most common everyday Mandarin word.

Return JSON: {{"hanzi": "simplified characters", "english": "short English meaning(s)"}}"""
    data = await chat(prompt, temperature=0.2)
    return {"hanzi": hanzi_only(str(data.get("hanzi", ""))), "english": str(data.get("english", "")).strip()}


async def assess_audio(wav_b64: str, expected: str, pinyin: str) -> dict:
    prompt = [
        {
            "type": "text",
            "text": f"""The attached audio is a beginner saying a Mandarin phrase.
Target: {expected} ({pinyin}).

Listen carefully. Transcribe what you actually hear (characters), judge pronunciation and
especially the tones of each syllable, and give a short, specific tip.

Return JSON: {{"heard": "characters you heard", "score": 0-100, "feedback": "one or two short sentences in English",
"syllables": [{{"syllable": "pinyin with tone mark", "ok": true/false, "note": "short note if wrong"}}]}}""",
        },
        {"type": "input_audio", "input_audio": {"data": wav_b64, "format": "wav"}},
    ]
    data = await chat(prompt, temperature=0.2, timeout=180)
    return {
        "heard": str(data.get("heard", "")),
        "score": int(data.get("score", 0) or 0),
        "feedback": str(data.get("feedback", "")),
        "syllables": data.get("syllables", []) if isinstance(data.get("syllables"), list) else [],
    }
