"""Three short reels: literal Chinese words, kanji that look like their meaning, and the 囧 meme."""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from make_quiz import HEAD, TAIL, endcard, glyph, ROOT, OUT

JA = ROOT / "mobile" / "www" / "chars-ja"
CSS = """
.box{position:relative;border-radius:40px;border:4px solid rgba(244,239,226,.25);background:radial-gradient(circle at 30% 20%,#6c8a6f,#4d6a54);
  box-shadow:0 34px 90px rgba(0,0,0,.45);display:grid;place-items:center;overflow:hidden}
.box:before{content:"";position:absolute;inset:0;background:linear-gradient(to right,transparent calc(50% - 2px),rgba(244,239,226,.22) calc(50% - 2px),rgba(244,239,226,.22) calc(50% + 2px),transparent calc(50% + 2px)),linear-gradient(to bottom,transparent calc(50% - 2px),rgba(244,239,226,.22) calc(50% - 2px),rgba(244,239,226,.22) calc(50% + 2px),transparent calc(50% + 2px))}
.box>*{position:relative;z-index:1}
.ink{color:#13201a;font-weight:700;line-height:1}
.item{position:absolute;left:70px;right:70px;top:520px;display:flex;flex-direction:column;align-items:center}
.parts{display:flex;align-items:center;justify-content:center;gap:26px;margin-top:20px}
.part{display:flex;flex-direction:column;align-items:center;background:rgba(244,239,226,.07);border:3px solid rgba(244,239,226,.14);border-radius:44px;padding:30px 34px 26px;min-width:300px}
.part .c{font-size:210px;font-weight:900;line-height:1.1}
.part .e{font-size:56px;font-weight:900;color:var(--sage);margin-top:4px}
.plus{font-size:96px;font-weight:900;color:var(--gold)}
.q{font-size:150px;font-weight:900;color:var(--gold);margin-top:80px}
.wbar{height:18px;border-radius:9px;background:rgba(244,239,226,.12);overflow:hidden;width:560px;margin:24px auto 0}
.wbar i{display:block;height:100%;background:var(--gold);transform-origin:left}
.rev{position:absolute;left:0;right:0;top:560px;display:flex;flex-direction:column;align-items:center}
.emo{font-size:280px;line-height:1.1}
.big{font-size:118px;font-weight:900;line-height:1.1}.big b{color:var(--sage)}
.rd{font-size:50px;font-weight:800;color:var(--mut);margin-top:10px}
.tag{display:inline-block;font-size:40px;font-weight:900;color:var(--bg2);background:var(--gold);border-radius:999px;padding:10px 26px}
"""

def wait_bar(start, dur):
    return f'<div class="wbar"><i style="animation:bar {dur}s {start:.2f}s linear both"></i></div>'

def page(name, title_kicker, title, body, end, line):
    html = HEAD.format(title=name, css=CSS) + f"""
<section class="sc" style="animation:win .2s 0s both,wout .25s {end:.2f}s forwards">
  <span class="k a" style="animation:pop .4s .05s both">{title_kicker}</span>
  <h2 class="a" style="animation:up .4s .15s both">{title}</h2>
  {body}
</section>
{endcard(end, line)}""" + TAIL
    (OUT / f"{name}.html").write_text(html)

def show(t0, t1, anim="pop .4s"):
    """animation style: visible from t0 until t1."""
    return f"animation:{anim} {t0:.2f}s both,wout .25s {t1:.2f}s forwards"

