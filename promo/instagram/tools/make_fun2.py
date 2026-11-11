"""Four funny reels for Instagram (2.1): the garden when you skip reviews, the Slovenian dual,
Japanese sounds (including the sound of silence), and saving your streak at 11:58 PM.
Writes <name>.html next to the other reels and prints {name: {end, events}} for the renderer."""
import json, pathlib, sys, random
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from make_quiz import HEAD, TAIL, glyph, ROOT, OUT

PLANTS = json.loads((OUT / "src" / "plants.json").read_text())
CSS = """
body{font-family:N,"Noto Sans CJK JP","WenQuanYi Zen Hei",sans-serif}
.zh,.ja{font-family:N,"WenQuanYi Zen Hei",sans-serif}
.cap{position:absolute;left:60px;right:60px;text-align:center;font-weight:900;font-size:62px;line-height:1.15}
.cap small{display:block;font-size:40px;font-weight:800;color:var(--mut);margin-top:12px}
.tag{display:inline-block;font-size:40px;font-weight:900;color:var(--bg2);background:var(--gold);border-radius:999px;padding:10px 26px}
.big{font-size:118px;font-weight:900;line-height:1.1}.big b{color:var(--sage)}
.rd{font-size:50px;font-weight:800;color:var(--mut);margin-top:10px}
.wbar{height:18px;border-radius:9px;background:rgba(244,239,226,.12);overflow:hidden;width:560px;margin:24px auto 0}
.wbar i{display:block;height:100%;background:var(--gold);transform-origin:left}
/* garden */
.yard{position:absolute;left:70px;right:70px;top:560px;border-radius:44px;padding:34px 26px 26px;background:linear-gradient(180deg,#a9d38a,#8cc06b 40%,#7cb45d);box-shadow:0 40px 90px rgba(0,0,0,.45)}
.bed{border-radius:30px;background:#8a6446;border:8px solid #a77d58;padding:30px 14px 10px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px 0}
.spot{position:relative;height:250px;display:flex;justify-content:center;align-items:flex-end}
.spot:after{content:"";position:absolute;bottom:14px;left:50%;width:120px;height:24px;margin-left:-60px;border-radius:50%;background:rgba(0,0,0,.2)}
.spot svg{position:relative;z-index:1;width:170px;height:auto;transform-origin:50% 100%;opacity:0}
.spot .lab{position:absolute;bottom:-6px;left:0;right:0;text-align:center;font-size:38px;font-weight:800;color:#f6efe3;z-index:2;opacity:0}
.soil{position:absolute;bottom:20px;left:50%;width:40px;height:16px;margin-left:-20px;border-radius:50%;background:#5f4330;opacity:0}
@keyframes sprout{0%{opacity:0;transform:scale(0)}70%{opacity:1;transform:scale(1.12)}100%{opacity:1;transform:scale(1)}}
@keyframes wilt{to{opacity:1;filter:saturate(.15) brightness(.8) sepia(.5);transform:rotate(14deg) scale(.82)}}
@keyframes poof{0%{opacity:1;filter:saturate(.15) brightness(.8) sepia(.5);transform:rotate(14deg) scale(.82)}100%{opacity:0;transform:scale(.1) translateY(40px)}}
@keyframes regrow{0%{opacity:0;transform:scale(0);filter:none}70%{opacity:1;transform:scale(1.15)}100%{opacity:1;transform:scale(1);filter:none}}
@keyframes fall{0%{opacity:0;transform:translateY(-200px)}15%{opacity:1}100%{opacity:0;transform:translateY(900px)}}
@keyframes spark{0%{opacity:0;transform:scale(.3)}40%{opacity:1;transform:scale(1.2)}100%{opacity:0;transform:scale(.8) translateY(-60px)}}
@keyframes slidein{from{opacity:0;transform:translateX(500px)}to{opacity:1;transform:none}}
@keyframes slideout{from{opacity:1;transform:none}to{opacity:0;transform:translateX(560px) rotate(6deg)}}
@keyframes beat{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
@keyframes jitter{0%,100%{transform:translate(0,0)}25%{transform:translate(-6px,4px)}50%{transform:translate(5px,-3px)}75%{transform:translate(-3px,-5px)}}
@keyframes redpulse{0%,100%{color:#ff6b5e;transform:scale(1)}50%{color:#ffd0c8;transform:scale(1.06)}}
"""

def show(t0, t1, anim="pop .4s"):
    return f"animation:{anim} {t0:.2f}s both,wout .25s {t1:.2f}s forwards"

