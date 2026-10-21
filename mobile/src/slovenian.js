// Slovenian helpers: spelling checks (with/without č š ž) and spoken-answer scoring.

const strip = (t) => t.replace(/č/g, "c").replace(/ć/g, "c").replace(/š/g, "s").replace(/ž/g, "z").replace(/đ/g, "d");

/** Lower case, no punctuation, single spaces. */
export const normSl = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-zčćšžđ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** correct | tones_wrong (only č/š/ž missing) | wrong — same result names as the pinyin check. */
export function compareSpelling(answer, expected) {
  const a = normSl(answer);
  const e = normSl(expected);
  if (a && a === e) return { result: "correct" };
  if (a && strip(a) === strip(e)) return { result: "tones_wrong" };
  return { result: "wrong" };
}

/** Score recognised speech against the expected words (accent-insensitive). */
export function compareSpokenSl(heard, expected) {
  const exp = normSl(expected).split(" ").filter(Boolean);
  const got = strip(normSl(heard)).split(" ").filter(Boolean);
  const n = exp.length;
  const m = got.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = strip(exp[i]) === got[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const result = exp.map((w) => ({ expected: w, status: "missing" }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (strip(exp[i]) === got[j]) { result[i].status = "ok"; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const ok = result.filter((r) => r.status === "ok").length;
  return { score: Math.round((100 * ok) / Math.max(n, 1)), syllables: result, heard_pinyin: heard };
}
