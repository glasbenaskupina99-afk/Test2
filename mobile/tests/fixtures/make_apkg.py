"""Builds the small Anki decks used by the tests: an old-format (.anki2) Chinese deck and a
new-format (.anki21b, zstd) Japanese deck. Run: python3 make_apkg.py"""
import json, os, sqlite3, tempfile, zipfile
import zstandard

HERE = os.path.dirname(os.path.abspath(__file__))

def legacy():
    path = tempfile.mktemp()
    db = sqlite3.connect(path)
    db.executescript("""
      CREATE TABLE col (id integer primary key, models text, decks text);
      CREATE TABLE notes (id integer primary key, mid integer, flds text, tags text);
      CREATE TABLE cards (id integer primary key, nid integer, did integer, ivl integer, reps integer, lapses integer, type integer);
    """)
    models = {"1001": {"name": "Chinese (basic)", "flds": [{"name": "Hanzi", "ord": 0}, {"name": "Pinyin", "ord": 1}, {"name": "English", "ord": 2}, {"name": "Audio", "ord": 3}]}}
    decks = {"1": {"name": "Default"}, "2001": {"name": "Chinese::HSK Extra"}}
    db.execute("INSERT INTO col VALUES (1, ?, ?)", (json.dumps(models), json.dumps(decks)))
    notes = [
        ("<b>熊猫</b>", "xióng māo", "panda", "[sound:xiongmao.mp3]", 2, 40, 9, 1),
        ("电脑", "diàn nǎo", "computer; PC", "", 2, 12, 5, 0),
        ("长颈鹿", "cháng jǐng lù", "giraffe&nbsp;", "", 0, 0, 0, 0),
        ("火车<br>huǒchē", "huǒ chē", "train", "", 1, 1, 2, 1),
    ]
    for i, (hz, py, en, au, typ, ivl, reps, lapses) in enumerate(notes, 1):
        db.execute("INSERT INTO notes VALUES (?, 1001, ?, 'hsk')", (i, "\x1f".join([hz, py, en, au])))
        db.execute("INSERT INTO cards VALUES (?, ?, 2001, ?, ?, ?, ?)", (i, i, ivl, reps, lapses, typ))
    db.commit(); db.close()
    with zipfile.ZipFile(os.path.join(HERE, "chinese-legacy.apkg"), "w") as z:
        z.write(path, "collection.anki2")
        z.writestr("media", "{}")

def modern():
    path = tempfile.mktemp()
    db = sqlite3.connect(path)
    db.executescript("""
      CREATE TABLE notetypes (id integer primary key, name text);
      CREATE TABLE fields (ntid integer, ord integer, name text, PRIMARY KEY (ntid, ord));
      CREATE TABLE decks (id integer primary key, name text);
      CREATE TABLE notes (id integer primary key, mid integer, flds text, tags text);
      CREATE TABLE cards (id integer primary key, nid integer, did integer, ivl integer, reps integer, lapses integer, type integer);
    """)
    db.execute("INSERT INTO notetypes VALUES (77, 'Japanese vocab')")
    for o, n in enumerate(["Expression", "Meaning", "Notes"]):
        db.execute("INSERT INTO fields VALUES (77, ?, ?)", (o, n))
    db.execute("INSERT INTO decks VALUES (5, 'Japanese' || char(31) || 'Core')")
    notes = [("日本語[にほんご]", "Japanese (language)"), ("食[た]べる", "to eat"), ("学生[がくせい]", "student; pupil")]
    for i, (ex, en) in enumerate(notes, 1):
        db.execute("INSERT INTO notes VALUES (?, 77, ?, '')", (i, "\x1f".join([ex, en, ""])))
        db.execute("INSERT INTO cards VALUES (?, ?, 5, ?, 3, 0, 2)", (i, i, 10 * i))
    db.commit(); db.close()
    raw = open(path, "rb").read()
    with zipfile.ZipFile(os.path.join(HERE, "japanese-modern.apkg"), "w") as z:
        z.writestr("collection.anki21b", zstandard.ZstdCompressor().compress(raw))
        z.writestr("collection.anki2", b"")  # newer exports ship a placeholder here

legacy()
modern()
print("fixtures written")