def endcard(start, line, logo="logo.png", cta="Try it free"):
    return f"""<section class="sc" style="animation:win .3s {start:.2f}s both;justify-content:center;padding-top:0;background:inherit">
  <img class="a" src="src/{logo}" style="width:260px;height:260px;border-radius:66px;box-shadow:0 30px 120px rgba(140,192,107,.45);animation:pop .6s {start+.05:.2f}s both">
  <div class="a" style="font-weight:900;font-size:76px;line-height:1.1;margin-top:60px;animation:up .5s {start+.2:.2f}s both">{line}</div>
  <div class="cta a" style="margin-top:70px;animation:pop .5s {start+.45:.2f}s both">{cta}</div>
  <div class="url a" style="margin-top:50px;animation:up .5s {start+.6:.2f}s both">bloomko.eu</div>
</section>"""

def page(name, kicker, title, body, end, endhtml):
    html = HEAD.format(title=name, css=CSS) + f"""
<section class="sc" style="animation:win .2s 0s both,wout .25s {end:.2f}s forwards">
  <span class="k a" style="animation:pop .4s .05s both">{kicker}</span>
  <h2 class="a" style="animation:up .4s .15s both">{title}</h2>
  {body}
</section>
{endhtml}""" + TAIL
    (OUT / f"{name}.html").write_text(html)

def plant(key, size=170):
    return f'<svg viewBox="0 0 40 48" style="width:{size}px">{PLANTS[key]}</svg>'

# ---------------------------------------------------------------- 1) the garden when you skip reviews
def skip():
    rnd = random.Random(7)
    ev = dict(pop=[.05], tick=[], reveal=[], sad=[], poof=[], chime=[], rain=[])
    words = [("你好", "sunflower"), ("谢谢", "cherry"), ("茶", "tea"), ("猫", "lavender"), ("水", "lotus"), ("朋友", "oak"),
             ("爱", "rose"), ("山", "pine"), ("书", "tulip"), ("月", "iris"), ("花", "peony"), ("家", "bamboo")]
    days = [2.4 + d * 1.15 for d in range(7)]                  # Day 1 … Day 7
    wilt_at = {i: round(rnd.uniform(days[2], days[5]), 2) for i in rnd.sample(range(12), 9)}
    gone = rnd.sample(sorted(wilt_at), 5)
    gone_at = {i: round(max(wilt_at[i] + .9, rnd.uniform(days[5], days[6] + .6)), 2) for i in gone}
    t_rain = days[6] + 2.0
    t_back = t_rain + 1.0
    t_end = t_back + 4.4
    spots = []
    for i, (w, p) in enumerate(words):
        a = [f"sprout .5s {.9 + i * .08:.2f}s both"]
        if i in wilt_at: a.append(f"wilt .7s {wilt_at[i]:.2f}s forwards")
        if i in gone_at: a.append(f"poof .45s {gone_at[i]:.2f}s forwards")
        if i in wilt_at: a.append(f"regrow .6s {t_back + i * .07:.2f}s forwards")
        soil = f'<i class="soil" style="animation:win .2s {gone_at[i] + .3:.2f}s forwards,wout .2s {t_back:.2f}s forwards"></i>' if i in gone_at else ""
        spots.append(f'<div class="spot">{soil}<svg viewBox="0 0 40 48" style="animation:{",".join(a)}">{PLANTS[p]}</svg>'
                     f'<span class="lab zh" style="animation:win .3s {.9 + i * .08 + .3:.2f}s both">{w}</span></div>')
    ev["pop"] += [round(.9 + i * .16, 2) for i in range(6)]
    ev["sad"] += sorted(wilt_at.values())[::3]
    ev["poof"] += sorted(gone_at.values())
    caps = [(days[0], days[2], "Day 1: skipped my reviews.<small>it's fine 🙂</small>"),
            (days[2], days[4], "Day 3: they look… thirsty 🥀<small>still fine. probably.</small>"),
            (days[4], days[6], "Day 5: hello??? 😰<small>where did 猫 go</small>"),
            (days[6], t_rain - .1, "Day 7: your words are<br>leaving you 💀"),
            (t_rain, t_back + .4, "5 minutes of practice later…"),
            (t_back + .5, t_end, "they grow back 🌱<small>every word you learn is a real plant</small>")]
    body = [f'<div class="a" style="position:absolute;top:1395px;left:0;right:0;text-align:center;z-index:3;{show(1.9, t_rain, "pop .3s")}">'
            + "".join(f'<span class="tag a" style="position:absolute;left:50%;transform:translateX(-50%);{show(d, days[k + 1] if k < 6 else t_rain, "pop .25s")}">DAY {k + 1}</span>' for k, d in enumerate(days))
            + "</div>",
            f'<div class="yard a" style="animation:pop .5s .6s both"><div class="bed">{"".join(spots)}</div></div>']
    for t0, t1, txt in caps:
        body.append(f'<div class="cap a" style="top:1500px;{show(t0, t1, "up .35s")}">{txt}</div>')
    for k in range(14):                                         # rain
        x = 90 + (k * 67) % 900
        body.append(f'<div class="a" style="position:absolute;top:520px;left:{x}px;font-size:70px;animation:fall 1.1s {t_rain + .2 + (k % 5) * .15:.2f}s both">💧</div>')
    for k in range(8):                                          # sparkles on the way back
        x, y = 120 + (k * 113) % 820, 700 + (k * 97) % 600
        body.append(f'<div class="a" style="position:absolute;top:{y}px;left:{x}px;font-size:64px;animation:spark .9s {t_back + .3 + k * .08:.2f}s both">✨</div>')
    ev["tick"] += [round(d, 2) for d in days]
    ev["rain"] += [round(t_rain + .2, 2)]
    ev["reveal"] += [round(t_back, 2), round(t_back + .5, 2)]
    ev["chime"] = [round(t_end, 2)]
    page("fun-skip", "🌷 Bloomko garden", "POV: you skipped<br>your reviews <span class=\"hl\">for a week</span>", "".join(body), t_end,
         endcard(t_end, 'Every word is a plant.<br><span class="hl">Don\'t let them wilt</span> 🌷'))
    return t_end + 3.6, ev

