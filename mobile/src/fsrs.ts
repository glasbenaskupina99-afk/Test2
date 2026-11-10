// FSRS (Free Spaced Repetition Scheduler, v4.5 formulas with default weights).
// Models each card by stability S (days until recall drops to 90%) and difficulty D (1–10),
// and schedules the next review for when you're predicted to remember it 90% of the time.
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81; // makes R(S, S) = 0.9
export const RETENTION = 0.9;
const MAX_DAYS = 365;

const clampD = (d) => Math.min(10, Math.max(1, d));
const initD = (g) => clampD(W[4] - (g - 3) * W[5]);

/** Probability of recalling a card `t` days after its last review. */
export const retrievability = (t, s) => Math.pow(1 + (FACTOR * t) / s, DECAY);

/** Days until retrievability falls to `RETENTION`. */
export const intervalFor = (s) => (s / FACTOR) * (Math.pow(RETENTION, 1 / DECAY) - 1);

/**
 * Next memory state after a review.
 * @param {{stability?:number, difficulty?:number}} card  previous state (empty for a first review)
 * @param {1|2|3|4} rating  Again, Hard, Good, Easy
 * @param {number} elapsed  days since the previous review
 */
export function next(card, rating, elapsed) {
  if (!card.stability) return { stability: W[rating - 1], difficulty: initD(rating) };
  const { stability: s, difficulty: d } = card;
  const r = retrievability(Math.max(0, elapsed), s);
  const difficulty = clampD(W[7] * initD(3) + (1 - W[7]) * (d - W[6] * (rating - 3)));
  let stability;
  if (rating === 1) {
    stability = Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
  } else {
    const hard = rating === 2 ? W[15] : 1;
    const easy = rating === 4 ? W[16] : 1;
    stability = s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy + 1);
  }
  return { stability: Math.max(0.1, stability), difficulty };
}

/** Scheduled interval in days for a successful review, with a little fuzz so cards don't clump. */
export function scheduleDays(stability, rating) {
  let days = Math.min(MAX_DAYS, intervalFor(stability));
  if (rating >= 3) days = Math.max(1, days);
  if (days > 2.5) days *= 0.95 + Math.random() * 0.1;
  return days;
}

/** Rough FSRS state for cards reviewed with the old SM-2 scheduler. */
export function fromSm2(card) {
  return { stability: Math.max(0.5, card.interval || 0.5), difficulty: clampD(13 - (card.ease || 2.5) * 3.2) };
}
