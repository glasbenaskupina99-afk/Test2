"""Small SM-2 style scheduler. Grades: 0 again, 1 hard, 2 good, 3 easy."""
from datetime import datetime, timedelta

SKILLS = ("write", "speak", "recall")


def now() -> datetime:
    return datetime.now().replace(microsecond=0)


def fmt(dt: datetime) -> str:
    return dt.isoformat(sep=" ")


def schedule(card: dict, grade: int) -> dict:
    ease = card["ease"]
    interval = card["interval"]
    reps = card["reps"]
    lapses = card["lapses"]

    if grade == 0:
        lapses += 1
        ease = max(1.3, ease - 0.2)
        interval = 0
        due = now() + timedelta(minutes=10)
    else:
        if grade == 1:
            ease = max(1.3, ease - 0.15)
            interval = max(1.0, interval * 1.2)
        elif grade == 2:
            interval = 1.0 if interval < 1 else (3.0 if interval < 3 else interval * ease)
        else:
            ease += 0.15
            interval = 3.0 if interval < 1 else interval * ease * 1.3
        interval = min(interval, 365.0)
        due = now() + timedelta(days=interval)
        reps += 1

    return {
        "ease": round(ease, 3),
        "interval": round(interval, 3),
        "reps": reps,
        "lapses": lapses,
        "due": fmt(due),
        "last_review": fmt(now()),
    }
