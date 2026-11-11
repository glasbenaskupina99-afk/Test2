// bloomko.eu: the shared page script (East and Heritage, every language). Page texts and the
// demo garden come from window.BLOOMKO, written into each page by mobile/scripts/build-site.ts.
(function () {
  const B = window.BLOOMKO || {};
  const T = B.t || {};

  // ---------------------------------------------------------------- "Get early access"
  document.querySelectorAll("[data-notify]").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button");
      const email = form.email.value.trim();
      btn.disabled = true;
      try {
        const r = await fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, website: form.website.value, edition: B.edition, lang: B.lang }),
        });
        if (r.status === 400) { btn.disabled = false; form.email.focus(); alert(T.invalid); return; }
        if (!r.ok) throw new Error(String(r.status));
        form.replaceChildren(Object.assign(document.createElement("div"), { className: "notify-done", textContent: T.thanks }));
        const win = document.getElementById("try-win-text");
        if (win && !form.closest(".try-win")) win.textContent = T.on_list;
      } catch {
        btn.disabled = false;
        location.href = "mailto:thebloomko@gmail.com?subject=" + encodeURIComponent("Notify me about Bloomko") + "&body=" + encodeURIComponent(email);
      }
    });
  });

  // ---------------------------------------------------------------- gentle reveal on scroll
  const items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -60px 0px" });
    items.forEach((el) => io.observe(el));
  } else items.forEach((el) => el.classList.add("in"));

  // ---------------------------------------------------------------- the sticky button (phones)
  const sticky = document.getElementById("sticky-cta");
  if (sticky && "IntersectionObserver" in window) {
    const vis = new Set();
    const io = new IntersectionObserver((es) => { es.forEach((e) => (e.isIntersecting ? vis.add(e.target) : vis.delete(e.target))); sticky.classList.toggle("hide", vis.size > 0); });
    document.querySelectorAll("[data-notify], [data-try], [data-garden]").forEach((el) => io.observe(el));
  }

  // ---------------------------------------------------------------- this page in your language?
  try {
    const box = document.getElementById("suggest");
    const want = (navigator.languages || [navigator.language || ""]).map((l) => String(l).slice(0, 2).toLowerCase());
    const pick = want.find((l) => B.suggest && B.suggest[l]);
    if (box && pick && pick !== B.lang && !localStorage.getItem("bloomko-lang-ok")) {
      const s = B.suggest[pick];
      const a = Object.assign(document.createElement("a"), { href: s.url, textContent: s.text + " →" });
      a.onclick = () => localStorage.setItem("bloomko-lang-ok", "1");
      document.getElementById("suggest-text").replaceChildren(a);
      box.classList.add("show");
      document.getElementById("suggest-close").onclick = () => { box.remove(); localStorage.setItem("bloomko-lang-ok", "1"); };
    }
    document.querySelectorAll(".langmenu a, footer nav a").forEach((a) => a.addEventListener("click", () => localStorage.setItem("bloomko-lang-ok", "1")));
  } catch { /* no storage: no suggestion */ }

  // ---------------------------------------------------------------- the demo garden
  const wrap = document.querySelector("[data-garden]");
  if (!wrap || !B.garden) return;
  const bed = wrap.querySelector("[data-bed]");
  const keys = Object.keys(B.garden);
  let glang = keys[0];
  let tagTimer = 0;

  function plantSvg(key) {
    return `<svg viewBox="0 0 40 48" aria-hidden="true">${B.plants[key].svg}</svg>`;
  }
  function render(grow) {
    const g = B.garden[glang];
    wrap.querySelector("[data-gname]").textContent = g.name;
    bed.classList.toggle("grown", !grow);
    bed.replaceChildren(...g.words.map(([w, r, m, p], i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "spot";
      b.dataset.i = i;
      b.setAttribute("aria-label", `${B.plants[p].name} · ${w} — ${m}`);
      b.innerHTML = plantSvg(p);
      b.querySelector("svg").style.transitionDelay = grow ? `${i * 70}ms` : "0ms";
      b.onclick = () => showTag(b, i);
      return b;
    }));
    count();
    if (grow) requestAnimationFrame(() => requestAnimationFrame(() => bed.classList.add("grown")));
  }
  function count() {
    const g = B.garden[glang];
    const living = bed.querySelectorAll(".spot:not(.gone)").length;
    wrap.querySelector("[data-gcount]").textContent = `${living} / ${g.words.length}`;
  }
  function showTag(spot, i) {
    bed.querySelectorAll(".ptag").forEach((t) => t.remove());
    const [w, r, m, p] = B.garden[glang].words[i];
    const tag = document.createElement("div");
    tag.className = "ptag";
    if (spot.classList.contains("gone")) tag.textContent = T.g_gone_tag;
    else tag.innerHTML = `<span></span> · <b class="w"></b><small></small>`;
    if (!spot.classList.contains("gone")) {
      tag.children[0].textContent = B.plants[p].name;
      tag.children[1].textContent = w;
      tag.children[2].textContent = [r && r !== w ? r : "", m].filter(Boolean).join(" · ");
    }
    spot.append(tag);
    // Keep the name tag inside the garden.
    const wr = wrap.getBoundingClientRect();
    const tr = tag.getBoundingClientRect();
    const shift = Math.max(0, wr.left + 6 - tr.left) - Math.max(0, tr.right - (wr.right - 6));
    if (shift) tag.style.transform = `translateX(calc(-50% + ${shift}px))`;
    clearTimeout(tagTimer);
    tagTimer = setTimeout(() => tag.remove(), 3500);
  }
  wrap.querySelectorAll("[data-glang]").forEach((b) => b.addEventListener("click", () => {
    wrap.querySelectorAll("[data-glang]").forEach((x) => x.classList.toggle("on", x === b));
    glang = b.dataset.glang;
    render(true);
  }));
  wrap.querySelector("[data-gact=forget]").onclick = () => {
    // Skip the reviews for a while: some plants wilt, the long-forgotten ones disappear.
    const spots = [...bed.querySelectorAll(".spot")];
    spots.forEach((s, i) => {
      const h = (i * 7 + 3) % 10;
      if (s.classList.contains("wilt")) { s.classList.remove("wilt"); s.classList.add("gone"); }
      else if (h < 4 && !s.classList.contains("gone")) s.classList.add("wilt");
    });
    count();
  };
  wrap.querySelector("[data-gact=practise]").onclick = () => {
    bed.querySelectorAll(".spot").forEach((s, i) => {
      if (!s.classList.contains("wilt") && !s.classList.contains("gone")) return;
      s.querySelector("svg").style.transitionDelay = `${i * 40}ms`;
      s.classList.remove("wilt", "gone");
    });
    count();
  };
  if ("IntersectionObserver" in window) {
    render(false);
    bed.classList.remove("grown");
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); render(true); } }, { threshold: 0.35 });
    io.observe(bed);
  } else render(false);
})();