# ---------------------------------------------------------------- 2) the Slovenian dual
def dual():
    ev = dict(pop=[.05], tick=[], reveal=[], sad=[], poof=[], chime=[], whoosh=[])
    t_two, t_s1, t_g1, t_tag = 1.1, 1.9, 2.5, 3.1
    t_in, t_hi, t_s2, t_cap2 = 5.4, 5.8, 6.5, 7.4
    t_out, t_s3, t_cap3 = 10.6, 11.4, 12.2
    t_end = 16.2
    sent = lambda a, b, c, e: (f'<span class="big" style="font-size:96px">'
                               f'<b style="color:{e}">{a}</b> <b style="color:{e}">{b}</b> prijatelj<b style="color:{e}">{c}</b>.</span>')
    people = (f'<div style="position:absolute;top:620px;left:0;right:0;display:flex;justify-content:center;align-items:flex-end;gap:24px;font-size:180px">'
              f'<span class="a" style="animation:pop .4s {t_two:.2f}s both">🧑</span>'
              f'<span class="a" style="font-size:110px;align-self:center;animation:pop .4s {t_two + .2:.2f}s both,beat 1s {t_two + .6:.2f}s 3,wout .2s {t_in:.2f}s forwards,pop .4s {t_s3:.2f}s forwards">❤️</span>'
              f'<span class="a" style="animation:pop .4s {t_two + .1:.2f}s both">👩</span>'
              f'<span class="a" style="animation:slidein .5s {t_in:.2f}s both,jitter .3s {t_s2:.2f}s 3,slideout .7s {t_out:.2f}s forwards">🧍‍♂️</span></div>'
              f'<div class="tag a" style="position:absolute;top:580px;right:60px;{show(t_hi, t_s2 + .8, "pop .3s")}">👋 hi guys!</div>')
    lines = (f'<div class="a" style="position:absolute;top:1000px;left:0;right:0;text-align:center;{show(t_s1, t_s2)}">{sent("Midva", "sva", "a", "var(--sage)")}'
             f'<div class="rd a" style="animation:up .4s {t_g1:.2f}s both">“we two are friends”</div>'
             f'<div class="a" style="margin-top:34px;animation:pop .4s {t_tag:.2f}s both"><span class="tag">DUAL · a form just for 2 people</span></div></div>'
             f'<div class="a" style="position:absolute;top:1000px;left:0;right:0;text-align:center;{show(t_s2, t_out + .2)}">{sent("Mi", "smo", "i", "var(--gold)")}'
             f'<div class="rd">“we (3 or more) are friends”</div></div>'
             f'<div class="cap a" style="top:1360px;{show(t_cap2, t_out + .2, "up .35s")}">a third person shows up →<br>every. word. changes. 😳</div>'
             f'<div class="a" style="position:absolute;top:1000px;left:0;right:0;text-align:center;animation:pop .4s {t_s3:.2f}s both">{sent("Midva", "sva", "a", "var(--sage)")}'
             f'<div class="rd">back to just the two of us 💞</div></div>'
             f'<div class="cap a" style="top:1360px;animation:up .4s {t_cap3:.2f}s both">Slovenian grammar knows<br>when you\'re <span class="hl">third-wheeling</span> 🇸🇮<small>one of the few languages left with a dual</small></div>')
    ev["pop"] += [t_two, t_two + .2, t_s1, t_tag, t_hi, t_s3]
    ev["whoosh"] += [t_in, t_out]
    ev["reveal"] += [t_s2]
    ev["sad"] += [t_out + .3]
    ev["chime"] = [round(t_end, 2)]
    page("fun-dual", "🇸🇮 Slovenian", "Slovenian has a grammar<br>form <span class=\"hl\">just for couples</span>", people + lines, t_end,
         endcard(t_end, 'Small language,<br><span class="hl">big personality</span> 🇸🇮', logo="heritage-logo.png"))
    return t_end + 3.6, ev

