"""Builds picto-*.html: photo of a thing → sketch of its shape → the real character, drawn stroke by stroke."""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from make_quiz import HEAD, TAIL, endcard, glyph, ROOT, OUT

TREE = ["M512 110 L512 930", "M512 430 Q380 330 230 300", "M512 430 Q644 330 794 300", "M512 800 Q400 880 290 950", "M512 800 Q624 880 734 950"]
FOREST = [
    dict(ch="木", photo="ki", en="tree", zh="mù", ja="ki", paths=TREE, stroke=.5, gap=.12),
    dict(ch="森", photo="mori", en="forest", zh="sēn", ja="mori", trees=True, paths=[], stroke=.4, gap=.08,
         extra="<span class='zh'>木</span> + <span class='zh'>木</span> + <span class='zh'>木</span>"),
]
PICTURES = [
    dict(ch="山", photo="yama", en="mountain", zh="shān", ja="yama", stroke=.5, gap=.12,
         paths=["M90 840 L300 470 L410 640 L512 170 L614 640 L724 470 L934 840"]),
    dict(ch="雨", photo="ame", en="rain", zh="yǔ", ja="ame", stroke=.4, gap=.08, paths=[
        "M170 330 Q190 200 330 220 Q380 110 512 140 Q640 100 700 220 Q840 200 860 330 Z",
        "M300 470 L270 590", "M480 450 L450 570", "M660 470 L630 590", "M380 680 L350 800", "M580 680 L550 800", "M760 680 L730 800"]),
    dict(ch="目", photo="me", en="eye", zh="mù", ja="me", rotate=True, stroke=.45, gap=.1, paths=[
        "M110 512 Q512 200 914 512 Q512 824 110 512 Z", "M392 512 a120 120 0 1 0 240 0 a120 120 0 1 0 -240 0"]),
]

CSS = """
.card{position:relative;width:860px;height:860px;margin-top:60px;border-radius:56px;overflow:hidden;box-shadow:0 40px 110px rgba(0,0,0,.5);border:4px solid rgba(244,239,226,.2)}
.card .pad{position:absolute;inset:0;background:radial-gradient(circle at 30% 20%,#6c8a6f,#4d6a54)}
.card .pad:before{content:"";position:absolute;inset:0;background:linear-gradient(to right,transparent calc(50% - 2px),rgba(244,239,226,.22) calc(50% - 2px),rgba(244,239,226,.22) calc(50% + 2px),transparent calc(50% + 2px)),linear-gradient(to bottom,transparent calc(50% - 2px),rgba(244,239,226,.22) calc(50% - 2px),rgba(244,239,226,.22) calc(50% + 2px),transparent calc(50% + 2px))}
.card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.card .lay{position:absolute;inset:0;display:grid;place-items:center}
.sk path{fill:none;stroke:#f4efe2;stroke-width:26;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 4px 10px rgba(0,0,0,.6))}
.lbl{position:relative;height:230px;width:100%;margin-top:46px}
.lbl>div{position:absolute;left:0;right:0}
.lbl .m{font-size:104px;font-weight:900;line-height:1.1}.lbl .m b{color:var(--sage)}
.lbl .r{font-size:44px;font-weight:800;color:var(--mut);margin-top:8px}
.note{font-size:40px;font-weight:900;color:var(--gold)}
@keyframes darken{to{filter:brightness(.4) saturate(.6)}}
@keyframes turn{to{transform:rotate(90deg)}}
@keyframes zoom{from{transform:scale(1.12)}to{transform:scale(1)}}
"""

def sketch(paths, start, dur=.8):
    n = max(len(paths), 1)
    per = dur / n
    return "".join(f'<path d="{d}" pathLength="1" stroke-dasharray="1 1" style="animation:draw {per:.2f}s {start + k*per:.2f}s ease-out both"/>' for k, d in enumerate(paths))

