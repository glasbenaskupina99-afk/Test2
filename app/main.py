import asyncio
import json
from contextlib import asynccontextmanager
import logging
import random
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import ai, chardata, settings, srs
from .db import db, init, rows
from .pinyin import compare_pinyin, compare_spoken, hanzi_only, to_pinyin

log = logging.getLogger("hanzi")
STATIC = Path(__file__).resolve().parent / "static"
FALLBACK_SENTENCES = json.loads((Path(__file__).resolve().parent / "data" / "sentences.json").read_text("utf-8"))

@asynccontextmanager
async def lifespan(_app):
    init()
    if not chardata.have_all():
        # Grab the full stroke set in the background; single chars are fetched on demand meanwhile.
        asyncio.get_running_loop().run_in_executor(None, _download_chardata)
    yield


app = FastAPI(title="Language Master", lifespan=lifespan)


def _download_chardata():
    try:
        chardata.download_all()
    except Exception as e:  # noqa: BLE001
        log.warning("bulk stroke data download failed (will fetch per character): %s", e)


@app.exception_handler(ai.AIError)
async def ai_error(_, exc: ai.AIError):
    return JSONResponse({"detail": str(exc), "ai_error": True}, status_code=503)


# ------------------------------------------------------------------ helpers


def add_activity(xp=0, new_words=0, reviews=0, sentences=0):
    today = date.today().isoformat()
    with db() as c:
        c.execute(
            "INSERT INTO activity (day, xp, new_words, reviews, sentences) VALUES (?, ?, ?, ?, ?)"
            " ON CONFLICT(day) DO UPDATE SET xp = xp + excluded.xp, new_words = new_words + excluded.new_words,"
            " reviews = reviews + excluded.reviews, sentences = sentences + excluded.sentences",
            (today, xp, new_words, reviews, sentences),
        )


def streak() -> int:
    with db() as c:
        days = {r["day"] for r in c.execute("SELECT day FROM activity WHERE xp > 0")}
    d = date.today()
    if d.isoformat() not in days:
        d -= timedelta(days=1)
    n = 0
    while d.isoformat() in days:
        n += 1
        d -= timedelta(days=1)
    return n


def word_row(word_id: int) -> dict:
    with db() as c:
        r = c.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()
    if not r:
        raise HTTPException(404, "word not found")
    return clean_word(dict(r))


def clean_word(w: dict) -> dict:
    w["extras"] = json.loads(w["extras"]) if w.get("extras") else None
    return w


def learned_words() -> list[dict]:
    with db() as c:
        return rows(
            c.execute(
                "SELECT DISTINCT w.id, w.hanzi, w.pinyin, w.english FROM words w"
                " JOIN cards ON cards.word_id = w.id ORDER BY w.position, w.id"
            )
        )


# ------------------------------------------------------------------ home


@app.get("/api/home")
def home():
    s = settings.get_all()
    today = date.today().isoformat()
    now = srs.fmt(srs.now())
    with db() as c:
        act = c.execute("SELECT * FROM activity WHERE day = ?", (today,)).fetchone()
        due = c.execute("SELECT COUNT(*) FROM cards WHERE due <= ?", (now,)).fetchone()[0]
        learned = c.execute("SELECT COUNT(DISTINCT word_id) FROM cards").fetchone()[0]
        total = c.execute("SELECT COUNT(*) FROM words").fetchone()[0]
        units = rows(
            c.execute(
                """SELECT w.unit AS name, MIN(w.position) AS pos, COUNT(*) AS total,
                          COUNT(DISTINCT c.word_id) AS learned
                   FROM words w LEFT JOIN cards c ON c.word_id = w.id
                   GROUP BY w.unit ORDER BY pos"""
            )
        )
        week = rows(
            c.execute(
                "SELECT day, xp FROM activity WHERE day >= ? ORDER BY day",
                ((date.today() - timedelta(days=6)).isoformat(),),
            )
        )
        next_due = c.execute("SELECT MIN(due) FROM cards WHERE due > ?", (now,)).fetchone()[0]
    return {
        "streak": streak(),
        "xp_today": act["xp"] if act else 0,
        "daily_goal": s["daily_goal"],
        "due": due,
        "next_due": next_due,
        "learned": learned,
        "total": total,
        "units": units,
        "week": week,
    }


# ------------------------------------------------------------------ words


