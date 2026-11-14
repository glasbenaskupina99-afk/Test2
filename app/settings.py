"""User settings: environment defaults, overridable from the Settings screen."""
import json
import os

from .db import db

DEFAULTS = {
    # Any OpenAI-compatible server: Ollama (http://host:11434/v1), llama.cpp server,
    # LM Studio, vLLM...
    "llm_base_url": os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1"),
    "llm_model": os.environ.get("LLM_MODEL", "gemma4:e4b"),
    "llm_api_key": os.environ.get("LLM_API_KEY", ""),
    "ai_enabled": os.environ.get("AI_ENABLED", "1") not in ("0", "false", "no"),
    # How pronunciation is checked:
    #   browser - the phone's speech recogniser (Web Speech API)
    #   ai      - send the recording to Gemma (needs a server that accepts audio input)
    #   self    - just record, play back next to the reference and grade yourself
    "speech_mode": os.environ.get("SPEECH_MODE", "browser"),
    "daily_goal": 30,
    "new_per_lesson": 5,
    "review_size": 15,
    "sentence_count": 6,
    # Hanzi Writer: higher leniency accepts sloppier strokes.
    "leniency": 1.0,
    "hint_after_misses": 3,
    "tts_rate": 0.8,
}


def get_all() -> dict:
    out = dict(DEFAULTS)
    with db() as c:
        for row in c.execute("SELECT key, value FROM settings"):
            if row["key"] in DEFAULTS:
                out[row["key"]] = json.loads(row["value"])
    return out


def get(key: str):
    return get_all()[key]


def update(values: dict) -> dict:
    with db() as c:
        for key, value in values.items():
            if key not in DEFAULTS:
                continue
            default = DEFAULTS[key]
            if isinstance(default, bool):
                value = bool(value)
            elif isinstance(default, int):
                value = int(value)
            elif isinstance(default, float):
                value = float(value)
            else:
                value = str(value).strip()
            c.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, json.dumps(value)),
            )
    return get_all()


def public() -> dict:
    s = get_all()
    s["llm_api_key"] = "••••" if s["llm_api_key"] else ""
    return s