# ---------------------------------------------------------------- 3) Japanese sounds
def sounds():
    ev = dict(pop=[.05], tick=[], reveal=[], chime=[], cricket=[])
    items = [("ドキドキ", "doki doki", "💓", "heart pounding", "beat .5s infinite"),
             ("ペコペコ", "peko peko", "🍜", "starving", "jitter .3s infinite"),
             ("ゴロゴロ", "goro goro", "🛋️", "lazing around all day", "jitter 1.4s infinite"),
             ("キラキラ", "kira kira", "✨", "sparkling", "beat .8s infinite")]
    WAIT, HOLD = 1.7, 1.7
    t, out = 1.0, []
    for kana, rom, emo, en, move in items:
        tq, tr = t + .35, t + .35 + WAIT
        tend = tr + HOLD
        out.append(f"""
  <div class="a" style="position:absolute;top:620px;left:0;right:0;text-align:center;{show(t, tend)}">
    <div class="ja" style="font-size:190px;font-weight:900">{kana}</div>
    <div class="rd">{rom}</div>
    <div class="a" style="{show(tq, tr, 'pop .3s')}"><div class="big" style="font-size:110px;color:var(--gold);margin-top:40px">= ?</div>
      <div class="wbar"><i style="animation:bar {WAIT}s {tq:.2f}s linear both"></i></div></div>
    <div class="a" style="margin-top:-210px;animation:pop .4s {tr:.2f}s both">
      <div style="font-size:200px;display:inline-block;animation:{move} {tr:.2f}s">{emo}</div>
      <div class="big" style="font-size:84px"><b>{en}</b></div></div>
  </div>""")
        ev["pop"].append(round(t, 2)); ev["tick"] += [round(tq, 2), round(tq + 1, 2)]; ev["reveal"].append(round(tr, 2))
        t = tend + .3
    # the punchline: the sound of silence
    tq, tr = t + .2, t + .2 + 2.0
    tend = tr + 3.4
    out.append(f"""
  <div class="a" style="position:absolute;top:640px;left:0;right:0;text-align:center;{show(t, tend)}">
    <div class="big" style="font-size:92px">And the sound<br>of <span class="hl">silence</span>? 🤫</div>
    <div class="a" style="{show(tq, tr, 'pop .3s')}"><div class="wbar" style="margin-top:60px"><i style="animation:bar 2s {tq:.2f}s linear both"></i></div></div>
    <div class="a" style="margin-top:-60px;animation:pop .5s {tr:.2f}s both">
      <div class="ja" style="font-size:230px;font-weight:900;color:var(--gold)">シーン</div>
      <div class="rd">shiiin</div>
      <div style="font-size:120px;margin-top:20px;display:inline-block;animation:jitter .25s {tr + .3:.2f}s 6">🦗</div>
      <div class="big" style="font-size:64px;margin-top:20px">yes. silence <b>has a sound</b> 😂</div></div>
  </div>""")
    ev["tick"] += [round(tq, 2), round(tq + 1, 2)]; ev["reveal"].append(round(tr, 2)); ev["cricket"] = [round(tr + .3, 2)]
    ev["chime"] = [round(tend, 2)]
    page("fun-sounds", "🇯🇵 Japanese", "Japanese has a sound<br>for <span class=\"hl\">everything</span> 🔊", "".join(out), tend,
         endcard(tend, 'Learn Japanese<br><span class="hl">you can feel</span> 🌸'))
    return tend + 3.6, ev

