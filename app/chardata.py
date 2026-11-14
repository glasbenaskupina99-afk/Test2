"""Stroke data for Hanzi Writer (hanzi-writer-data, Arphic Public License).

Characters are served from data/chars/<char>.json. Missing ones are fetched from
jsDelivr on demand and cached. `python -m app.chardata` downloads the complete set
(~9,500 characters, 13 MB) from the npm registry so the app works fully offline.
"""
import io
import json
import logging
import sys
import tarfile

import httpx

from .db import DATA_DIR

CHAR_DIR = DATA_DIR / "chars"
CDN = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/{}.json"
TARBALL = "https://registry.npmjs.org/hanzi-writer-data/-/hanzi-writer-data-2.0.1.tgz"

log = logging.getLogger("hanzi")


def _path(char: str):
    return CHAR_DIR / f"{char}.json"


async def get(char: str) -> dict | None:
    if len(char) != 1:
        return None
    path = _path(char)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(CDN.format(char))
        if r.status_code != 200:
            return None
        data = r.json()
    except Exception as e:  # noqa: BLE001
        log.warning("could not fetch stroke data for %s: %s", char, e)
        return None
    CHAR_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def have_all() -> bool:
    return (CHAR_DIR / ".complete").exists()


def download_all():
    CHAR_DIR.mkdir(parents=True, exist_ok=True)
    log.info("downloading stroke data from %s", TARBALL)
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        r = client.get(TARBALL)
        r.raise_for_status()
    count = 0
    with tarfile.open(fileobj=io.BytesIO(r.content), mode="r:gz") as tar:
        for member in tar.getmembers():
            name = member.name.rsplit("/", 1)[-1]
            if member.isfile() and name.endswith(".json") and len(name) == 6:  # "<char>.json"
                f = tar.extractfile(member)
                if f:
                    (CHAR_DIR / name).write_bytes(f.read())
                    count += 1
    (CHAR_DIR / ".complete").write_text(str(count))
    log.info("stroke data ready: %d characters", count)
    return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    n = download_all()
    print(f"Saved {n} characters to {CHAR_DIR}")
    sys.exit(0)
