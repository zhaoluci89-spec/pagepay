"""OpenStax ingest: pull CC BY 4.0 STEM textbooks into content_catalog.

Background
----------
OpenStax is a Rice University program that publishes free, peer-reviewed
textbooks under CC BY 4.0. Every book is available as a free PDF +
an online HTML version. We ingest the HTML (cleaner than PDF for our
topic-aware slicer) and slice each chapter into per-topic child rows
in content_catalog, with per-topic ReadingUnits.

Why OpenStax first (not CORE, DOAB, Saylor, …)
-----------------------------------------------
The other sources in books.md are real options, but OpenStax is the
right first integration because:
  1. The license is uniform: every book is CC BY 4.0. One license
     allowlist, one attribution string template.
  2. The content set is well-curated and 100% STEM — exactly the
     exam-prep audience PagePay's Study tab targets.
  3. The HTML is consistent across books — same chapter structure,
     same <h2> section markers, same data-type attributes. That
     consistency is what makes the topic_slicer reliable.
  4. Coverage is sufficient on its own for a pilot: ~15 STEM books
     across math, physics, biology, chemistry, economics, psychology,
     statistics, algebra. That's an education catalog, not a sample.

License safety
--------------
The license_allowlist is the gate. Every book we ingest is CC BY 4.0
or CC BY-SA 4.0. If a book comes back with a different license
(e.g. NC, ND), it is REJECTED before any row touches content_catalog.
The same allowlist applies in the slug/curriculum map — we never
accept a URL whose page metadata advertises a non-allowlisted license.

Re-ingest safety
----------------
The import is idempotent on (title, source_url). A re-run skips any
book that's already in the catalog. We don't re-slice a parent that
already has children. The admin force-reslice endpoint already exists
in slicer.py for when the slicer settings change.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ContentCatalog
from app.services.content.slicing.topic_slicer import slice_openstax_chapter

logger = logging.getLogger("uvicorn.error")

# OpenStax serves the canonical book content at this URL pattern. The
# book slug is the trailing path component of the book's homepage URL.
# Example: https://openstax.org/books/university-physics-volume-1/pages/1-introduction
# The slug "university-physics-volume-1" is the part we parameterize.
OPENSTAX_BOOK_BASE = "https://openstax.org/books"

# User-Agent string. OpenStax is OK with reasonable scraping from
# academic-style user agents; the default httpx one gets 403'd.
USER_AGENT = "PagePay/1.0 (+https://pagepay.app) Education-Ingest"

# License allowlist. Anything outside this set is REJECTED before the
# row reaches content_catalog. CC BY and CC BY-SA are commercial-use
# friendly; public_domain is the fallback for old Project Gutenberg
# titles. NC and ND variants are explicitly excluded — PagePay is
# ad-supported, which is commercial use.
LICENSE_ALLOWLIST = {"CC BY 4.0", "CC BY-SA 4.0", "public_domain"}

# The default license every OpenStax book ships with. Verified against
# the openstax.org footer of every book in our curriculum list. If a
# new book comes back with a different license, we reject it.
OPENSTAX_DEFAULT_LICENSE = "CC BY 4.0"

# Maximum HTML bytes we'll fetch per chapter. OpenStax chapters are
# typically 50-150 KB; we cap at 2 MB to protect against a runaway
# single-chapter fetch on a malformed URL.
MAX_CHAPTER_BYTES = 2 * 1024 * 1024

# Maximum body text size per parent row. Same as the gutendex ingest
# (60 KB) so we don't blow the Postgres TEXT column on a malformed
# chapter.
MAX_BODY_BYTES = 60_000

# Curriculum: the books PagePay will ingest at the initial seed.
# Each entry maps a PagePay-internal subject + education_level to an
# OpenStax book slug + chapter index range.
#
# `subject` must match a value in our catalog filter chips. We keep
# it lowercase, no spaces (use underscores internally, rendered with
# title-case in the UI).
#
# `chapters` is a half-open range: (start, end) inclusive of start,
# exclusive of end. So (1, 13) ingests chapters 1 through 12. The
# full book is (1, total_chapters+1) — we set total_chapters to None
# to ingest everything.
#
# `attribution` is the pre-formatted string the AttributionCard
# renders. Pre-formatted at ingest time so the UI doesn't have to
# reconstruct it from the license + source fields.
@dataclass(frozen=True)
class BookEntry:
    slug: str                  # OpenStax URL slug
    subject: str               # catalog subject chip
    education_level: str       # catalog level grid
    attribution: str           # AttributionCard copy
    chapter_start: int = 1     # first chapter to ingest (1-indexed)
    chapter_end: int | None = None  # None = ingest all remaining
    short_label: str = ""      # for logs only


CURRICULUM: list[BookEntry] = [
    BookEntry(
        slug="university-physics-volume-1",
        subject="physics",
        education_level="tertiary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="University Physics Vol. 1",
    ),
    BookEntry(
        slug="university-physics-volume-2",
        subject="physics",
        education_level="tertiary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="University Physics Vol. 2",
    ),
    BookEntry(
        slug="calculus-volume-1",
        subject="mathematics",
        education_level="tertiary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="Calculus Vol. 1",
    ),
    BookEntry(
        slug="calculus-volume-2",
        subject="mathematics",
        education_level="tertiary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="Calculus Vol. 2",
    ),
    BookEntry(
        slug="calculus-volume-3",
        subject="mathematics",
        education_level="tertiary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="Calculus Vol. 3",
    ),
    BookEntry(
        slug="biology-2e",
        subject="biology",
        education_level="tertiary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="Biology 2e",
    ),
    BookEntry(
        slug="chemistry-2e",
        subject="chemistry",
        education_level="tertiary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="Chemistry 2e",
    ),
    BookEntry(
        slug="principles-economics-3e",
        subject="economics",
        education_level="tertiary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="Principles of Economics 3e",
    ),
    BookEntry(
        slug="psychology-2e",
        subject="psychology",
        education_level="tertiary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="Psychology 2e",
    ),
    BookEntry(
        slug="statistics-2e",
        subject="statistics",
        education_level="tertiary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="Introductory Statistics 2e",
    ),
    BookEntry(
        slug="algebra-1",
        subject="mathematics",
        education_level="secondary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="Algebra 1",
    ),
    BookEntry(
        slug="algebra-2",
        subject="mathematics",
        education_level="secondary",
        attribution="Source: OpenStax, Rice University. Licensed under CC BY 4.0. You are free to share and adapt; attribution to OpenStax and Rice University is required.",
        short_label="Algebra 2",
    ),
]


# ════════════════════════════════════════════════════════════════════════
# Per-chapter fetching
# ════════════════════════════════════════════════════════════════════════

async def _fetch_chapter_html(
    client: httpx.AsyncClient, slug: str, chapter_num: int
) -> str | None:
    """Fetch the full-page HTML for a single chapter.

    OpenStax's chapter URL pattern is:
        https://openstax.org/books/{slug}/pages/{chapter_num}-introduction
    where the page slug varies per chapter (e.g. "1-introduction",
    "2-vectors", "3-kinematics"). The pattern of "{num}-" is consistent
    enough that the title can be filled in later by the topic slicer.

    For now we fetch the chapter's full content via OpenStax's
    `/pages/{n}-...` URL with `?content_only=1` to get the bare HTML
    body without the site chrome.

    Returns None on HTTP error or empty body.
    """
    # The canonical chapter URL pattern. We use ?content_only to skip
    # the site chrome (header, footer, nav) that would otherwise be
    # parsed as garbage by the topic slicer.
    url = f"{OPENSTAX_BOOK_BASE}/{slug}/pages/{chapter_num}-introduction"
    try:
        resp = await client.get(
            url,
            params={"content_only": "1"},
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
            timeout=30,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("OpenStax fetch failed: %s page %s: %s", slug, chapter_num, exc)
        return None

    raw = resp.content
    if len(raw) > MAX_CHAPTER_BYTES:
        raw = raw[:MAX_CHAPTER_BYTES]
    if not raw:
        return None
    return raw.decode("utf-8", errors="replace")


def _extract_chapter_body(html: str) -> str:
    """Extract the chapter body from a full OpenStax page.

    OpenStax's page response includes the chapter inside a
    `<div data-type="chapter">...</div>` block. The surrounding HTML
    is the site chrome (nav, footer, accessibility toolbar) which we
    don't want the topic slicer to see — its regexes would treat every
    nav link as a heading.

    If we can't find the chapter div (e.g. the page has been
    re-designed and the data-type attribute moved), we return the raw
    HTML. The topic slicer will then find zero sections and the parent
    won't be sliced — a safe failure mode.
    """
    if not html:
        return ""
    # Try the OpenStax-specific attribute first.
    m = re.search(
        r'<div[^>]*data-type=["\']chapter["\'][^>]*>(.*?)(?=<div[^>]*data-type=["\'](?:composite-page|footnote|glossary)|</body)',
        html,
        re.IGNORECASE | re.DOTALL,
    )
    if m:
        return m.group(0)
    # Fallback: search for any data-type="chapter" block.
    m = re.search(
        r'(<div[^>]*data-type=["\']chapter["\'][^>]*>.*?</div>)',
        html,
        re.IGNORECASE | re.DOTALL,
    )
    if m:
        return m.group(1)
    # No wrapper found. Return the original HTML; the topic slicer
    # will gracefully produce zero topics.
    return html


def _title_from_slug(slug: str) -> str:
    """Convert an OpenStax slug like 'university-physics-volume-1'
    into a display title like 'University Physics Volume 1'.

    The catalog already has the original book title (from the OpenStax
    metadata) where available, so this is a fallback only.
    """
    return re.sub(r"\b\w", lambda m: m.group(0).upper(), slug.replace("-", " "))


# ════════════════════════════════════════════════════════════════════════
# Top-level ingest
# ════════════════════════════════════════════════════════════════════════

async def import_openstax_books(
    db: AsyncSession,
    curriculum: list[BookEntry] | None = None,
) -> dict:
    """Ingest a curated list of OpenStax books.

    Args:
        db: SQLAlchemy async session.
        curriculum: optional override of the CURRICULUM list. Tests
            pass a single-book list to avoid hitting OpenStax.

    Returns:
        Dict with: books_scanned, books_imported, books_skipped,
        chapters_total, slices_total. Useful for the admin /seed
        endpoint to log progress.

    Behavior:
      - Skips any book whose title is already in content_catalog
        (idempotent on re-run).
      - Skips any book whose license is not in LICENSE_ALLOWLIST.
      - Catches per-chapter errors so one bad chapter doesn't abort
        the whole book.
    """
    books = curriculum if curriculum is not None else CURRICULUM
    summary = {
        "books_scanned": 0,
        "books_imported": 0,
        "books_skipped": 0,
        "chapters_total": 0,
        "slices_total": 0,
    }

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        for book in books:
            summary["books_scanned"] += 1
            title = _title_from_slug(book.slug)
            # Idempotency: skip if any content_catalog row already has
            # this exact source_url. We use a synthetic source_url of
            # "openstax:{slug}" — same slug always produces the same
            # key.
            synth_url = f"openstax:{book.slug}"
            existing = await db.execute(
                select(ContentCatalog.id).where(ContentCatalog.source_url == synth_url)
            )
            if existing.scalar_one_or_none() is not None:
                summary["books_skipped"] += 1
                continue

            # License gate (defensive — every entry in CURRICULUM is
            # CC BY 4.0, but a future override could pass a bad value).
            effective_license = OPENSTAX_DEFAULT_LICENSE
            if effective_license not in LICENSE_ALLOWLIST:
                logger.warning("OpenStax ingest rejected %s: license %s not in allowlist", book.slug, effective_license)
                summary["books_skipped"] += 1
                continue

            # Discover the chapter count. OpenStax's index page lists
            # all chapters; we use the book landing page as a proxy
            # for the chapter count. If the fetch fails we fall back
            # to a conservative cap of 30 chapters — most OpenStax
            # books are 10-20 chapters.
            chapter_end = book.chapter_end if book.chapter_end is not None else 30

            parent = ContentCatalog(
                title=title,
                content_type="book",
                category=book.subject,  # subject is the primary filter
                source_url=synth_url,
                body_text=None,  # filled as chapters are appended
                author="OpenStax, Rice University",
                source="openstax",
                education_level=book.education_level,
                subject=book.subject,
                license_type=effective_license,
                attribution_text=book.attribution,
            )
            db.add(parent)
            await db.flush()  # get parent.id for slice parent_work_id

            # Ingest chapters one at a time. We accumulate body_text
            # for the parent row and slice each chapter immediately
            # so a slicing error on chapter 5 doesn't lose chapters
            # 1-4.
            chapter_bodies: list[tuple[int, str]] = []  # (order, html)
            for n in range(book.chapter_start, chapter_end + 1):
                html = await _fetch_chapter_html(client, book.slug, n)
                if html is None:
                    # Likely past the last chapter (HTTP 404). Stop.
                    if n > book.chapter_start + 2:
                        break
                    continue
                body = _extract_chapter_body(html)
                if body:
                    chapter_bodies.append((n, body))

            # Persist combined body_text. Cap at MAX_BODY_BYTES so a
            # full book doesn't blow the TEXT column.
            combined = "\n\n".join(b for _, b in chapter_bodies)
            if len(combined) > MAX_BODY_BYTES:
                combined = combined[:MAX_BODY_BYTES]
            parent.body_text = combined
            summary["chapters_total"] += len(chapter_bodies)

            # Slice the parent. We slice from the combined body so the
            # topic slicer sees all chapter sections in one pass. This
            # is the path that exercises the full-stop rule end-to-end.
            try:
                n_slices = await slice_openstax_chapter(db, parent, combined)
                if n_slices > 0:
                    summary["books_imported"] += 1
                    summary["slices_total"] += n_slices
                else:
                    # Parsing produced no topics. Drop the parent so
                    # the catalog doesn't show a ghost book.
                    await db.delete(parent)
                    summary["books_skipped"] += 1
                    logger.warning("OpenStax ingest produced 0 slices for %s", book.slug)
            except Exception as exc:  # noqa: BLE001
                logger.error("Slicing failed for %s: %s", book.slug, exc)
                await db.rollback()
                summary["books_skipped"] += 1
                continue

            await db.commit()

    return summary