# ---------------------------------------------------------------- 2) literal Chinese
def literal():
    items = [
        ([("熊", "bear"), ("猫", "cat")], "🐼", "panda", "熊猫", "xióngmāo"),
        ([("电", "electric"), ("脑", "brain")], "💻", "computer", "电脑", "diànnǎo"),
        ([("火", "fire"), ("车", "vehicle")], "🚂", "train", "火车", "huǒchē"),
        ([("长", "long"), ("颈", "neck"), ("鹿", "deer")], "🦒", "giraffe", "长颈鹿", "chángjǐnglù"),
    ]
    WAIT, HOLD = 2.0, 1.8
    t, out, ev = .7, [], dict(pop=[.05], tick=[], reveal=[])
    for parts, emo, en, word, py in items:
        n = len(parts)
        cells = []
        for k, (c, e) in enumerate(parts):
            if k: cells.append(f'<span class="plus a" style="animation:pop .3s {t+k*.45-.15:.2f}s both">+</span>')
            cells.append(f'<div class="part a" style="animation:pop .35s {t+k*.45:.2f}s both"><span class="c zh">{c}</span><span class="e">{e}</span></div>')
            ev["pop"].append(round(t + k * .45, 2))
        tq = t + n * .45 + .1
        tr = tq + WAIT
        tend = tr + HOLD
        small = ' style="min-width:0;padding:22px 18px 18px"' if n == 3 else ""
        out.append(f"""
  <div class="item a" style="{show(t, tr, 'win .1s')}">
    <div class="parts">{''.join(cells).replace('class="part a"', 'class="part a"' + ('' if n < 3 else ' data-s'))}</div>
    <div class="q a" style="animation:pop .3s {tq:.2f}s both">= ?</div>
    <div class="a" style="animation:win .1s {tq:.2f}s both">{wait_bar(tq, WAIT)}</div>
  </div>
  <div class="rev a" style="{show(tr, tend)}">
    <div class="emo">{emo}</div><div class="big"><span class="zh">{word}</span> = <b>{en}</b></div>
    <div class="rd">{py} · {' + '.join(e for _, e in parts)}</div>
  </div>""")
        ev["tick"] += [round(tq, 2), round(tq + 1, 2)]; ev["reveal"].append(round(tr, 2))
        t = tend + .35
    css_fix = '<style>.part[data-s]{min-width:0;padding:26px 18px 22px}.part[data-s] .c{font-size:150px}.part[data-s] .e{font-size:44px}</style>'
    page("fun-literal", "🇨🇳 Literal Chinese", "Chinese words<br>are <span class=\"hl\">so literal</span> 😂", css_fix + "".join(out), t,
         'Learn Chinese<br><span class="hl">that makes sense</span> 🌱')
    ev["chime"] = [round(t, 2)]
    return t, ev

# ---------------------------------------------------------------- 3) kanji that look like their meaning
def shapes():
    ST, GP, WAIT, HOLD = .3, .06, 2.0, 1.7
    t, out, ev = .7, [], dict(pop=[.05], brush=[], tick=[], reveal=[])
    rounds = [
        [("凸", "sticking out", "⬆️", "totsu · tū"), ("凹", "dented in", "⬇️", "ō · āo")],
        [("傘", "umbrella", "☂️", "kasa · 🇨🇳 伞 sǎn")],
        [("回", "to turn around", "🔄", "kai · huí")],
    ]
    for rnd in rounds:
        two = len(rnd) == 2
        size = 450 if two else 760
        boxes, ends = [], []
        for ch, en, emo, rd in rnd:
            n = len(json.loads((JA / f"{ch}.json").read_text())["strokes"])
            g, ge = glyph(ch, t + .4, ST, GP, size - 60, JA)
            ends.append(ge)
            ev["brush"] += [round(t + .4 + k * (ST + GP), 2) for k in range(n)]
            boxes.append((ch, en, emo, rd, g))
        tq = max(ends) + .15          # every character is finished before the question
        tr = tq + WAIT
        tend = tr + HOLD
        cols = []
        for ch, en, emo, rd, g in boxes:
            cols.append(f"""<div style="display:flex;flex-direction:column;align-items:center">
      <div class="box" style="width:{size}px;height:{size}px">{g}</div>
      <div style="position:relative;height:240px;width:100%;margin-top:30px">
        <div class="q a" style="position:absolute;left:0;right:0;margin:0;{show(tq, tr, 'pop .3s')}">?</div>
        <div class="a" style="position:absolute;left:0;right:0;animation:pop .4s {tr:.2f}s both">
          <div style="font-size:{90 if two else 110}px">{emo}</div><div class="big" style="font-size:{58 if two else 84}px"><b>{en}</b></div><div class="rd" style="font-size:{34 if two else 42}px">{rd}</div></div>
      </div></div>""")
        out.append(f"""
  <div class="item a" style="{show(t, tend, 'pop .4s')}">
    <div style="display:flex;gap:40px;justify-content:center">{''.join(cols)}</div>
    <div class="a" style="animation:win .1s {tq:.2f}s both,wout .1s {tr:.2f}s forwards;position:absolute;top:{size+300}px;left:0;right:0">{wait_bar(tq, WAIT)}</div>
  </div>""")
        ev["pop"].append(round(t, 2)); ev["tick"] += [round(tq, 2), round(tq + 1, 2)]; ev["reveal"].append(round(tr, 2))
        t = tend + .35
    # bonus: 凸凹
    tb, tb2 = t, t + 2.9
    out.append(f"""
  <div class="rev a" style="{show(tb, tb2)}">
    <span class="tag">BONUS</span>
    <div class="ink ja" style="font-size:300px;color:var(--txt);margin-top:40px">凸凹</div>
    <div class="big" style="margin-top:20px"><b>bumpy</b> 😄</div><div class="rd">dekoboko</div>
  </div>""")
    ev["reveal"].append(round(tb, 2))
    t = tb2 + .05
    page("fun-shapes", "🇯🇵 Kanji", "Guess it<br><span class=\"hl\">from the shape</span> 👀", "".join(out), t,
         'Kanji that<br><span class="hl">make sense</span> 🌱')
    ev["chime"] = [round(t, 2)]
    return t, ev