@app.get("/api/words")
def list_words():
    with db() as c:
        words = rows(
            c.execute(
                """SELECT w.id, w.hanzi, w.pinyin, w.english, w.unit, w.source,
                          COUNT(c.skill) AS cards, MIN(c.due) AS due, AVG(c.interval) AS strength,
                          SUM(c.lapses) AS lapses
                   FROM words w LEFT JOIN cards c ON c.word_id = w.id
                   GROUP BY w.id ORDER BY w.position, w.id"""
            )
        )
    return words


class NewWord(BaseModel):
    hanzi: str
    english: str
    pinyin: str | None = None


@app.post("/api/words")
def add_word(body: NewWord):
    hanzi = hanzi_only(body.hanzi)
    if not hanzi or not body.english.strip():
        raise HTTPException(400, "Need Chinese characters and an English meaning")
    pinyin = (body.pinyin or "").strip() or to_pinyin(hanzi)
    with db() as c:
        if c.execute("SELECT 1 FROM words WHERE hanzi = ?", (hanzi,)).fetchone():
            raise HTTPException(409, f"{hanzi} is already in your list")
        cur = c.execute(
            "INSERT INTO words (hanzi, pinyin, english, unit, position, source) VALUES (?, ?, ?, 'My words', ?, 'custom')",
            (hanzi, pinyin, body.english.strip(), 100000),
        )
        wid = cur.lastrowid
    return word_row(wid)


class Query(BaseModel):
    query: str


@app.post("/api/words/ai-fill")
async def ai_fill(body: Query):
    data = await ai.fill_word(body.query)
    if not data["hanzi"]:
        raise HTTPException(422, "Couldn't figure that word out")
    data["pinyin"] = to_pinyin(data["hanzi"])
    return data


@app.post("/api/words/pinyin")
def pinyin_for(body: Query):
    return {"pinyin": to_pinyin(body.query)}


@app.delete("/api/words/{word_id}")
def delete_word(word_id: int):
    with db() as c:
        c.execute("DELETE FROM words WHERE id = ?", (word_id,))
    return {"ok": True}


@app.post("/api/words/{word_id}/reset")
def reset_word(word_id: int):
    with db() as c:
        c.execute("DELETE FROM cards WHERE word_id = ?", (word_id,))
    return {"ok": True}


@app.get("/api/words/{word_id}/extras")
async def extras(word_id: int, refresh: bool = False):
    w = word_row(word_id)
    if w["extras"] and not refresh:
        return w["extras"]
    data = await ai.word_extras(w)
    if data.get("example_zh"):
        data["example_pinyin"] = to_pinyin(data["example_zh"])
    with db() as c:
        c.execute("UPDATE words SET extras = ? WHERE id = ?", (json.dumps(data, ensure_ascii=False), word_id))
    return data


# ------------------------------------------------------------------ learn (new words)


@app.get("/api/learn/next")
def learn_next(n: int | None = None):
    n = n or settings.get("new_per_lesson")
    with db() as c:
        words = rows(
            c.execute(
                """SELECT * FROM words WHERE id NOT IN (SELECT word_id FROM cards)
                   ORDER BY position, id LIMIT ?""",
                (n,),
            )
        )
        others = rows(c.execute("SELECT id, hanzi, pinyin, english FROM words ORDER BY RANDOM() LIMIT 40"))
    return {"words": [clean_word(w) for w in words], "pool": others}


class LearnDone(BaseModel):
    word_ids: list[int]
    xp: int = 0


@app.post("/api/learn/complete")
def learn_complete(body: LearnDone):
    first_due = srs.fmt(srs.now() + timedelta(hours=20))
    with db() as c:
        for wid in body.word_ids:
            for skill in srs.SKILLS:
                c.execute(
                    "INSERT OR IGNORE INTO cards (word_id, skill, due, interval) VALUES (?, ?, ?, 0.8)",
                    (wid, skill, first_due),
                )
    add_activity(xp=body.xp, new_words=len(body.word_ids))
    return {"ok": True, "streak": streak()}


# ------------------------------------------------------------------ review (old words)


