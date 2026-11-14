"""Pinyin helpers: normalising, comparing typed answers, and hanzi -> pinyin."""
import re
import unicodedata

from pypinyin import Style, lazy_pinyin

_TONE_MARKS = {
    "̄": 1,  # macron  ā
    "́": 2,  # acute   á
    "̌": 3,  # caron   ǎ
    "̀": 4,  # grave   à
}

HANZI_RE = re.compile(r"[㐀-鿿豈-﫿]")


def split_tones(text: str) -> tuple[str, list[int]]:
    """Return (letters, tones) for pinyin written with tone marks or numbers.

    The tone sequence is compared in order, so "bàba", "ba4ba" and "ba4 ba5"
    all give ("baba", [4]). Neutral tones (5 / no mark) are ignored.
    """
    text = unicodedata.normalize("NFD", text.lower())
    letters: list[str] = []
    tones: list[int] = []
    for ch in text:
        if ch in _TONE_MARKS:
            tones.append(_TONE_MARKS[ch])
        elif ch in "1234":
            tones.append(int(ch))
        elif ch == "̈" or ch in ":":  # ü written as u + diaeresis or u:
            letters.append("v")
        elif "a" <= ch <= "z":
            letters.append("v" if ch == "ü" else ch)
    return "".join(letters).replace("uv", "v"), tones


def compare_pinyin(answer: str, expected: str) -> dict:
    """Grade a typed pinyin answer. Result: correct / tones_wrong / wrong."""
    a_letters, a_tones = split_tones(answer)
    e_letters, e_tones = split_tones(expected)
    if a_letters != e_letters:
        return {"result": "wrong"}
    if a_tones == e_tones:
        return {"result": "correct"}
    return {"result": "tones_wrong"}


def hanzi_only(text: str) -> str:
    return "".join(HANZI_RE.findall(text or ""))


def to_pinyin(text: str) -> str:
    """Tone-marked pinyin, one syllable per hanzi, separated by spaces."""
    return " ".join(lazy_pinyin(hanzi_only(text), style=Style.TONE))


def syllables_numbered(text: str) -> list[str]:
    return lazy_pinyin(hanzi_only(text), style=Style.TONE3, neutral_tone_with_five=True)


def compare_spoken(heard: str, expected: str) -> dict:
    """Compare recognised speech (hanzi) with the expected hanzi syllable by syllable.

    Homophones count as correct because we compare pinyin, not characters.
    """
    exp = syllables_numbered(expected)
    got = syllables_numbered(heard)
    # Simple alignment via LCS on syllables-with-tone, falling back to toneless.
    n, m = len(exp), len(got)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            if exp[i][:-1] == got[j][:-1]:
                dp[i][j] = dp[i + 1][j + 1] + 1
            else:
                dp[i][j] = max(dp[i + 1][j], dp[i][j + 1])
    i = j = 0
    result = [{"expected": s, "status": "missing"} for s in exp]
    while i < n and j < m:
        if exp[i][:-1] == got[j][:-1]:
            result[i]["heard"] = got[j]
            result[i]["status"] = "ok" if exp[i] == got[j] or exp[i].endswith("5") else "tone"
            i += 1
            j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]:
            i += 1
        else:
            j += 1
    ok = sum(r["status"] == "ok" for r in result)
    tone = sum(r["status"] == "tone" for r in result)
    score = round(100 * (ok + 0.5 * tone) / max(n, 1))
    return {"score": score, "syllables": result, "heard_pinyin": to_pinyin(heard)}
