"""Builds the two quiz reels (quiz-tegami.html, quiz-guess.html) from the app's stroke data."""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = pathlib.Path(__file__).resolve().parents[1]
CHARS = ROOT / "mobile" / "www" / "chars"

HEAD = """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{title}</title><style>
@font-face{{font-family:N;font-weight:700;src:url(src/nunito-latin-700-normal.woff2)}}
@font-face{{font-family:N;font-weight:800;src:url(src/nunito-latin-800-normal.woff2)}}
@font-face{{font-family:N;font-weight:900;src:url(src/nunito-latin-900-normal.woff2)}}
:root{{--bg:#1c3026;--bg2:#16271e;--sage:#8cc06b;--gold:#d2ae52;--txt:#f4efe2;--mut:#a9b5a6}}
*{{box-sizing:border-box;margin:0}}
html,body{{width:1080px;height:1920px;overflow:hidden;background:var(--bg2)}}
body{{font-family:N,"Noto Sans CJK JP",sans-serif;color:var(--txt);position:relative;
  background:radial-gradient(1000px 900px at 80% 15%,#2c4a36 0%,transparent 60%),radial-gradient(900px 900px at 10% 95%,#24402f 0%,transparent 60%),linear-gradient(160deg,var(--bg),var(--bg2))}}
.zh{{font-family:N,"Noto Sans CJK SC",sans-serif}}.ja{{font-family:N,"Noto Sans CJK JP",sans-serif}}
.a{{opacity:0;animation-fill-mode:both}}
.sc{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;text-align:center;padding:150px 70px 0;opacity:0}}
@keyframes win{{0%{{opacity:0}}100%{{opacity:1}}}}
@keyframes wout{{0%{{opacity:1}}100%{{opacity:0}}}}
@keyframes up{{from{{opacity:0;transform:translateY(50px)}}to{{opacity:1;transform:none}}}}
@keyframes pop{{0%{{opacity:0;transform:scale(.5)}}70%{{opacity:1;transform:scale(1.08)}}100%{{opacity:1;transform:scale(1)}}}}
@keyframes shake{{0%,100%{{transform:rotate(0)}}25%{{transform:rotate(-8deg)}}75%{{transform:rotate(8deg)}}}}
@keyframes dim{{to{{opacity:.35;transform:scale(.97)}}}}
@keyframes right{{to{{background:#8cc06b;color:#16271e;border-color:#8cc06b;transform:scale(1.04)}}}}
@keyframes bar{{from{{transform:scaleX(1)}}to{{transform:scaleX(0)}}}}
@keyframes draw{{from{{stroke-dashoffset:1}}to{{stroke-dashoffset:0}}}}
.k{{display:inline-block;font-weight:900;font-size:36px;letter-spacing:3px;text-transform:uppercase;color:var(--bg2);background:var(--gold);padding:12px 30px;border-radius:999px}}
h2{{font-weight:900;font-size:88px;line-height:1.05;letter-spacing:-1.5px;margin-top:28px}}
.hl{{color:var(--sage)}}.gd{{color:var(--gold)}}
.sub{{font-size:42px;font-weight:800;color:var(--mut)}}
.cta{{display:inline-block;background:var(--sage);color:var(--bg2);font-weight:900;font-size:58px;padding:34px 66px;border-radius:999px;box-shadow:0 20px 60px rgba(140,192,107,.4)}}
.url{{font-weight:900;font-size:92px;color:var(--gold)}}
{css}
</style></head><body>
"""
TAIL = """<script>window.seek=(ms)=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=ms;});</script></body></html>"""

def endcard(start, line):
    return f"""<section class="sc" style="animation:win .3s {start}s both;justify-content:center;padding-top:0;background:inherit">
  <img class="a" src="src/logo.png" style="width:260px;height:260px;border-radius:66px;box-shadow:0 30px 120px rgba(140,192,107,.45);animation:pop .6s {start+.05}s both">
  <div class="a" style="font-weight:900;font-size:76px;line-height:1.1;margin-top:60px;animation:up .5s {start+.2}s both">{line}</div>
  <div class="cta a" style="margin-top:70px;animation:pop .5s {start+.45}s both">Try it free</div>
  <div class="url a" style="margin-top:50px;animation:up .5s {start+.6}s both">bloomko.eu</div>
</section>"""

