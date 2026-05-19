"""Download PDFs listed in a public Google Doc, grouped into folders by heading.

Usage:
    python download_doc_pdfs.py <google-doc-url-or-id> [--out downloads]

The doc is fetched via the public ?format=txt export. Lines without URLs are
treated as section headings; the nearest preceding heading becomes the folder
name. Inline labels like "BNS: https://..." override the folder heading for
that single file and are used as the filename instead.
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

DOC_ID_RE = re.compile(r"/document/d/([a-zA-Z0-9_-]+)")
URL_RE = re.compile(r"https?://\S+?\.pdf", re.IGNORECASE)
BULLET_PREFIX_RE = re.compile(r"^\s*[\*\-•]\s*")
INVALID_FS_CHARS_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def resolve_doc_id(arg: str) -> str:
    m = DOC_ID_RE.search(arg)
    return m.group(1) if m else arg


def fetch_doc_text(doc_id: str) -> str:
    url = f"https://docs.google.com/document/d/{doc_id}/export?format=txt"
    with urllib.request.urlopen(url) as r:
        raw = r.read()
    return raw.decode("utf-8-sig", errors="replace")


def sanitize(name: str, fallback: str = "untitled") -> str:
    cleaned = INVALID_FS_CHARS_RE.sub(" ", name).strip().strip(".")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:120] or fallback


def parse(text: str) -> list[tuple[str, str | None, str]]:
    """Return list of (folder, label_or_None, url) tuples in doc order."""
    items: list[tuple[str, str | None, str]] = []
    current_heading = "Uncategorized"

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue

        urls = URL_RE.findall(line)
        if not urls:
            # Heading candidate: skip the meta note line and parenthetical asides.
            stripped = line.strip()
            if stripped.startswith("(") or stripped.lower().startswith("here are all"):
                continue
            current_heading = stripped
            continue

        # Determine if there's an inline label (e.g. "BNS: https://...")
        cleaned_line = BULLET_PREFIX_RE.sub("", line).strip()
        label: str | None = None
        before_url = cleaned_line.split(urls[0], 1)[0].rstrip()
        if before_url.endswith(":"):
            label = before_url[:-1].strip() or None

        for url in urls:
            items.append((current_heading, label, url))

    return items


def filename_for(url: str, label: str | None, index: int) -> str:
    if label:
        return f"{sanitize(label)}.pdf"
    tail = Path(urllib.parse.urlparse(url).path).name or f"file_{index}.pdf"
    # Hash-like names (no readable info) — prefix with index for ordering.
    stem = Path(tail).stem
    if re.fullmatch(r"[0-9a-f]{16,}", stem):
        return f"{index:03d}_{tail}"
    return tail


def download(url: str, dest: Path) -> tuple[bool, str]:
    if dest.exists() and dest.stat().st_size > 0:
        return True, "skip (exists)"
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
    except Exception as e:
        return False, f"error: {e}"
    dest.write_bytes(data)
    return True, f"ok ({len(data):,} bytes)"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("doc", help="Google Doc URL or ID")
    ap.add_argument("--out", default="downloads", help="Output directory (default: downloads)")
    args = ap.parse_args()

    doc_id = resolve_doc_id(args.doc)
    print(f"Fetching doc {doc_id} ...")
    text = fetch_doc_text(doc_id)

    items = parse(text)
    print(f"Parsed {len(items)} PDF link(s) across folders.")

    out_root = Path(args.out)
    counters: dict[str, int] = {}
    ok = fail = 0

    for folder, label, url in items:
        folder_name = sanitize(folder)
        counters[folder_name] = counters.get(folder_name, 0) + 1
        idx = counters[folder_name]
        fname = filename_for(url, label, idx)
        dest = out_root / folder_name / fname

        success, msg = download(url, dest)
        status = "OK " if success else "ERR"
        print(f"  [{status}] {folder_name}/{fname} <- {url}  ({msg})")
        if success:
            ok += 1
        else:
            fail += 1

    print(f"\nDone. {ok} succeeded, {fail} failed. Output: {out_root.resolve()}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
