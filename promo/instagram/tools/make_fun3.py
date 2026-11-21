"""Japanese internet slang reel: 笑 → w → www, which looks like grass → 草 = "lol". Bonus: orz."""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from make_quiz import glyph
from make_fun import JA, page, show, wait_bar

def kusa():
    ev = dict(pop=[.05], brush=[], tick=[], reveal=[])
    ST, GP = .28, .05
    # 1) 笑 drawn stroke by stroke, then how it shrank in chats
    t0 = .7
    n1 = len(json.loads((JA / "笑.json").read_text())["strokes"])
    g1, e1 = glyph("笑", t0 + .4, ST, GP, 560, JA)
    ev["brush"] += [round(t0 + .4 + k * (ST + GP), 2) for k in range(n1)]
    tl = e1 + .1                      # its meaning
    ta = tl + 1.3                     # (笑) → w → wwwww
    t1 = ta + 3.4
    chain = [("(笑)", ta), ("→ w", ta + .7), ("→ wwwww", ta + 1.4)]
    # 2) what does wwwww look like?
    tq, WAIT = t1 + .7, 2.2
    tr = tq + WAIT
    t2 = tr + 2.0
    # 3) so the kanji for grass became "lol"
    n3 = len(json.loads((JA / "草.json").read_text())["strokes"])
    g3, e3 = glyph("草", t2 + .4, ST, GP, 560, JA)
    ev["brush"] += [round(t2 + .4 + k * (ST + GP), 2) for k in range(n3)]
    tm = e3 + .1
    t3 = tm + 3.0
    # 4) bonus: orz
    to = t3 + 1.0
    tz = to + 2.6
    t4 = tz + 2.6

    body = f"""
  <div class="item a" style="{show(t0, t1, 'pop .4s')}">
    <div class="box" style="width:640px;height:640px">{g1}</div>
    <div style="position:relative;height:520px;width:100%;margin-top:36px">
      <div class="a" style="position:absolute;left:0;right:0;animation:pop .4s {tl:.2f}s both">
        <div class="big"><span class="ja">笑</span> = <b>laugh</b> 😄</div><div class="rd" style="font-size:42px">warau · in chats: (笑) after a joke</div></div>
      <div style="position:absolute;left:0;right:0;top:220px;display:flex;justify-content:center;gap:26px;font-size:84px;font-weight:900">
        {''.join(f'<span class="a{" hl" if i == 2 else ""}" style="animation:pop .35s {t:.2f}s both">{s}</span>' for i, (s, t) in enumerate(chain))}
      </div>
      <div class="rd a" style="position:absolute;left:0;right:0;top:360px;animation:pop .35s {ta + 2.1:.2f}s both">w = <b style="color:var(--gold)">w</b>arau · more w = more laughing</div>
    </div>
  </div>
  <div class="item a" style="{show(t1, t2, 'pop .4s')};top:600px">
    <div style="position:relative;height:330px;width:100%">
      <div class="a" style="position:absolute;left:0;right:0;font-size:200px;font-weight:900;white-space:nowrap;line-height:1.4;{show(t1, tr, 'pop .35s')}">wwwww</div>
      <div class="a" style="position:absolute;left:0;right:0;font-size:150px;line-height:1.8;white-space:nowrap;animation:pop .4s {tr:.2f}s both">🌱🌱🌱🌱🌱</div>
    </div>
    <div style="position:relative;height:300px;width:100%;margin-top:60px">
      <div class="a" style="position:absolute;left:0;right:0;{show(tq, tr, 'pop .3s')}"><div class="big" style="font-size:72px">What does it look like? 👀</div>{wait_bar(tq, WAIT)}</div>
      <div class="a" style="position:absolute;left:0;right:0;animation:pop .4s {tr + .2:.2f}s both"><div class="big"><b>Grass!</b> 🌿</div><div class="rd">a whole lawn of laughing</div></div>
    </div>
  </div>
  <div class="item a" style="{show(t2, t3, 'pop .4s')}">
    <div class="box" style="width:640px;height:640px">{g3}</div>
    <div style="position:relative;height:520px;width:100%;margin-top:36px">
      <div class="a" style="position:absolute;left:0;right:0;animation:pop .4s {tm:.2f}s both">
        <div class="big"><span class="ja">草</span> = <b>grass</b> 🌿</div><div class="rd">kusa</div></div>
      <div class="a" style="position:absolute;left:0;right:0;top:230px;animation:pop .45s {tm + 1.2:.2f}s both">
        <div class="big" style="font-size:96px">so <span class="ja">草</span> now means <b>LOL</b> 😂</div><div class="rd">Japanese internet slang</div></div>
    </div>
  </div>
  <div class="item a" style="{show(t3, t4, 'pop .4s')}">
    <span class="tag">BONUS</span>
    <div style="position:relative;margin-top:70px;font-size:330px;font-weight:900;letter-spacing:6px;line-height:1">
      <span class="a" style="animation:pop .35s {t3 + .3:.2f}s both">o</span><span class="a" style="animation:pop .35s {t3 + .5:.2f}s both">r</span><span class="a" style="animation:pop .35s {t3 + .7:.2f}s both">z</span>
    </div>
    <div style="display:flex;justify-content:center;gap:34px;margin-top:40px">
      <span class="tag a" style="animation:pop .3s {to:.2f}s both">o = head</span>
      <span class="tag a" style="animation:pop .3s {to + .4:.2f}s both">r = arms</span>
      <span class="tag a" style="animation:pop .3s {to + .8:.2f}s both">z = legs</span>
    </div>
    <div class="a" style="margin-top:70px;animation:pop .45s {tz:.2f}s both">
      <div style="font-size:200px;line-height:1.1">🙇</div>
      <div class="big" style="font-size:88px">= <b>I give up</b></div><div class="rd">someone on their knees in despair · born on Japanese forums</div></div>
  </div>"""
    ev["pop"] += [round(t0, 2), round(tl, 2)] + [round(t, 2) for _, t in chain] + [round(t1, 2), round(t2, 2), round(t3, 2), round(to, 2), round(to + .4, 2), round(to + .8, 2)]
    ev["tick"] += [round(tq, 2), round(tq + 1, 2), round(tq + 2, 2)]
    ev["reveal"] += [round(tr, 2), round(tm, 2), round(tm + 1.2, 2), round(tz, 2)]
    page("fun-kusa", "🇯🇵 Internet slang", "How Japanese<br>people <span class=\"hl\">laugh online</span>", body, t4,
         'Learn Japanese<br><span class="hl">the fun way</span> 🌱')
    ev["chime"] = [round(t4, 2)]
    return t4, ev

if __name__ == "__main__":
    end, ev = kusa()
    print(json.dumps({"fun-kusa": {"end": end, "events": ev}}))
