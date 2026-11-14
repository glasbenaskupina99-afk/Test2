"""Merges translated job files into app/data/i18n/<lang>/.

Usage: python3 site-tools/i18n-merge.py <dir with src/ and out/<lang>/>
src/<job>.json are the English sources (key -> text), out/<lang>/<job>.json the translations.
Entries that are missing, empty or break placeholders ({0} …) are left out (the app falls back to English).
"""
import json, os, re, sys, glob

base = sys.argv[1]
root = os.path.join(os.path.dirname(__file__), "..", "app", "data", "i18n")
PH = re.compile(r"\{\d+\}")
CJK = re.compile(r"[\u4e00-\u9fff\u3040-\u30ff]")
KANA = re.compile(r"[\u3040-\u30ff]")


def suspicious(lang, en, v):
    """True when a translation is probably in the wrong language or belongs to another line."""
    src_cjk = set(CJK.findall(en))
    if lang != "ja" and src_cjk:
        # Characters quoted in the English must still be there (a shifted line loses them).
        if len(src_cjk & set(CJK.findall(v))) < len(src_cjk) / 2:
            return True
    if lang != "ja" and KANA.search(v) and not KANA.search(en):
        return True
    if lang == "ja" and re.search(r"[A-Za-z]{4}", en) and not CJK.search(v) and v != en:
        return True
    return False


def load(p):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception as e:
        print("  ! cannot read", p, e)
        return {}


for lang_dir in sorted(glob.glob(os.path.join(base, "out", "*"))):
    lang = os.path.basename(lang_dir)
    files = {}  # target name -> dict

    def put(target, key, value):
        files.setdefault(target, {})[key] = value

    for path in sorted(glob.glob(os.path.join(lang_dir, "*.json"))):
        job = os.path.basename(path)[:-5]
        src = load(os.path.join(base, "src", job + ".json"))
        out = load(path)
        ok = bad = 0
        for k, en in src.items():
            v = out.get(k)
            if not isinstance(v, str) or not v.strip():
                bad += 1
                continue
            if set(PH.findall(v)) - set(PH.findall(en)):
                bad += 1
                continue
            if suspicious(lang, en, v):
                bad += 1
                if bad <= 3 + ok // 1000:
                    print("   ? ", k, "|", en[:60], "→", v[:60])
                continue
            ok += 1
            if job == "ui":
                put("ui", k, v)
            elif job.startswith("meanings_"):
                put("meanings", f"{job.split('_')[1]}|{k}", v)
            elif job == "sl_and_sentences":
                if k.startswith("sl|"):
                    put("meanings", k, v)
                else:
                    put("sentences", k, v)
            elif job.startswith("grammar_"):
                put("grammar-" + job.split("_", 1)[1], k, v)
            elif job.startswith("stories_"):
                put("stories-" + job.split("_", 1)[1], k, v)
            elif job.startswith("extras_"):
                put("extras-" + job.split("_")[1], k, v)
        print(f"{lang} {job}: {ok} ok, {bad} missing/bad")
    manual = load(os.path.join(os.path.dirname(__file__), "i18n-manual.json")).get(lang, {})
    for k, v in manual.items():
        put("ui", k, v)
    os.makedirs(os.path.join(root, lang), exist_ok=True)
    for name, d in files.items():
        target = os.path.join(root, lang, name + ".json")
        old = load(target) if os.path.exists(target) else {}
        old.update(d)
        json.dump(old, open(target, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