@app.get("/api/review/session")
def review_session(extra: bool = False):
    size = settings.get("review_size")
    now = srs.fmt(srs.now())
    with db() as c:
        if extra:
            # Nothing due: practise the weakest cards anyway.
            cards = rows(
                c.execute(
                    "SELECT * FROM cards ORDER BY (lapses * 2 - interval) DESC, due LIMIT ?",
                    (size,),
                )
            )
        else:
            cards = rows(c.execute("SELECT * FROM cards WHERE due <= ? ORDER BY due LIMIT ?", (now, size)))
        pool = rows(c.execute("SELECT id, hanzi, pinyin, english FROM words ORDER BY RANDOM() LIMIT 60"))
        learned_pool = rows(
            c.execute(
                "SELECT id, hanzi, pinyin, english FROM words WHERE id IN (SELECT word_id FROM cards)"
                " ORDER BY RANDOM() LIMIT 60"
            )
        )
    items = []
    for card in cards:
        w = word_row(card["word_id"])
        items.append({"skill": card["skill"], "word": w})
    random.shuffle(items)
    # Avoid the same word twice in a row where possible.
    for i in range(1, len(items)):
        if items[i]["word"]["id"] == items[i - 1]["word"]["id"]:
            for j in range(i + 1, len(items)):
                if items[j]["word"]["id"] != items[i - 1]["word"]["id"]:
                    items[i], items[j] = items[j], items[i]
                    break
    return {"items": items, "pool": learned_pool if len(learned_pool) >= 8 else pool}


class Answer(BaseModel):
    word_id: int
    skill: str
    grade: int


@app.post("/api/review/answer")
def review_answer(body: Answer):
    grade = max(0, min(3, body.grade))
    with db() as c:
        card = c.execute(
            "SELECT * FROM cards WHERE word_id = ? AND skill = ?", (body.word_id, body.skill)
        ).fetchone()
        if not card:
            raise HTTPException(404, "card not found")
        new = srs.schedule(dict(card), grade)
        c.execute(
            "UPDATE cards SET ease=:ease, interval=:interval, reps=:reps, lapses=:lapses, due=:due,"
            " last_review=:last_review WHERE word_id=:wid AND skill=:skill",
            {**new, "wid": body.word_id, "skill": body.skill},
        )
    xp = 3 if grade >= 2 else 1
    add_activity(xp=xp, reviews=1)
    return {"xp": xp, **new}


@app.post("/api/check/pinyin")
def check_pinyin(body: dict):
    return compare_pinyin(str(body.get("answer", "")), str(body.get("expected", "")))


# ------------------------------------------------------------------ sentences


def _decorate(sent: dict, known_chars: set[str], source: str) -> dict:
    zh = sent["zh"]
    chars = hanzi_only(zh)
    return {
        "en": sent["en"],
        "zh": zh,
        "chars": [{"c": ch, "known": ch in known_chars} for ch in chars],
        "pinyin": to_pinyin(zh),
        "source": source,
    }


def _fallback_sentences(known_chars: set[str], count: int, avoid: set[str]) -> list[dict]:
    def coverage(s):
        chars = hanzi_only(s[1])
        return sum(ch in known_chars for ch in chars) / len(chars)

    cands = [s for s in FALLBACK_SENTENCES if s[1] not in avoid] or FALLBACK_SENTENCES
    random.shuffle(cands)
    cands.sort(key=coverage, reverse=True)
    return [{"en": en, "zh": zh} for en, zh in cands[:count]]


@app.get("/api/sentences/session")
async def sentence_session(use_ai: bool = True):
    s = settings.get_all()
    count = s["sentence_count"]
    known = learned_words()
    known_chars = {ch for w in known for ch in w["hanzi"]}
    with db() as c:
        recent = [r["hanzi"] for r in c.execute("SELECT hanzi FROM sentence_log ORDER BY id DESC LIMIT 40")]
        # Focus on words that were reviewed badly or are due soon.
        focus = rows(
            c.execute(
                """SELECT w.hanzi, w.english FROM cards c JOIN words w ON w.id = c.word_id
                   GROUP BY w.id ORDER BY SUM(c.lapses) DESC, MIN(c.due) LIMIT 6"""
            )
        )
    note = None
    sentences: list[dict] = []
    if use_ai and s["ai_enabled"] and len(known) >= 5:
        try:
            gen = await ai.generate_sentences(known, focus, count, recent)
            sentences = [_decorate(x, known_chars, "ai") for x in gen[:count]]
        except ai.AIError as e:
            log.info("AI sentences unavailable: %s", e)
            note = "AI is offline — using built-in sentences"
    elif use_ai and s["ai_enabled"]:
        note = "Learn at least 5 words for AI sentences — using built-in ones for now."
    if not sentences:
        sentences = [_decorate(x, known_chars, "builtin") for x in _fallback_sentences(known_chars, count, set(recent))]
    return {"sentences": sentences, "note": note}


