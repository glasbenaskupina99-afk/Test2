"""Builds stories/sl_a1.json: eight short Slovenian A1 stories, mostly from the course words.

Each word is written as  surface | surface=lemma | surface=lemma:{meaning} | surface::{meaning}
(rojstni_dan: a course entry of two words)
- the lemma links the word to the course (kavo=kava → your word "kava"); the meaning then comes
  from the course in the interface language
- words that aren't in the course (or forms whose meaning differs) carry their own meaning
Run: python3 app/data/stories/make_sl.py  (checks every lemma against the course)
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).parent
COURSE = {w[0] for u in json.loads((HERE.parent / "slovenian_a1.json").read_text())["units"] for w in u["words"]}
PUNCT = re.compile(r"^[.,!?:;»«„“”…—-]+$")

S = [
    ("sl-s1", "V kavarni", "At the café", [
        ("Ana in Luka sta v kavarni.", "Ana and Luka are at a café.",
         "Ana::{Ana (name)} in Luka::{Luka (name)} sta=biti:{are (the two of them)} v kavarni=kavarna ."),
        ("Natakar vpraša: »Kaj želite?«", "The waiter asks: “What would you like?”",
         "Natakar vpraša=vprašati : » Kaj želite=želeti:{would you like (polite)} ? «"),
        ("Ana reče: »Kavo z mlekom, prosim.«", "Ana says: “A coffee with milk, please.”",
         "Ana::{Ana (name)} reče=reči : » Kavo=kava z mlekom=mleko:{with milk} , prosim . «"),
        ("Luka je lačen.", "Luka is hungry.", "Luka::{Luka (name)} je=biti lačen ."),
        ("On želi čaj in kos torte.", "He wants tea and a piece of cake.",
         "On želi=želeti čaj in kos torte=torta:{of cake} ."),
        ("»Račun, prosim!« reče Luka.", "“The bill, please!” says Luka.",
         "» Račun , prosim ! « reče=reči Luka::{Luka (name)} ."),
        ("Kava in torta sta dobri, pa tudi poceni.", "The coffee and the cake are good, and cheap too.",
         "Kava in torta sta=biti:{are (the two of them)} dobri=dober , pa tudi poceni ."),
    ], [
        ("Where are Ana and Luka?", ["At home", "At a café", "At school", "At the station"], 1),
        ("What does Ana order?", ["Tea", "Coffee with milk", "Water", "Juice"], 1),
        ("Who is hungry?", ["Ana", "The waiter", "Luka", "Nobody"], 2),
    ]),
    ("sl-s2", "Moja družina", "My family", [
        ("Ime mi je Maja.", "My name is Maja.", "Ime mi::{(to) me} je=biti Maja::{Maja (name)} ."),
        ("Imam veliko družino.", "I have a big family.", "Imam=imeti veliko=velik:{big} družino=družina ."),
        ("Moj oče je zdravnik, moja mama je učiteljica.", "My father is a doctor, my mother is a teacher.",
         "Moj oče je=biti zdravnik , moja=moj mama je=biti učiteljica ."),
        ("Imam brata in sestro.", "I have a brother and a sister.", "Imam=imeti brata=brat in sestro=sestra ."),
        ("Brat je star deset let.", "My brother is ten years old.", "Brat je=biti star deset let=leto:{years} ."),
        ("Sestra je študentka v Ljubljani.", "My sister is a student in Ljubljana.",
         "Sestra je=biti študentka v Ljubljani=Ljubljana:{in Ljubljana} ."),
        ("Ob nedeljah smo vsi doma in skupaj kosimo.", "On Sundays we're all at home and have lunch together.",
         "Ob::{on (days)} nedeljah=nedelja:{Sundays} smo=biti vsi doma in skupaj::{together} kosimo=kositi:{we have lunch} ."),
    ], [
        ("What does Maja's father do?", ["He's a teacher", "He's a doctor", "He's a waiter", "He's a driver"], 1),
        ("How old is her brother?", ["Five", "Ten", "Twenty", "Twelve"], 1),
        ("Where does her sister study?", ["In Maribor", "In Koper", "In Ljubljana", "In Vienna"], 2),
    ]),
    ("sl-s3", "Na tržnici", "At the market", [
        ("Danes je sobota.", "Today is Saturday.", "Danes je=biti sobota ."),
        ("Peter gre na tržnico.", "Peter goes to the market.", "Peter::{Peter (name)} gre=iti na tržnico=tržnica:{to the market} ."),
        ("Kupi jabolka, krompir in sir.", "He buys apples, potatoes and cheese.",
         "Kupi=kupiti jabolka=jabolko:{apples} , krompir in sir ."),
        ("»Koliko stane kilogram jabolk?« vpraša.", "“How much is a kilo of apples?” he asks.",
         "» Koliko stane=stati:{costs} kilogram jabolk=jabolko:{of apples} ? « vpraša=vprašati ."),
        ("»Dva evra,« reče prodajalec.", "“Two euros,” says the seller.", "» Dva evra=evro:{euros} , « reče=reči prodajalec ."),
        ("Peter plača z gotovino.", "Peter pays in cash.", "Peter::{Peter (name)} plača=plačati z gotovino=gotovina:{with cash} ."),
        ("Doma skuha dobro juho.", "At home he cooks a good soup.", "Doma skuha=skuhati:{cooks} dobro=dober juho=juha ."),
    ], [
        ("What day is it?", ["Monday", "Friday", "Saturday", "Sunday"], 2),
        ("How much is a kilo of apples?", ["One euro", "Two euros", "Five euros", "Ten euros"], 1),
        ("What does Peter cook at home?", ["Pizza", "Soup", "Cake", "Rice"], 1),
    ]),
    ("sl-s4", "Dežuje", "It's raining", [
        ("Danes je mrzlo in dežuje.", "Today it's cold and it's raining.", "Danes je=biti mrzlo in dežuje ."),
        ("Nina ne gre v park.", "Nina isn't going to the park.", "Nina::{Nina (name)} ne gre=iti v park ."),
        ("Doma bere knjigo in pije topel čaj.", "At home she reads a book and drinks warm tea.",
         "Doma bere=brati knjigo=knjiga in pije=piti topel čaj ."),
        ("Njena mačka spi na postelji.", "Her cat is sleeping on the bed.",
         "Njena=njen mačka spi=spati na postelji=postelja:{on the bed} ."),
        ("Popoldne pokliče prijateljico.", "In the afternoon she calls her friend.",
         "Popoldne pokliče=poklicati:{calls (on the phone)} prijateljico=prijateljica ."),
        ("»Jutri bo sončno,« reče prijateljica.", "“Tomorrow it'll be sunny,” says her friend.",
         "» Jutri bo=biti:{will be} sončno , « reče=reči prijateljica ."),
        ("»Potem greva jutri na sprehod!«", "“Then let's go for a walk tomorrow, the two of us!”",
         "» Potem::{then} greva=iti:{let's go (we two)} jutri na sprehod ! «"),
    ], [
        ("What's the weather like today?", ["Sunny", "Snowy", "Cold and rainy", "Warm"], 2),
        ("Where is the cat sleeping?", ["On the chair", "On the bed", "In the garden", "On the sofa"], 1),
        ("What will they do tomorrow?", ["Go for a walk", "Go to the cinema", "Cook together", "Go skiing"], 0),
    ]),
    ("sl-s5", "Nova služba", "A new job", [
        ("Tomaž ima novo službo.", "Tomaž has a new job.", "Tomaž::{Tomaž (name)} ima=imeti novo=nov službo=služba ."),
        ("Vsak dan vstane zgodaj.", "Every day he gets up early.", "Vsak::{every} dan vstane=vstati zgodaj ."),
        ("V službo gre z avtobusom.", "He goes to work by bus.", "V službo=služba:{to work} gre=iti z avtobusom=avtobus:{by bus} ."),
        ("Njegova pisarna je v centru mesta.", "His office is in the city centre.",
         "Njegova=njegov pisarna je=biti v centru=center:{in the centre} mesta=mesto:{of the city} ."),
        ("Sodelavci so prijazni.", "His colleagues are friendly.", "Sodelavci=sodelavec:{colleagues} so=biti prijazni=prijazen ."),
        ("Šef je včasih slabe volje.", "The boss is sometimes in a bad mood.",
         "Šef je=biti včasih slabe::{bad} volje::{mood (slabe volje = in a bad mood)} ."),
        ("Ampak Tomaž je vesel, ker ima zanimivo delo.", "But Tomaž is happy, because he has interesting work.",
         "Ampak Tomaž::{Tomaž (name)} je=biti vesel , ker ima=imeti zanimivo=zanimiv delo ."),
    ], [
        ("How does Tomaž get to work?", ["By car", "On foot", "By bus", "By train"], 2),
        ("Where is his office?", ["In the city centre", "At home", "By the sea", "In a village"], 0),
        ("Why is Tomaž happy?", ["His boss is always nice", "His work is interesting", "It's the weekend", "He has a new car"], 1),
    ]),
    ("sl-s6", "Izlet na Bled", "A trip to Bled", [
        ("V nedeljo gremo na izlet na Bled.", "On Sunday we're going on a trip to Bled.",
         "V nedeljo=nedelja:{on Sunday} gremo=iti na izlet na Bled::{Bled (a town by a lake)} ."),
        ("Gremo z vlakom, ker nimamo avta.", "We go by train, because we don't have a car.",
         "Gremo=iti z vlakom=vlak:{by train} , ker nimamo::{we don't have} avta=avto:{a car} ."),
        ("Bled je majhno mesto ob jezeru.", "Bled is a small town by a lake.",
         "Bled::{Bled} je=biti majhno=majhen mesto ob::{by; next to} jezeru=jezero:{the lake} ."),
        ("Na jezeru je otok s cerkvijo.", "On the lake there's an island with a church.",
         "Na jezeru=jezero:{on the lake} je=biti otok::{island} s=z cerkvijo=cerkev:{with a church} ."),
        ("Na gradu jemo kremno rezino.", "At the castle we eat a cream slice.",
         "Na gradu=grad:{at the castle} jemo=jesti kremno::{cream} rezino::{slice (kremna rezina: Bled's famous cream cake)} ."),
        ("Vreme je lepo in sonce sije.", "The weather is nice and the sun is shining.",
         "Vreme je=biti lepo=lep in sonce sije::{shines} ."),
        ("Zvečer smo utrujeni, ampak zelo veseli.", "In the evening we're tired, but very happy.",
         "Zvečer::{in the evening} smo=biti utrujeni=utrujen , ampak zelo veseli=vesel ."),
    ], [
        ("How do they get to Bled?", ["By car", "By train", "By bus", "On foot"], 1),
        ("What is on the lake?", ["A bridge", "An island with a church", "A hotel", "A castle"], 1),
        ("What do they eat at the castle?", ["Potica", "Pizza", "A cream slice", "Soup"], 2),
    ]),
    ("sl-s7", "Pri zdravniku", "At the doctor's", [
        ("Marko je bolan.", "Marko is ill.", "Marko::{Marko (name)} je=biti bolan ."),
        ("Boli ga glava in grlo.", "His head and throat hurt.", "Boli::{hurts} ga::{him} glava in grlo::{throat} ."),
        ("Gre k zdravniku.", "He goes to the doctor.", "Gre=iti k zdravniku=zdravnik:{to the doctor} ."),
        ("Zdravnica ga vpraša: »Kaj vas boli?«", "The doctor asks him: “What hurts?”",
         "Zdravnica ga::{him} vpraša=vprašati : » Kaj vas::{you (polite)} boli::{hurts} ? «"),
        ("»Glava in grlo. Zelo sem utrujen.«", "“My head and throat. I'm very tired.”",
         "» Glava=glava in grlo::{throat} . Zelo sem=biti utrujen . «"),
        ("Zdravnica mu da zdravilo.", "The doctor gives him medicine.", "Zdravnica mu::{(to) him} da=dati zdravilo ."),
        ("»Pijte veliko čaja in spite!«", "“Drink lots of tea and sleep!”",
         "» Pijte=piti:{drink! (polite)} veliko čaja=čaj:{of tea} in spite=spati:{sleep! (polite)} ! «"),
    ], [
        ("What hurts Marko?", ["His leg and back", "His head and throat", "His stomach", "A tooth"], 1),
        ("What does the doctor give him?", ["Tea", "Medicine", "Water", "Nothing"], 1),
        ("What should Marko do?", ["Go to work", "Drink tea and sleep", "Eat a lot", "Go skiing"], 1),
    ]),
    ("sl-s8", "Rojstni dan", "A birthday", [
        ("Jutri ima Eva rojstni dan.", "Tomorrow it's Eva's birthday.", "Jutri ima=imeti Eva::{Eva (name)} rojstni_dan ."),
        ("Stara bo dvajset let.", "She'll be twenty.", "Stara=star bo=biti:{will be} dvajset let=leto:{years} ."),
        ("Njeni prijatelji pripravijo zabavo.", "Her friends get a party ready.",
         "Njeni=njen prijatelji=prijatelj:{friends} pripravijo=pripraviti:{get ready} zabavo=zabava ."),
        ("Kupijo torto in rože.", "They buy a cake and flowers.", "Kupijo=kupiti torto=torta in rože=roža:{flowers} ."),
        ("Zvečer pride Eva domov.", "In the evening Eva comes home.", "Zvečer::{in the evening} pride=priti Eva::{Eva (name)} domov ."),
        ("Vsi zakličejo: »Vse najboljše!«", "Everyone shouts: “Happy birthday!”",
         "Vsi zakličejo::{shout} : » Vse::{everything} najboljše::{the best (vse najboljše = happy birthday!)} ! «"),
        ("Eva je zelo vesela, plešejo in pojejo do polnoči.", "Eva is very happy; they dance and sing until midnight.",
         "Eva::{Eva (name)} je=biti zelo vesela=vesel , plešejo=plesati in pojejo=peti do polnoči::{midnight} ."),
    ], [
        ("How old will Eva be?", ["Ten", "Twenty", "Thirty", "Twelve"], 1),
        ("What do her friends buy?", ["A cake and flowers", "A book", "A car", "Wine"], 0),
        ("Until when do they dance and sing?", ["Until midnight", "Until noon", "For an hour", "Until morning"], 0),
    ]),
]

def tokens(src, text):
    # "in" between words: a bare word that is in the course
    out, errs = [], []
    for raw in re.findall(r"[^\s{]*(?:\{[^}]*\})|\S+", src):
        raw = raw.replace("{", "").replace("}", "")
        if "::" not in raw and ":" not in raw.split("=", 1)[-1]:
            raw = raw.replace("_", " ")
        if PUNCT.match(raw):
            out.append([raw, "", ""])
            continue
        if "::" in raw:
            surf, mean = raw.split("::", 1)
            out.append([surf, "", mean])
            continue
        surf, lemma, mean = raw, "", ""
        if "=" in raw:
            surf, rest = raw.split("=", 1)
            lemma, _, mean = rest.partition(":")
        base = lemma or surf
        if not mean and base not in COURSE and base.lower() not in COURSE:
            errs.append(f"{surf} ({base}) isn't a course word and has no meaning")
        out.append([surf, lemma if lemma and lemma != surf else "", mean])
    # Spaces between words (not before punctuation, not after an opening quote).
    spaced = []
    for i, t in enumerate(out):
        if i and not PUNCT.match(t[0]) and spaced[-1][0] not in ("»",):
            spaced.append([" ", "", ""])
        elif i and t[0] in ("»",):
            spaced.append([" ", "", ""])
        spaced.append(t)
    joined = "".join(t[0] for t in spaced)
    if joined != text:
        errs.append(f"tokens give “{joined}”, text is “{text}”")
    return spaced, errs

stories, problems = [], []
for sid, title, title_en, sents, qs in S:
    sentences = []
    for text, en, src in sents:
        toks, errs = tokens(src, text)
        problems += [f"{sid}: {e}" for e in errs]
        sentences.append({"text": text, "en": en, "tokens": toks})
    stories.append({"id": sid, "title": title, "title_en": title_en, "sentences": sentences,
                    "questions": [{"q": q, "options": o, "answer": a} for q, o, a in qs]})
if problems:
    raise SystemExit("\n".join(problems))
(HERE / "sl_a1.json").write_text(json.dumps({"level": "A1", "stories": stories}, ensure_ascii=False, indent=1) + "\n")
print(f"{len(stories)} stories, {sum(len(s['sentences']) for s in stories)} sentences")