# ---------------------------------------------------------------- 4) saving your streak at 11:58 PM
def streak():
    ev = dict(pop=[.05], tick=[], bigtick=[], brush=[], reveal=[], chime=[])
    times = [("23:58:00", 1.0), ("23:58:20", 1.6), ("23:58:40", 2.2), ("23:59:00", 2.8), ("23:59:15", 4.2), ("23:59:30", 5.6),
             ("23:59:40", 7.0), ("23:59:50", 8.2), ("23:59:55", 9.0), ("23:59:57", 9.6), ("23:59:58", 10.1)]
    t_done = 10.7
    clock = []
    for k, (txt, t0) in enumerate(times):
        t1 = times[k + 1][1] if k + 1 < len(times) else t_done
        red = "animation:redpulse .5s infinite;" if txt >= "23:59:50" else ""
        clock.append(f'<span class="a" style="position:absolute;left:0;right:0;{show(t0, t1, "win .05s")}"><span style="display:inline-block;{red}">{txt}</span></span>')
        ev["tick"].append(round(t0, 2))
    ev["bigtick"] += [8.2, 9.0, 9.6, 10.1]
    # two characters written at speedrun pace
    g1, e1 = glyph("你", 4.4, .16, .03, 360)
    g2, e2 = glyph("好", e1 + .15, .16, .03, 360)
    ev["brush"] += [round(4.4 + k * .19, 2) for k in range(7)] + [round(e1 + .15 + k * .19, 2) for k in range(6)]
    body = f"""
  <div style="position:absolute;top:540px;left:0;right:0;height:200px;text-align:center;font-size:170px;font-weight:900;font-variant-numeric:tabular-nums">{''.join(clock)}
    <span class="a" style="position:absolute;left:0;right:0;animation:pop .4s {t_done:.2f}s both;color:var(--sage)">00:00:00</span></div>
  <div class="a" style="position:absolute;top:800px;left:120px;right:120px;padding:28px 34px;border-radius:30px;background:#dcebf5;color:#2c4a6e;font-size:44px;font-weight:900;text-align:left;{show(1.8, 4.2, 'slidein .4s')}">💧 Ana watered your garden<br><small style="font-size:34px;font-weight:800">don't let your 🔥99 streak wilt!</small></div>
  <div class="a" style="position:absolute;top:800px;left:0;right:0;text-align:center;{show(4.2, t_done, 'pop .3s')}">
    <span class="tag">⚡ SPEEDRUN MODE</span>
    <div style="display:flex;justify-content:center;gap:30px;margin-top:40px;animation:jitter .2s 4.4s 20">
      <div style="width:400px;height:400px;border-radius:40px;background:#f4efe2;display:grid;place-items:center">{g1}</div>
      <div style="width:400px;height:400px;border-radius:40px;background:#f4efe2;display:grid;place-items:center">{g2}</div></div>
    <div class="cap" style="position:static;margin-top:50px">writing like my life<br>depends on it ✍️😤</div>
  </div>
  <div class="a" style="position:absolute;top:800px;left:0;right:0;text-align:center;animation:pop .5s {t_done + .2:.2f}s both">
    <div style="font-size:300px">🌷</div>
    <div class="big"><b>Day 100</b> 🔥</div>
    <div class="cap" style="position:static;margin-top:40px">saved. at 23:59:58. 😮‍💨</div>
  </div>
  <div class="cap a" style="top:1600px;animation:up .4s {t_done + 1.6:.2f}s both">(psst: a raindrop 💧 saves a busy day,<br>no panic needed 😌)</div>"""
    for k in range(10):
        x, y = 80 + (k * 97) % 900, 560 + (k * 131) % 700
        body += f'<div class="a" style="position:absolute;top:{y}px;left:{x}px;font-size:70px;animation:spark 1s {t_done + .2 + k * .06:.2f}s both">{"🎉✨🌸"[k % 3]}</div>'
    ev["pop"] += [1.8, 4.2]
    ev["reveal"] += [round(t_done, 2), round(t_done + .2, 2)]
    t_end = t_done + 4.8
    ev["chime"] = [round(t_end, 2)]
    page("fun-streak", "😱 Relatable", "Me at 11:58 PM<br>remembering my <span class=\"hl\">streak</span>", body, t_end,
         endcard(t_end, 'Streaks that forgive.<br><span class="hl">Plants that grow</span> 🌱'))
    return t_end + 3.6, ev

if __name__ == "__main__":
    out = {}
    for name, f in [("fun-skip", skip), ("fun-dual", dual), ("fun-sounds", sounds), ("fun-streak", streak)]:
        end, ev = f()
        out[name] = dict(end=round(end, 2), events={k: [round(x, 2) for x in v] for k, v in ev.items()})
    print(json.dumps(out))