# ---------------------------------------------------------------- 1) 手紙 vs 手纸
def tegami():
    css = """
.cards{display:grid;grid-template-columns:1fr 1fr;gap:30px;width:100%;margin-top:60px}
.card{background:rgba(244,239,226,.07);border:3px solid rgba(244,239,226,.14);border-radius:40px;padding:34px 16px 30px;position:relative}
.card .lab{font-size:34px;font-weight:900;color:var(--mut);letter-spacing:2px}
.card .w{font-size:150px;font-weight:900;line-height:1.15;margin-top:6px}
.card .r{font-size:38px;font-weight:800;color:var(--sage)}
.card .m{font-size:46px;font-weight:900;margin-top:10px;height:62px;position:relative}
.card .m span{position:absolute;left:0;right:0}
.opts{display:flex;flex-direction:column;gap:24px;width:100%;margin-top:50px}
.opt{display:flex;align-items:center;gap:26px;font-size:52px;font-weight:900;background:rgba(244,239,226,.08);border:4px solid rgba(244,239,226,.16);border-radius:32px;padding:26px 36px;text-align:left}
.opt b{display:inline-grid;place-items:center;width:74px;height:74px;border-radius:50%;background:rgba(244,239,226,.14);font-size:40px}
.timer{width:100%;margin-top:44px;display:flex;align-items:center;gap:26px}
.track{flex:1;height:22px;border-radius:11px;background:rgba(244,239,226,.12);overflow:hidden}
.track i{display:block;height:100%;background:var(--gold);transform-origin:left;border-radius:11px}
.num{position:relative;width:90px;height:90px;font-size:70px;font-weight:900;color:var(--gold)}
.num span{position:absolute;inset:0;display:grid;place-items:center}
"""
    T0, T1 = 2.4, 4.8  # countdown window, reveal at T1
    seg = (T1 - T0) / 3
    nums = "".join(
        f'<span class="a" style="animation:pop .25s {T0+i*seg:.2f}s both,wout .1s {T0+(i+1)*seg-.05:.2f}s forwards">{3-i}</span>' for i in range(3))
    body = f"""
<section class="sc" style="animation:win .2s 0s both,wout .25s 7.0s forwards">
  <span class="k a" style="animation:pop .4s .05s both">🇯🇵 vs 🇨🇳</span>
  <h2 class="a" style="animation:up .4s .15s both">Same word,<br><span class="hl">different meaning</span></h2>
  <div class="cards">
    <div class="card a" style="animation:pop .45s .4s both"><div class="lab">🇯🇵 JAPANESE</div><div class="w ja">手紙</div><div class="r">tegami</div><div class="m"><span>letter ✉️</span></div></div>
    <div class="card a" style="animation:pop .45s 1.2s both"><div class="lab">🇨🇳 CHINESE</div><div class="w zh">手纸</div><div class="r">shǒuzhǐ</div>
      <div class="m"><span class="gd" style="animation:wout .1s {T1}s forwards">???</span><span class="a" style="color:var(--sage);animation:pop .4s {T1+.05}s both">toilet paper 🧻</span></div></div>
  </div>
  <div class="opts">
    <div class="opt a" style="animation:up .3s 1.6s both,dim .3s {T1}s forwards"><b>A</b>newspaper 📰</div>
    <div class="opt a" style="animation:up .3s 1.75s both,right .3s {T1}s forwards"><b>B</b>toilet paper 🧻</div>
    <div class="opt a" style="animation:up .3s 1.9s both,dim .3s {T1}s forwards"><b>C</b>glove 🧤</div>
  </div>
  <div class="timer a" style="animation:win .2s {T0-.1}s both,wout .2s {T1}s forwards"><div class="num">{nums}</div><div class="track"><i style="animation:bar {T1-T0}s {T0}s linear both"></i></div></div>
  <div class="sub a" style="margin-top:26px;animation:win .2s {T0}s both,wout .2s {T1}s forwards">Comment your answer 👇</div>
  <div class="a" style="position:absolute;left:0;right:0;top:1460px;animation:pop .45s {T1+.25}s both"><div style="font-size:150px;line-height:1;animation:shake .5s {T1+.7}s 2">😂</div>
    <div class="sub" style="margin-top:20px;font-size:46px;color:var(--txt);padding:0 60px">Careful when you ask for <span class="zh">手纸</span> in China 😅</div></div>
</section>
{endcard(7.0, 'Learn <span class="hl">Chinese</span> &amp; <span class="gd">Japanese</span><br>the fun way 🌱')}
"""
    (OUT / "quiz-tegami.html").write_text(HEAD.format(title="Quiz tegami", css=css) + body + TAIL)

# ---------------------------------------------------------------- 5) guess before it's finished
def glyph(ch, start, stroke_t=.5, gap=.12, size=640):
    d = json.loads((CHARS / f"{ch}.json").read_text())
    defs, paths, t = [], [], start
    for i, (s, med) in enumerate(zip(d["strokes"], d["medians"])):
        mid = f"m{ord(ch)}_{i}"
        pts = " ".join(f"{x},{y}" for x, y in med)
        defs.append(f'<mask id="{mid}" maskUnits="userSpaceOnUse"><polyline points="{pts}" fill="none" stroke="#fff" stroke-width="150" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" style="animation:draw {stroke_t}s {t:.2f}s cubic-bezier(.4,0,.6,1) both"/></mask>')
        paths.append(f'<path d="{s}" fill="#13201a" mask="url(#{mid})"/>')
        t += stroke_t + gap
    svg = f'<svg viewBox="0 0 1024 1024" width="{size}" height="{size}"><defs>{"".join(defs)}</defs><g transform="translate(0,900) scale(1,-1)">{"".join(paths)}</g></svg>'
    return svg, t