class GradeReq(BaseModel):
    en: str
    zh: str
    answer: str


@app.post("/api/sentences/grade")
async def sentence_grade(body: GradeReq):
    ans_hanzi = hanzi_only(body.answer)
    ref = hanzi_only(body.zh)
    if ans_hanzi == ref:
        return {"correct": True, "score": 100, "feedback": "Perfect!", "corrected": body.zh, "by": "exact"}
    if not ans_hanzi:
        # Typed pinyin instead of characters.
        r = compare_pinyin(body.answer, to_pinyin(body.zh))
        if r["result"] == "correct":
            return {"correct": True, "score": 100, "feedback": "Correct pinyin!", "corrected": body.zh, "by": "pinyin"}
        if r["result"] == "tones_wrong":
            return {"correct": False, "score": 70, "feedback": "Right syllables — check your tones.", "corrected": body.zh, "by": "pinyin"}
    if settings.get("ai_enabled"):
        try:
            res = await ai.grade_translation(body.en, body.zh, body.answer)
            res["by"] = "ai"
            return res
        except ai.AIError as e:
            log.info("AI grading unavailable: %s", e)
    return {"correct": False, "score": 0, "feedback": "Doesn't match the expected answer.", "corrected": body.zh, "by": "exact"}


class SentenceLog(BaseModel):
    en: str
    zh: str
    mode: str
    score: int
    source: str = ""


@app.post("/api/sentences/log")
def sentence_log(body: SentenceLog):
    with db() as c:
        c.execute(
            "INSERT INTO sentence_log (english, hanzi, mode, score, source) VALUES (?, ?, ?, ?, ?)",
            (body.en, body.zh, body.mode, body.score, body.source),
        )
    xp = 5 if body.score >= 80 else 2
    add_activity(xp=xp, sentences=1)
    return {"xp": xp}


# ------------------------------------------------------------------ speech


class SpeechCompare(BaseModel):
    heard: str
    expected: str


@app.post("/api/speech/compare")
def speech_compare(body: SpeechCompare):
    return compare_spoken(body.heard, body.expected)


class SpeechAssess(BaseModel):
    audio: str  # base64 WAV, 16 kHz mono
    expected: str


@app.post("/api/speech/assess")
async def speech_assess(body: SpeechAssess):
    res = await ai.assess_audio(body.audio, body.expected, to_pinyin(body.expected))
    if res["heard"]:
        res["compare"] = compare_spoken(res["heard"], body.expected)
    return res


# ------------------------------------------------------------------ misc


@app.get("/api/chardata/{char}")
async def char_data(char: str):
    data = await chardata.get(char)
    if data is None:
        raise HTTPException(404, "no stroke data")
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=31536000"})


@app.get("/api/settings")
def get_settings():
    return settings.public()


@app.put("/api/settings")
def put_settings(body: dict):
    if body.get("llm_api_key") == "••••":
        body.pop("llm_api_key")
    settings.update(body)
    return settings.public()


@app.get("/api/ai/status")
async def ai_status():
    return await ai.status()


@app.get("/api/stats")
def stats():
    with db() as c:
        days = rows(c.execute("SELECT * FROM activity ORDER BY day DESC LIMIT 60"))
        skills = rows(
            c.execute(
                "SELECT skill, COUNT(*) AS n, AVG(interval) AS avg_interval, SUM(lapses) AS lapses FROM cards GROUP BY skill"
            )
        )
        hardest = rows(
            c.execute(
                """SELECT w.id, w.hanzi, w.pinyin, w.english, SUM(c.lapses) AS lapses
                   FROM cards c JOIN words w ON w.id = c.word_id
                   GROUP BY w.id HAVING lapses > 0 ORDER BY lapses DESC LIMIT 10"""
            )
        )
    return {"days": days, "skills": skills, "hardest": hardest, "streak": streak()}


app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/manifest.webmanifest")
def manifest():
    # The manifest uses paths relative to the web build; here static files live under /static.
    data = json.loads((STATIC / "manifest.webmanifest").read_text("utf-8"))
    data["start_url"] = data["scope"] = "/"
    for icon in data.get("icons", []):
        icon["src"] = "/static/" + icon["src"]
    return JSONResponse(data, media_type="application/manifest+json")
