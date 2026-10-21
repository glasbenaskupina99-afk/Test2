// Builds the locked preview of the web app: a copy of mobile/www that asks for an access code
// before it starts and tells search engines to stay away. Published by CI to .../preview/ until
// the web app is released for everyone (Actions → Run workflow → "Publish web app too").
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [src = "www", out = "preview"] = process.argv.slice(2);
// SHA-256 of the access code (the code itself is not stored anywhere in the repository).
const CODE_HASH = "951a6465efaa924ba26c4b3cc3d8b135837c1b82a6abd137b14d9655ce5a6113";

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });

const gate = `<meta name="robots" content="noindex, nofollow">
<script>
(function () {
  var KEY = "bloomko-preview";
  try { if (localStorage.getItem(KEY) === "${CODE_HASH}") return; } catch (e) {}
  document.documentElement.classList.add("locked");
  var st = document.createElement("style");
  st.textContent = "html.locked body>*:not(#preview-gate){display:none!important}#preview-gate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#16271e;color:#f4efe2;font:700 17px Nunito,system-ui,sans-serif}#preview-gate form{display:flex;flex-direction:column;gap:12px;width:min(320px,86vw);text-align:center}#preview-gate input{padding:14px;border-radius:14px;border:2px solid #3d5a47;background:#1c3026;color:inherit;font:inherit;text-align:center;letter-spacing:2px;text-transform:uppercase}#preview-gate button{padding:14px;border:0;border-radius:14px;background:#8cc06b;color:#16271e;font:inherit;font-weight:900}#preview-gate small{color:#a9b5a6}";
  document.head.appendChild(st);
  function sha(t) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)).then(function (b) {
      return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    var g = document.createElement("div");
    g.id = "preview-gate";
    g.innerHTML = '<form><div style="font-size:44px">🔒</div><b>Bloomko preview</b><small>This version is not public yet.</small><input autocomplete="off" placeholder="Access code" aria-label="Access code"><button>Open</button><small class="err"></small></form>';
    document.body.appendChild(g);
    g.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      sha(g.querySelector("input").value.trim().toUpperCase()).then(function (h) {
        if (h !== "${CODE_HASH}") { g.querySelector(".err").textContent = "Wrong code"; return; }
        try { localStorage.setItem(KEY, h); } catch (e) {}
        location.reload();
      });
    });
  });
})();
</script>`;

const index = join(out, "index.html");
writeFileSync(index, readFileSync(index, "utf8").replace("<head>", () => "<head>\n" + gate));
writeFileSync(join(out, "robots.txt"), "User-agent: *\nDisallow: /\n");
writeFileSync(join(out, ".nojekyll"), "");
console.log(`Locked preview in ${out}`);