def guess():
    css = """
.box{position:relative;width:700px;height:700px;margin-top:60px;border-radius:44px;border:4px solid rgba(244,239,226,.25);
  background:radial-gradient(circle at 30% 20%,#6c8a6f,#4d6a54);box-shadow:0 40px 100px rgba(0,0,0,.4);display:grid;place-items:center;overflow:hidden}
.box:before,.box:after{content:"";position:absolute;inset:0;background:linear-gradient(to right,transparent calc(50% - 2px),rgba(244,239,226,.25) calc(50% - 2px),rgba(244,239,226,.25) calc(50% + 2px),transparent calc(50% + 2px)),linear-gradient(to bottom,transparent calc(50% - 2px),rgba(244,239,226,.25) calc(50% - 2px),rgba(244,239,226,.25) calc(50% + 2px),transparent calc(50% + 2px))}
.box .g{position:absolute;inset:0;display:grid;place-items:center;z-index:1}
.ans{position:relative;height:250px;width:100%;margin-top:50px}
.ans>div{position:absolute;left:0;right:0}
.ans .m{font-size:96px;font-weight:900;color:var(--sage)}
.ans .r{font-size:44px;font-weight:800;color:var(--mut);margin-top:6px}
.round{font-size:38px;font-weight:900;color:var(--mut);letter-spacing:3px;margin-top:24px;position:relative;height:50px;width:100%}
.round span{position:absolute;left:0;right:0}
.plus{font-size:230px;font-weight:900;line-height:1;color:#13201a}
"""
    g1, e1 = glyph("火", .9, .42, .1)
    r1 = e1 + .1
    g2s = r1 + 1.0
    g2, e2 = glyph("山", g2s + .2, .42, .1)
    r2 = e2 + .1
    b0 = r2 + 1.0
    rb = b0 + 1.1
    end = rb + 1.4
    body = f"""
<section class="sc" style="animation:win .2s 0s both,wout .25s {end}s forwards">
  <span class="k a" style="animation:pop .4s .05s both">⏱️ Quick quiz</span>
  <h2 class="a" style="animation:up .4s .15s both">Guess it <span class="hl">before</span><br>it's finished</h2>
  <div class="round">
    <span class="a" style="animation:win .2s .5s both,wout .1s {g2s}s forwards">1 / 2</span>
    <span class="a" style="animation:win .2s {g2s}s both,wout .1s {b0}s forwards">2 / 2</span>
    <span class="a gd" style="animation:win .2s {b0}s both">BONUS</span>
  </div>
  <div class="box a" style="animation:pop .4s .45s both">
    <div class="g" style="animation:wout .2s {g2s}s forwards">{g1}</div>
    <div class="g" style="opacity:0;animation:win .1s {g2s}s forwards,wout .2s {b0}s forwards">{g2}</div>
    <div class="g a" style="animation:pop .4s {b0+.05}s both"><div class="plus zh">火山</div></div>
  </div>
  <div class="ans">
    <div class="sub a" style="animation:win .2s .9s both,wout .1s {r1}s forwards;top:60px">Comment fast 👇</div>
    <div class="a" style="animation:pop .4s {r1}s both,wout .2s {g2s}s forwards"><div class="m">fire 🔥</div><div class="r">huǒ · hi</div></div>
    <div class="sub a" style="animation:win .2s {g2s+.2}s both,wout .1s {r2}s forwards;top:60px">Faster than last time? 👀</div>
    <div class="a" style="animation:pop .4s {r2}s both,wout .2s {b0}s forwards"><div class="m">mountain ⛰️</div><div class="r">shān · yama</div></div>
    <div class="sub a" style="animation:win .2s {b0+.2}s both,wout .1s {rb}s forwards;top:60px">fire + mountain = ?</div>
    <div class="a" style="animation:pop .4s {rb}s both"><div class="m">volcano 🌋</div><div class="r">huǒshān · kazan</div></div>
  </div>
</section>
{endcard(end, 'Learn kanji &amp; hanzi<br><span class="hl">stroke by stroke</span> 🌱')}
"""
    (OUT / "quiz-guess.html").write_text(HEAD.format(title="Quiz guess", css=css) + body + TAIL)
    return dict(r1=r1, r2=r2, rb=rb, end=end, g1=.9, g2=g2s + .2, b0=b0)

tegami()
print(json.dumps(guess()))