# ---------------------------------------------------------------- 5) 囧
def jiong():
    ev = dict(pop=[.05], brush=[], tick=[], reveal=[])
    t0 = .7
    tw = t0 + .3                     # ink wipe of 囧 (no stroke data for it, so it's revealed whole)
    tq, WAIT = tw + 1.4, 2.2
    tr = tq + WAIT
    t1 = tr + 3.2
    ST, GP = .32, .06
    n = len(json.loads((JA / "呆.json").read_text())["strokes"])
    g, ge = glyph("呆", t1 + .5, ST, GP, 400, JA)
    ev["brush"] += [round(t1 + .5 + k * (ST + GP), 2) for k in range(n)]
    tb = ge + .4                     # 呆 finished → its meaning
    tm = tb + 1.8                    # → 呆 + 呆 = 槑
    t2 = tm + 3.0
    body = f"""
  <div class="item a" style="{show(t0, t1, 'pop .4s')}">
    <div class="box" style="width:700px;height:700px">
      <div class="ink zh" style="font-size:560px;clip-path:inset(0 0 100% 0);animation:wipe 1.1s {tw:.2f}s cubic-bezier(.4,0,.2,1) forwards">囧</div>
    </div>
    <div style="position:relative;height:300px;width:100%;margin-top:36px">
      <div class="a" style="position:absolute;left:0;right:0;{show(tq, tr, 'pop .3s')}"><div class="big" style="font-size:70px">What do you see? 👇</div>{wait_bar(tq, WAIT)}</div>
      <div class="a" style="position:absolute;left:0;right:0;animation:pop .4s {tr:.2f}s both">
        <div class="big"><span class="zh">囧</span> = <b>awkward</b> 😳</div>
        <div class="rd">jiǒng · Chinese internet slang</div>
        <div class="rd" style="font-size:36px;margin-top:16px">an ancient character that meant "bright"…<br>until the internet saw a face in it</div></div>
    </div>
    <div class="tag a" style="position:absolute;top:150px;right:-10px;animation:pop .3s {tr+.3:.2f}s both">← eyebrows</div>
    <div class="tag a" style="position:absolute;top:470px;right:-10px;animation:pop .3s {tr+.6:.2f}s both">← mouth</div>
  </div>
  <div class="item a" style="{show(t1, t2, 'pop .4s')}">
    <span class="tag">BONUS</span>
    <div style="display:flex;align-items:center;gap:30px;margin-top:40px">
      <div class="box" style="width:440px;height:440px">{g}</div>
      <div class="a" style="animation:pop .4s {tm:.2f}s both;display:flex;align-items:center;gap:20px"><span class="plus">+ 呆 =</span></div>
    </div>
    <div style="position:relative;height:360px;width:100%;margin-top:40px">
      <div class="a" style="position:absolute;left:0;right:0;{show(tb, tm, 'pop .4s')}"><div class="big"><span class="zh">呆</span> = <b>dumbstruck</b> 😶</div><div class="rd">dāi · a big head on a body</div></div>
      <div class="a" style="position:absolute;left:0;right:0;animation:pop .4s {tm+.3:.2f}s both"><div class="ink zh" style="font-size:200px;color:var(--txt)">槑</div>
        <div class="big" style="font-size:80px;margin-top:10px"><b>super dumb</b> 😂</div><div class="rd">méi · internet slang</div></div>
    </div>
  </div>"""
    ev["pop"] += [round(t0, 2), round(t1, 2), round(tm, 2)]; ev["tick"] += [round(tq, 2), round(tq + 1, 2)]; ev["reveal"] += [round(tr, 2), round(tb, 2), round(tm + .3, 2)]
    css = "<style>@keyframes wipe{to{clip-path:inset(0 0 0 0)}}</style>"
    page("fun-jiong", "😳 Internet slang", "This character<br><span class=\"hl\">became a meme</span>", css + body, t2,
         'Learn Chinese<br><span class="hl">the fun way</span> 🌱')
    ev["chime"] = [round(t2, 2)]
    return t2, ev

if __name__ == "__main__":
    print(json.dumps({k: dict(zip(("end", "events"), f())) for k, f in [("fun-literal", literal), ("fun-shapes", shapes), ("fun-jiong", jiong)]}))