def build(scenes, out, title):
    t = .5
    parts, events = [], dict(pop=[.05], brush=[], reveal=[], whoosh=[])
    for i, s in enumerate(scenes):
        extra = .5 if s.get("rotate") or s.get("trees") else 0
        t_sk, t_ch = t + .9, t + 1.8 + extra
        if s.get("trees"):
            paths_svg = "".join(f'<g transform="translate({x} {y}) scale(.42) translate(-512 -512)">{sketch(TREE, t_sk + k*.25, .5)}</g>' for k, (x, y) in enumerate([(512, 300), (290, 700), (734, 700)]))
        else:
            paths_svg = sketch(s["paths"], t_sk)
        rot = f'transform-origin:50% 50%;animation:turn .45s {t_sk + .95:.2f}s cubic-bezier(.5,0,.3,1.3) both' if s.get("rotate") else ""
        n_strokes = len(json.loads((ROOT / "mobile/www/chars" / f"{s['ch']}.json").read_text())["strokes"])
        g, g_end = glyph(s["ch"], t_ch + .1, s["stroke"], s["gap"], 700)
        t_lbl, t_out = g_end + .15, g_end + 2.0  # the character is always finished before anything moves on
        note = f'<div class="note a" style="position:absolute;top:30px;left:0;right:0;z-index:3;animation:pop .3s {t_sk+.95:.2f}s both,wout .2s {t_ch:.2f}s forwards">turned upright ↻</div>' if s.get("rotate") else ""
        if s.get("trees"):
            note = f'<div class="note a" style="position:absolute;top:30px;left:0;right:0;z-index:3;animation:pop .3s {t_sk+.2:.2f}s both,wout .2s {t_ch:.2f}s forwards">tree + tree + tree</div>'
        parts.append(f"""
  <div class="card a" style="position:absolute;top:470px;left:110px;margin:0;animation:pop .45s {t:.2f}s both,wout .25s {t_out:.2f}s forwards">
    <div class="pad"></div>
    <img src="src/photos/{s['photo']}.jpg" style="animation:zoom 2.5s {t:.2f}s ease-out both,darken .5s {t_sk:.2f}s forwards,wout .4s {t_ch-.2:.2f}s forwards">
    <div class="lay" style="z-index:2;animation:wout .35s {t_ch:.2f}s forwards"><svg class="sk" viewBox="0 0 1024 1024" width="760" height="760" style="{rot}">{paths_svg}</svg></div>
    <div class="lay" style="z-index:1">{g}</div>{note}
  </div>
  <div class="lbl a" style="position:absolute;top:1380px;left:70px;right:70px;margin:0;animation:pop .4s {t_lbl:.2f}s both,wout .2s {t_out:.2f}s forwards">
    <div><div class="m"><span class="zh">{s['ch']}</span> = <b>{s['en']}</b></div><div class="r">{s['zh']} · {s['ja']}</div>{f'<div class="note" style="font-size:60px;margin-top:18px">{s["extra"]} = <span class="zh">{s["ch"]}</span></div>' if s.get('extra') else ''}</div></div>""")
        events["pop"].append(round(t, 2)); events["whoosh"].append(round(t_sk, 2)); events["brush"] += [round(t_ch + .1 + k * (s["stroke"] + s["gap"]), 2) for k in range(n_strokes)]
        events["reveal"].append(round(t_lbl, 2))
        t = t_out + .05
    end = t
    body = f"""
<section class="sc" style="animation:win .2s 0s both,wout .25s {end:.2f}s forwards">
  <span class="k a" style="animation:pop .4s .05s both">🤯 Did you know?</span>
  <h2 class="a" style="animation:up .4s .15s both">{title}</h2>
  {''.join(parts)}
</section>
{endcard(end, 'Learn characters<br><span class="hl">that make sense</span> 🌱')}
<div class="a" style="position:absolute;bottom:120px;left:0;right:0;text-align:center;font-size:26px;color:var(--mut);animation:win .3s {end+.6:.2f}s both">Photos: Wikimedia Commons (CC0 / public domain)</div>
"""
    (OUT / f"{out}.html").write_text(HEAD.format(title="Pictos", css=CSS) + body + TAIL)
    events["chime"] = [round(end, 2)]
    return end, events

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "picto-forest"
    if which == "picto-forest":
        end, ev = build(FOREST, which, 'How do you write<br><span class="hl">"forest"</span>? 🌲')
    else:
        end, ev = build(PICTURES, which, 'Characters are<br><span class="hl">little pictures</span>')
    print(json.dumps(dict(end=end, events=ev)))
