"""Builds app/data/charmap.json: which parts every course character is made of.

Sources (both free licences, credited in the app):
  - Make Me a Hanzi dictionary.txt (LGPL-3.0): IDS decompositions + definitions + pinyin
  - KanjiVG (CC BY-SA 3.0): component groups for Japanese kanji that Make Me a Hanzi lacks
  - KANJIDIC via the kanji-data npm package (EDRDG licence, CC BY-SA 4.0): Japanese meanings and readings

Usage: python3 site-tools/build-charmap.py <dictionary.txt> <kanjivg-svg-dir> <kanji-meta.json>

Each entry: [Chinese meaning, pinyin, parts, Japanese meaning, Japanese reading]
"""
import json, pathlib, re, sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "app" / "data"
HAN = re.compile(r"[⺀-⿟㇀-㇯㐀-鿿豈-﫿\U00020000-\U0003134f]")
IDC2, IDC3 = set("⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻"), set("⿲⿳")
KVG = "{http://kanjivg.tagaini.net}"

# Meanings for radical forms that the dictionary leaves blank.
RADICALS = {
    "亻": "person", "氵": "water", "扌": "hand", "忄": "heart", "讠": "speech", "訁": "speech", "钅": "metal", "釒": "metal",
    "饣": "food", "飠": "food", "纟": "silk", "糹": "silk", "艹": "grass", "宀": "roof", "辶": "walk", "⻌": "walk", "阝": "city / hill",
    "刂": "knife", "⺈": "knife", "礻": "spirit", "衤": "clothing", "犭": "animal", "灬": "fire", "罒": "net", "冖": "cover",
    "亠": "lid", "疒": "sickness", "攵": "strike", "彳": "step", "广": "shelter", "囗": "enclosure", "冫": "ice", "丷": "eight",
    "⺊": "divination", "爫": "claw", "⺮": "bamboo", "⺌": "small", "⺍": "small", "牜": "cow", "⺧": "cow", "王": "king / jade",
    "月": "moon / flesh", "⺼": "flesh", "耂": "old", "⺶": "sheep", "⺷": "sheep", "𠂉": "person", "卄": "twenty", "龷": "together",
    "丶": "dot", "丿": "slash", "乚": "hook", "乙": "second", "亅": "hook", "丨": "line", "一": "one", "乀": "stroke", "⺀": "ice",
}

def parse_ids(s, i=0):
    """Returns (tree, next index). A tree is a char or (op, [subtrees])."""
    c = s[i]
    if c in IDC2 or c in IDC3:
        n, kids, j = (2 if c in IDC2 else 3), [], i + 1
        for _ in range(n):
            if j >= len(s): break
            t, j = parse_ids(s, j)
            kids.append(t)
        return (c, kids), j
    return c, i + 1

def leaves(t):
    if isinstance(t, str): return [t]
    return [x for k in t[1] for x in leaves(k)]

def parts_from_ids(ch, ids):
    if not ids or ids in ("？", ch): return []
    try:
        tree, _ = parse_ids(ids)
    except IndexError:
        return []
    if isinstance(tree, str): return []
    out = []
    for k in tree[1]:
        # a nameless sub-shape counts as its own pieces
        for x in ([k] if isinstance(k, str) else leaves(k)):
            if HAN.match(x) and x != ch and x not in out: out.append(x)
    return out

def parts_from_kvg(path, ch):
    root = ET.parse(path).getroot()
    top = next((g for g in root.iter("{http://www.w3.org/2000/svg}g") if g.get(KVG + "element") == ch), None)
    if top is None: return []
    out = []
    def walk(g):
        for k in g:
            if not k.tag.endswith("}g"): continue
            el = k.get(KVG + "element")
            if el and el != ch:
                if el not in out: out.append(el)
            else:
                walk(k)  # a group without a name: look at its pieces
    walk(top)
    return out

def course_chars(files):
    seen = []
    for f in files:
        for u in json.loads((DATA / f"{f}.json").read_text())["units"]:
            for w in u["words"]:
                for c in w[0]:
                    if HAN.match(c) and c not in seen: seen.append(c)
    return seen

def main(dict_path, kvg_dir, kanji_meta):
    K = json.loads(pathlib.Path(kanji_meta).read_text())
    D = {}
    for line in open(dict_path, encoding="utf8"):
        o = json.loads(line)
        D[o["character"]] = o
    kvg = pathlib.Path(kvg_dir)
    def parts(ch):
        if ch in D: return parts_from_ids(ch, D[ch].get("decomposition"))
        f = kvg / f"{ord(ch):05x}.svg"
        return parts_from_kvg(f, ch) if f.exists() else []
    zh = course_chars(["hsk1", "hsk2", "hsk3"])
    ja = course_chars(["japanese_n5", "japanese_n4", "japanese_n3"])
    out, todo, depth = {}, [(c, 0) for c in dict.fromkeys(zh + ja)], {}
    while todo:
        ch, d = todo.pop(0)
        if ch in out: continue
        ps = parts(ch)
        e = D.get(ch, {})
        meaning = RADICALS.get(ch) or (e.get("definition") or "").split(";")[0].split(",")[0].strip()[:40]
        k = K.get(ch) or {}
        ja_m = RADICALS.get(ch) or ", ".join((k.get("meanings") or [])[:2])[:40]
        ja_r = " · ".join(x for x in ((k.get("kun_readings") or [""])[0].split(".")[0], (k.get("on_readings") or [""])[0]) if x)
        out[ch] = [meaning or ja_m, " ".join(e.get("pinyin") or [])[:20], "".join(ps), ja_m or meaning, ja_r]
        if d < 3:  # parts of parts, three levels up, so the map has somewhere to go
            todo += [(p, d + 1) for p in ps if p not in out]
    payload = {
        "credits": "Character parts: Make Me a Hanzi (LGPL-3.0, github.com/skishore/makemeahanzi) and KanjiVG (CC BY-SA 3.0, kanjivg.tagaini.net). Japanese meanings and readings: KANJIDIC, EDRDG (CC BY-SA 4.0, edrdg.org).",
        "chars": out,
    }
    (DATA / "charmap.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    course = set(zh + ja)
    with_parts = sum(1 for c in course if out[c][2])
    print(f"{len(out)} characters, {with_parts}/{len(course)} course characters have parts")

if __name__ == "__main__":
    main(*sys.argv[1:4])
