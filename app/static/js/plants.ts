// The plants of the garden (2.1): every learned word grows as a real plant. Which plant is fixed
// by the word itself (the same on every device), so a garden is full of different species.
// Drawings share one frame: viewBox 0 0 40 48, standing on the ground at (20, 46).

export interface Species {
  key: string;
  name: string;
  latin: string;
  svg: string;
}

const stem = (c = "#4f7d3a", x = 20, top = 22) => `<path d="M${x} 46 L${x} ${top}" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
const leaf = (x: number, y: number, r: number, c = "#5f9b45") => `<ellipse cx="${x}" cy="${y}" rx="4.5" ry="2" transform="rotate(${r} ${x} ${y})" fill="${c}"/>`;
const trunk = (c = "#7a5640", w = 2.4, top = 26) => `<path d="M${20 - w} 46 L${20 - w / 2} ${top} L${20 + w / 2} ${top} L${20 + w} 46 Z" fill="${c}"/>`;
const petals = (cx: number, cy: number, n: number, r: number, pr: number, c: string, core: string) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return `<circle cx="${(cx + Math.cos(a) * r).toFixed(1)}" cy="${(cy + Math.sin(a) * r).toFixed(1)}" r="${pr}" fill="${c}"/>`;
  }).join("") + `<circle cx="${cx}" cy="${cy}" r="${(pr * 0.9).toFixed(1)}" fill="${core}"/>`;

export const SPECIES: Species[] = [
  { key: "oak", name: "Oak", latin: "Quercus robur", svg: `${trunk()}<path d="M20 5c7 0 12 5 12 10 3 2 4 5 3 8-1 4-5 6-9 6-2 2-4 2-6 2s-4 0-6-2c-4 0-8-2-9-6-1-3 0-6 3-8 0-5 5-10 12-10z" fill="#4e8a3a"/><path d="M11 18c3 2 6 2 9 0M21 13c3 2 6 2 8 0" stroke="#3d6e2d" stroke-width="1" fill="none"/>` },
  { key: "birch", name: "Birch", latin: "Betula pendula", svg: `<path d="M18.6 46 L19.2 14 L20.8 14 L21.4 46 Z" fill="#f4f1e8" stroke="#a9a293" stroke-width="0.5"/><path d="M19 22h2M19.2 30h1.8M19 38h2" stroke="#3a3a3a" stroke-width="1"/><ellipse cx="20" cy="15" rx="9" ry="12" fill="#8fc463"/><ellipse cx="16" cy="20" rx="4" ry="5" fill="#a4d277"/>` },
  { key: "cherry", name: "Cherry blossom", latin: "Prunus serrulata", svg: `${trunk("#6a4636", 2.2, 24)}<path d="M20 26 L13 18 M20 26 L27 17" stroke="#6a4636" stroke-width="1.6"/><circle cx="20" cy="15" r="10" fill="#f6c1d0"/><circle cx="12" cy="19" r="6" fill="#f3aec3"/><circle cx="28" cy="18" r="6.5" fill="#f9d2de"/><circle cx="17" cy="11" r="1.3" fill="#e2789a"/><circle cx="25" cy="14" r="1.3" fill="#e2789a"/><circle cx="13" cy="20" r="1.2" fill="#e2789a"/>` },
  { key: "pine", name: "Pine", latin: "Pinus sylvestris", svg: `${trunk("#7a5640", 1.8, 32)}<path d="M20 3 L30 18 L25 18 L33 29 L27 29 L35 38 L5 38 L13 29 L7 29 L15 18 L10 18 Z" fill="#2f6b45"/><path d="M20 3 L25 11 L20 9.5 L15 11 Z" fill="#3f8558"/>` },
  { key: "bamboo", name: "Bamboo", latin: "Phyllostachys", svg: `<path d="M15 46 V12 M20 46 V6 M25 46 V15" stroke="#8cbf4a" stroke-width="2.6" fill="none"/><path d="M14 20h2.4M14 30h2.4M19 16h2.4M19 27h2.4M19 37h2.4M24 25h2.4M24 35h2.4" stroke="#5f8f2c" stroke-width="1"/>${leaf(11, 12, -30, "#6fae3a")}${leaf(24, 8, 25, "#6fae3a")}${leaf(29, 16, 30, "#6fae3a")}${leaf(16, 23, -25, "#7fbd47")}` },
  { key: "maple", name: "Japanese maple", latin: "Acer palmatum", svg: `${trunk("#5a3d30", 2, 26)}<path d="M20 4l4 6 6-2-1 7 6 3-6 4 2 6-7-2-4 6-4-6-7 2 2-6-6-4 6-3-1-7 6 2z" fill="#c8452f"/><path d="M20 10v16" stroke="#9c3324" stroke-width="0.8"/>` },
  { key: "ginkgo", name: "Ginkgo", latin: "Ginkgo biloba", svg: `${trunk("#6e5240", 2, 24)}<path d="M20 26c-9 0-14-6-12-14 4 3 8 3 12-1 4 4 8 4 12 1 2 8-3 14-12 14z" fill="#d9c13c"/><path d="M20 26c-6-1-9-5-9-10 3 2 6 2 9-1 3 3 6 3 9 1 0 5-3 9-9 10z" fill="#e8d35b"/>` },
  { key: "linden", name: "Linden", latin: "Tilia cordata", svg: `${trunk("#6b4e3c", 2.4, 26)}<path d="M20 4c-6 6-13 8-12 17 1 6 6 9 12 9s11-3 12-9c1-9-6-11-12-17z" fill="#6aa84f"/><path d="M14 18c2 2 4 2 6 0 2 2 4 2 6 0" stroke="#4f8a38" stroke-width="1" fill="none"/><circle cx="15" cy="23" r="1.2" fill="#efe39a"/><circle cx="25" cy="21" r="1.2" fill="#efe39a"/>` },
  { key: "apple", name: "Apple tree", latin: "Malus domestica", svg: `${trunk("#6e4b37", 2.4, 26)}<circle cx="20" cy="16" r="12" fill="#5c9a44"/><circle cx="14" cy="14" r="2" fill="#d33b2c"/><circle cx="24" cy="11" r="2" fill="#d33b2c"/><circle cx="26" cy="20" r="2" fill="#d33b2c"/><circle cx="17" cy="22" r="2" fill="#d33b2c"/>` },
  { key: "olive", name: "Olive tree", latin: "Olea europaea", svg: `<path d="M18 46 C17 38 22 34 19 26 L22 26 C24 34 21 38 23 46 Z" fill="#7d6a55"/><ellipse cx="20" cy="18" rx="12" ry="8" fill="#8fa178"/><ellipse cx="14" cy="15" rx="5" ry="3" fill="#a3b48c"/><circle cx="23" cy="20" r="1.1" fill="#3d3a4a"/><circle cx="17" cy="21" r="1.1" fill="#3d3a4a"/>` },
  { key: "tea", name: "Tea plant", latin: "Camellia sinensis", svg: `<path d="M20 46 V30" stroke="#6b4e3c" stroke-width="2"/><ellipse cx="20" cy="28" rx="12" ry="9" fill="#3f7a3a"/>${leaf(12, 25, -20, "#59964b")}${leaf(27, 23, 20, "#59964b")}${leaf(20, 21, 0, "#6fae5a")}<circle cx="15" cy="30" r="1.6" fill="#fff8e6"/><circle cx="26" cy="29" r="1.6" fill="#fff8e6"/>` },
  { key: "camellia", name: "Camellia", latin: "Camellia japonica", svg: `<ellipse cx="20" cy="30" rx="12" ry="11" fill="#2f6a3a"/>${petals(15, 26, 6, 2.6, 2.2, "#d9334f", "#f5d45a")}${petals(26, 31, 6, 2.6, 2.2, "#e2506a", "#f5d45a")}${petals(18, 36, 5, 2.2, 1.9, "#d9334f", "#f5d45a")}` },
  { key: "hydrangea", name: "Hydrangea", latin: "Hydrangea macrophylla", svg: `<ellipse cx="20" cy="36" rx="13" ry="8" fill="#3d7340"/><circle cx="14" cy="28" r="6" fill="#7b9ee0"/><circle cx="25" cy="27" r="6.5" fill="#9a8fdc"/><circle cx="20" cy="22" r="5.5" fill="#8db3ea"/><circle cx="14" cy="27" r="1" fill="#e9efff"/><circle cx="24" cy="25" r="1" fill="#e9efff"/>` },
  { key: "lavender", name: "Lavender", latin: "Lavandula angustifolia", svg: `<path d="M14 46 L12 20 M20 46 V16 M26 46 L28 21 M17 46 L16 24 M23 46 L24 23" stroke="#7c9a6a" stroke-width="1.2" fill="none"/>${[[12, 20], [20, 16], [28, 21], [16, 24], [24, 23]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.8" ry="5" fill="#8d6cc8"/>`).join("")}` },
  { key: "sunflower", name: "Sunflower", latin: "Helianthus annuus", svg: `${stem("#4f7d3a", 20, 16)}${leaf(15, 32, -30)}${leaf(25, 28, 30)}${petals(20, 13, 12, 5.5, 2.6, "#f2c12e", "#6b4423")}` },
  { key: "tulip", name: "Tulip", latin: "Tulipa", svg: `${stem("#4f8a3a", 20, 22)}<path d="M15 34c-3-4-2-10 5-12-1 5-2 9-5 12zM25 34c3-4 2-10-5-12 1 5 2 9 5 12z" fill="#5f9b45"/><path d="M14 13c0 7 2 10 6 10s6-3 6-10l-3 3-3-5-3 5z" fill="#e2483d"/>` },
  { key: "rose", name: "Rose", latin: "Rosa", svg: `${stem("#3f6e34", 20, 18)}${leaf(15, 30, -30, "#3f7a3a")}${leaf(25, 26, 30, "#3f7a3a")}<circle cx="20" cy="15" r="6.5" fill="#c62c47"/><path d="M16 15c1-3 6-4 8 0-2-1-4-1-5 1 1 1 3 1 4 0" stroke="#8c1a30" stroke-width="1" fill="none"/>` },
  { key: "lotus", name: "Lotus", latin: "Nelumbo nucifera", svg: `<ellipse cx="20" cy="43" rx="15" ry="3.5" fill="#4d8a52"/><path d="M20 22c-4 4-4 12 0 16 4-4 4-12 0-16z" fill="#f4a9c4"/><path d="M12 28c1 6 4 9 8 10-2-4-4-8-8-10zM28 28c-1 6-4 9-8 10 2-4 4-8 8-10z" fill="#f7c3d6"/><path d="M8 34c3 3 7 4 12 4-4-3-8-4-12-4zM32 34c-3 3-7 4-12 4 4-3 8-4 12-4z" fill="#f9d4e2"/>` },
  { key: "fern", name: "Fern", latin: "Dryopteris filix-mas", svg: `${[[-24, 9, 14], [-9, 15, 9], [9, 25, 9], [24, 31, 14], [0, 20, 6]].map(([r, x, y]) => `<g transform="rotate(${r} 20 46)"><path d="M20 46 Q20 26 20 8" stroke="#3f7d3a" stroke-width="1.2" fill="none"/>${Array.from({ length: 7 }, (_, i) => `<ellipse cx="${i % 2 ? 23 : 17}" cy="${12 + i * 4.5}" rx="3.2" ry="1.3" transform="rotate(${i % 2 ? 25 : -25} ${i % 2 ? 23 : 17} ${12 + i * 4.5})" fill="#5aa14a"/>`).join("")}</g>`).join("")}` },
  { key: "cactus", name: "Cactus", latin: "Echinopsis", svg: `<path d="M16 46 V18 a4 4 0 0 1 8 0 V46 Z" fill="#4f9a5a"/><path d="M16 32 h-4 v-8 a2.5 2.5 0 0 1 5 0" fill="none" stroke="#4f9a5a" stroke-width="4" stroke-linecap="round"/><path d="M24 28 h4 v-6 a2.5 2.5 0 0 0 -5 0" fill="none" stroke="#4f9a5a" stroke-width="4" stroke-linecap="round"/><path d="M20 16v28" stroke="#3c7d47" stroke-width="0.8"/><circle cx="20" cy="13" r="2.6" fill="#ef6f8d"/>` },
  { key: "daisy", name: "Daisy", latin: "Bellis perennis", svg: `${stem("#5a9a45", 14, 26)}${stem("#5a9a45", 25, 20)}${petals(14, 24, 10, 3.4, 1.7, "#ffffff", "#f2c12e")}${petals(25, 18, 10, 3.6, 1.8, "#fdfbf5", "#f2c12e")}${leaf(19, 40, -10)}` },
  { key: "poppy", name: "Poppy", latin: "Papaver rhoeas", svg: `<path d="M16 46 Q15 30 14 20 M24 46 Q26 32 27 24" stroke="#5f8f3a" stroke-width="1.3" fill="none"/><circle cx="14" cy="18" r="5" fill="#e0322a"/><circle cx="14" cy="18" r="1.6" fill="#2a2222"/><circle cx="27" cy="22" r="4.2" fill="#ea4a35"/><circle cx="27" cy="22" r="1.3" fill="#2a2222"/>` },
  { key: "peony", name: "Peony", latin: "Paeonia lactiflora", svg: `<ellipse cx="20" cy="38" rx="12" ry="7" fill="#3f7a40"/><circle cx="20" cy="24" r="8.5" fill="#f2a1b8"/><circle cx="16" cy="22" r="4" fill="#f6bccc"/><circle cx="23" cy="26" r="4" fill="#ec8eaa"/><circle cx="20" cy="21" r="2.5" fill="#fbd3df"/>` },
  { key: "chrysanthemum", name: "Chrysanthemum", latin: "Chrysanthemum morifolium", svg: `${stem("#4f7d3a", 20, 18)}${leaf(15, 32, -30)}${leaf(25, 36, 30)}${petals(20, 15, 16, 5, 1.8, "#e9a527", "#c97a14")}${petals(20, 15, 10, 2.6, 1.4, "#f2c14a", "#e09422")}` },
  { key: "iris", name: "Iris", latin: "Iris sibirica", svg: `<path d="M17 46 Q15 30 12 18 M23 46 Q25 30 28 16" stroke="#5a8f45" stroke-width="2" fill="none"/>${stem("#4f7d3a", 20, 20)}<path d="M20 20c-5-1-7-6-4-9 2 2 3 5 4 9zM20 20c5-1 7-6 4-9-2 2-3 5-4 9zM20 20c-1-6 0-10 0-12 1 2 2 6 0 12z" fill="#6a5acd"/><path d="M20 20c-3 2-6 2-8 1 3-1 5-2 8-1zM20 20c3 2 6 2 8 1-3-1-5-2-8-1z" fill="#8f82e0"/>` },
  { key: "mint", name: "Mint", latin: "Mentha spicata", svg: `${[14, 20, 26].map((x, i) => `<path d="M${x} 46 V${24 - i * 2}" stroke="#4f8f3f" stroke-width="1.3"/>${[0, 1, 2, 3].map((k) => leaf(x + (k % 2 ? 3 : -3), 42 - k * 5 - i * 2, k % 2 ? 25 : -25, "#6cbb5a")).join("")}`).join("")}` },
  { key: "carnation", name: "Carnation", latin: "Dianthus caryophyllus", svg: `${stem("#7da38c", 16, 22)}${stem("#7da38c", 25, 18)}<path d="M11 21l2-4 2 3 2-4 2 4 1-2 1 3c-2 3-8 3-10 0z" fill="#d9304a"/><path d="M20 17l2-4 2 3 2-4 2 4 1-2 1 3c-2 3-8 3-10 0z" fill="#e2485e"/>${leaf(20, 38, 0, "#7da38c")}` },
  { key: "edelweiss", name: "Edelweiss", latin: "Leontopodium nivale", svg: `${stem("#9db39a", 20, 24)}${petals(20, 22, 7, 4, 2.6, "#f4f2ea", "#d9d07a")}${leaf(16, 36, -30, "#b8c8b4")}${leaf(24, 34, 30, "#b8c8b4")}` },
];

const BY_KEY = Object.fromEntries(SPECIES.map((s) => [s.key, s]));
export const speciesOf = (key: string) => BY_KEY[key] || SPECIES[0];

/** A small stable hash, so a word always becomes the same plant. */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/** The plant a word grows into. */
export const plantFor = (lang: string, word: string) => SPECIES[hashOf(`${lang}|${word}`) % SPECIES.length];

/** <svg><defs> with every plant as a symbol, inserted once on a page that draws plants. */
export const PLANT_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${SPECIES.map((s) => `<g id="pl-${s.key}">${s.svg}</g>`).join("")}</defs></svg>`;

/** One plant on its own (for sheets and lists). */
export const plantSvg = (key: string, size = 64) => `<svg viewBox="0 0 40 48" width="${size}" height="${(size * 48) / 40}">${speciesOf(key).svg}</svg>`;
