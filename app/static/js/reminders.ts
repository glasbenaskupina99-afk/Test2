// Daily practice reminder (Android app). Notifications for the next two weeks are scheduled
// at the chosen time and re-planned whenever you practise, so today's reminder disappears
// once your plant has been watered.
import { api } from "./util.js";
import { T } from "./state.js";

const N = () => window.__native?.notifications;
export const canRemind = () => !!N();

const IDS = Array.from({ length: 14 }, (_, i) => 1000 + i);
const CHANNEL = "reminders";
let channelReady = false;

export async function ensurePermission() {
  const n = N();
  if (!n) return false;
  let p = await n.checkPermissions();
  if (p.display !== "granted") p = await n.requestPermissions();
  return p.display === "granted";
}

function message(i, info) {
  const lang = T.lang();
  if (i === 0 && info.streak > 0) return ["🌱 Your plant is thirsty", `Water your ${info.streak}-day streak with a few minutes of ${lang}.`];
  if (i === 0 && info.due > 0) return ["🍃 Leaves are waiting", `${info.due} words are ready for review in your garden.`];
  if (i === 0) return ["🌱 Plant a new seed", `Start a streak today with a short ${lang} lesson.`];
  return [
    ["🌿 Time to grow", `Plant a few new ${lang} words today.`],
    ["💧 A drop of practice", "Five minutes keeps your streak plant green."],
    ["🍃 Your garden misses you", `A short ${lang} lesson waters every leaf.`],
    ["🌱 Your plant is thirsty", "Don't let it wilt — practise for a few minutes today."],
  ][i % 4];
}

/** Re-plan the reminders from the current settings and today's progress. */
export async function scheduleReminders() {
  const n = N();
  if (!n) return;
  try {
    await n.cancel({ notifications: IDS.map((id) => ({ id })) });
    const info = await api("/api/reminder-info");
    if (!info.on) return;
    if ((await n.checkPermissions()).display !== "granted") return;
    if (!channelReady) {
      await n.createChannel({ id: CHANNEL, name: "Daily reminder", description: "A nudge to water your streak plant", importance: 4, lightColor: "#7FB069", vibration: true }).catch(() => {});
      channelReady = true;
    }
    const [hh, mm] = String(info.time || "19:00").split(":").map(Number);
    const now = new Date();
    const list = [];
    IDS.forEach((id, i) => {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh || 0, mm || 0, 0);
      if (i === 0 && (at <= now || info.practiced_today)) return;
      const [title, body] = message(i, info);
      list.push({
        id, title, body, channelId: CHANNEL,
        schedule: { at, allowWhileIdle: true },
        smallIcon: "ic_stat_leaf", iconColor: "#7FB069", largeIcon: "ic_notif_leaf",
      });
    });
    if (list.length) await n.schedule({ notifications: list });
  } catch (e) {
    console.warn("reminders", e);
  }
}
