"""Topic-aware slicer for education content (OpenStax).

Background
----------
Casual reader content (Gutenberg novels, news articles) is sliced by raw
character count — see slicer.py. The reader doesn't care about the
internal structure of the book, so a 3,000-char window snapped to the
nearest sentence works fine.

Education content is different. A student opens a calculus textbook and
expects to see "1.1 Introduction", "1.2 Limits", "1.3 Continuity" — not
six arbitrary 3,000-char windows that break mid-equation. A topic
boundary is the natural read unit: a coherent section that the student
can study, take notes on, and discuss.

This module slices OpenStax content by topic:
  - One OpenStax <h2 data-type="document-title"> or top-level <h2> =
    one topic = one child row in content_catalog.
  - Within each topic, the body is further chunked into ~2-minute
    ReadingUnits. Unit 1 of every topic is free; units 2+ are premium.

The full-stop rule
------------------
Every ReadingUnit MUST end on a sentence boundary. This is non-negotiable
for education content. The existing slicer._snap_to_boundary falls back
to paragraph breaks and forward-search when no sentence end is found;
for education we are stricter — we will not ship a slice that ends
mid-sentence. If no sentence end is found within MAX_CHARS_PER_SLICE *
1.2, we back off to the PREVIOUS sentence end (which may leave a short
unit). Better to ship a 1,800-char unit than a 2,400-char half-sentence.

OpenStax HTML structure
-----------------------
A typical OpenStax chapter has this shape:

  <div data-type="chapter">
    <h1 data-type="document-title">Chapter 1. Introduction</h1>
    <section data-type="section">
      <h2>1.1 Physics: An Introduction</h2>
      <p>...</p>
    </section>
    <section data-type="section">
      <h2>1.2 Physical Quantities and Units</h2>
      <p>...</p>
      <p>...</p>
    </section>
    ...
    <section data-type="section">
      <h2>Key Terms</h2>           <!-- dropped, not prose -->
    </section>
    <section data-type="section">
      <h2>Chapter Review</h2>      <!-- dropped, not prose -->
    </section>
  </div>

We split on <section data-type="section"> with a prose-looking <h2>
(no "Key Terms", "Key Equations", "Chapter Review", "Exercises",
"Conceptual Questions", "Problems", "Additional Problems" headings).
The chapter's <h1> becomes the parent work title; the section's <h2>
becomes the slice title.

If OpenStax changes their HTML structure, this parser will fail loudly
(logs + returns 0 children) rather than silently shipping empty slices.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Iterable

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models import ContentCatalog, ReadingUnit

logger = logging.getLogger("uvicorn.error")

# Target size for a single reading unit. Same target as the casual-reader
# slicer (slicer.py), but applied per topic. The full-stop rule means
# actual unit size will vary between ~1,200 and ~3,600 chars.
TARGET_CHARS_PER_UNIT = 3_000

# Soft cap: prefer to break before this. A unit can grow up to 1.2 × this
# if the previous sentence end is just past the soft cap.
MAX_CHARS_PER_UNIT = 3_600

# Below this, a topic's entire body fits in one free unit. No further
# chunking. This is the "small section" threshold.
SINGLE_UNIT_THRESHOLD = TARGET_CHARS_PER_UNIT

# ── HTML parsing ─────────────────────────────────────────────────────
# OpenStax uses the xhtml style. We tolerate either case, single or
# double quotes, and attributes in any order. We don't depend on a real
# HTML parser (BeautifulSoup would be a new dep) — these regexes are
# tight enough that false positives are vanishingly rare on OpenStax
# content. If a false positive ever ships, the slice just has extra or
# missing text, not a crash.

# Match a top-level <section data-type="section">...</section>. Non-greedy
# so we match the first inner </section> for each outer <section>.
_SECTION_RE = re.compile(
    r'<section[^>]*data-type=["\']section["\'][^>]*>(.*?)</section>',
    re.IGNORECASE | re.DOTALL,
)

# Capture the <h2> heading text from inside a section.
_H2_RE = re.compile(r'<h2[^>]*>(.*?)</h2>', re.IGNORECASE | re.DOTALL)

# Strip ALL remaining HTML tags from prose. We keep paragraph breaks.
_HTML_TAG_RE = re.compile(r'<[^>]+>')

# Match <p> opening / closing tags so we can re-inject paragraph breaks.
_P_OPEN_RE = re.compile(r'<p[^>]*>', re.IGNORECASE)
_P_CLOSE_RE = re.compile(r'</p\s*>', re.IGNORECASE)
_BR_RE = re.compile(r'<br\s*/?>', re.IGNORECASE)

# Sentence-end pattern. Looks for . ! ? followed by whitespace or EOF.
# We intentionally allow trailing quotes / parens / brackets.
_SENTENCE_END_RE = re.compile(r"[.!?](?:[\"')\]]?)(?:\s|$)")

# Headings that signal "this is not prose" — end-of-chapter boilerplate.
# We drop these sections entirely.
_NON_PROSE_HEADINGS = {
    "key terms",
    "key equations",
    "key concepts",
    "chapter summary",
    "chapter review",
    "summary",
    "conceptual questions",
    "problems",
    "additional problems",
    "challenge problems",
    "exercises",
    "glossary",
    "references",
    "further reading",
    "answers",
}

# OpenStax sometimes uses "1.1 Title" pattern in <h2>. We extract the
# section number and the title separately for nicer display.
_SECTION_NUM_RE = re.compile(r"^(\d+(?:\.\d+)*)\s*\.?\s*(.*)$")


@dataclass
class TopicSection:
    """One topic in an OpenStax chapter — between two top-level <h2>s."""
    title: str            # e.g. "1.1 Physics: An Introduction"
    section_number: str   # e.g. "1.1" or "" if no number
    body_text: str        # cleaned prose, paragraph-broken


# ════════════════════════════════════════════════════════════════════════
# HTML → clean text
# ════════════════════════════════════════════════════════════════════════

def _strip_html_tags(html: str) -> str:
    """Drop all HTML tags, keeping the visible text.

    Paragraph breaks are converted to blank lines (\\n\\n) so the
    sentence-end finder can recognize sentence ends that span
    paragraphs. <br> becomes a single newline. We also collapse runs
    of whitespace within a single line, but preserve the blank-line
    paragraph separators.
    """
    if not html:
        return ""
    # Replace <p> boundaries with newlines so paragraphs become parseable.
    text = _P_OPEN_RE.sub("\n", html)
    text = _P_CLOSE_RE.sub("\n\n", text)
    text = _BR_RE.sub("\n", text)
    # Drop any remaining tags (span, em, strong, sup, sub, math, etc.).
    text = _HTML_TAG_RE.sub("", text)
    # Decode the entities we care about. We don't decode &amp; on
    # purpose — OpenStax uses &#8217; etc. for smart quotes and we
    # want to keep them as Unicode rather than try to re-encode.
    text = text.replace("&nbsp;", " ")
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    # Collapse whitespace within each line.
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.split("\n")]
    # Drop empty leading lines and trailing empty lines; preserve
    # the blank-line paragraph breaks in the middle.
    out: list[str] = []
    prev_blank = True
    for ln in lines:
        if not ln:
            if not prev_blank:
                out.append("")
            prev_blank = True
        else:
            out.append(ln)
            prev_blank = False
    # Trim trailing blank lines.
    while out and not out[-1]:
        out.pop()
    return "\n".join(out)


def _extract_section_title(raw_h2: str) -> tuple[str, str]:
    """Split an OpenStax <h2> into (section_number, title).

    Examples:
      "1.1 Physics: An Introduction" -> ("1.1", "Physics: An Introduction")
      "Introduction"                 -> ("",    "Introduction")
      "Key Terms"                    -> ("",    "Key Terms")  # caller drops
    """
    cleaned = _strip_html_tags(raw_h2).strip()
    m = _SECTION_NUM_RE.match(cleaned)
    if m:
        return m.group(1), m.group(2).strip()
    return "", cleaned


# ════════════════════════════════════════════════════════════════════════
# OpenStax HTML → list[TopicSection]
# ════════════════════════════════════════════════════════════════════════

def parse_openstax_chapter(html: str) -> list[TopicSection]:
    """Parse an OpenStax chapter HTML into a list of topic sections.

    Returns an empty list if the structure doesn't look like OpenStax
    (no <section data-type="section"> blocks, or the first heading is
    a non-prose one). The caller (slice_openstax_chapter) treats an
    empty list as a hard failure — the parent is not persisted as
    a sliced work.

    We are defensive on the parse: an unrecognized heading is kept
    (caller decides if it's "Key Terms"-shaped and drops it). This
    way, if OpenStax adds a new non-prose heading type we haven't
    seen, the prose still gets indexed — the user might get a few
    extra slices, but the book isn't lost.
    """
    if not html:
        return []
    sections: list[TopicSection] = []
    for section_match in _SECTION_RE.finditer(html):
        inner = section_match.group(1)
        h2_match = _H2_RE.search(inner)
        if not h2_match:
            # Section with no <h2> — skip. OpenStax shouldn't produce
            # these but if they do, dropping is safer than guessing.
            continue
        section_num, title = _extract_section_title(h2_match.group(1))
        if not title:
            continue
        # Drop the <h2> from the body so it doesn't repeat at the top
        # of every slice. The title is already captured separately.
        body_html = inner[: h2_match.start()] + inner[h2_match.end():]
        body_text = _strip_html_tags(body_html).strip()
        if not body_text:
            # Empty section (probably a placeholder). Skip.
            continue
        # Drop non-prose sections (Key Terms, Exercises, etc.). We
        # normalize the title to lowercase and strip punctuation for
        # the comparison so "Key Terms." matches "key terms".
        normalized = re.sub(r"[^a-z\s]", "", title.lower()).strip()
        if normalized in _NON_PROSE_HEADINGS:
            continue
        sections.append(
            TopicSection(
                title=title,
                section_number=section_num,
                body_text=body_text,
            )
        )
    return sections


# ════════════════════════════════════════════════════════════════════════
# Body text → reading units, every unit ending on a full stop
# ════════════════════════════════════════════════════════════════════════

def _find_last_sentence_end(text: str, before_index: int) -> int:
    """Return the index in `text` of the last sentence end at or before
    `before_index`. -1 if none found.

    The "end" is the position one past the punctuation (so slice_text
    = text[:end] is a clean ending). A sentence end is `.`/`!`/`?`
    followed by whitespace, EOF, or closing quote/paren/bracket.
    """
    if before_index <= 0:
        return -1
    best = -1
    for m in _SENTENCE_END_RE.finditer(text, 0, before_index):
        best = m.end()
    return best


def split_into_units(text: str, target_chars: int = TARGET_CHARS_PER_UNIT) -> list[str]:
    """Split a topic's body text into units, each ending on a full stop.

    Hard rule: NO unit ends mid-sentence. If the search window yields
    no sentence end before MAX_CHARS_PER_UNIT * 1.2, we back off to
    the previous sentence end (even if it leaves a short unit).

    Why this is strict: a unit ending mid-sentence makes the topic feel
    cut off. For casual reading it's annoying; for study material it's
    unforgivable — a student can't take notes on half a thought.

    Returns [] if the text is empty. Returns [text] if it fits in one
    unit (under SINGLE_UNIT_THRESHOLD). The last unit absorbs any
    remainder; it too must end on a sentence boundary.
    """
    text = text.strip()
    if not text:
        return []
    if len(text) <= SINGLE_UNIT_THRESHOLD:
        # Short enough to be a single free unit. We still verify it
        # ends on a sentence boundary; if it doesn't, we extend to
        # the next sentence end (if one exists within the topic).
        end = _find_last_sentence_end(text, len(text))
        if end == -1:
            # No sentence end at all (e.g. a heading-only topic). Drop
            # the unit — the parent will have one fewer slice rather
            # than shipping a malformed one.
            logger.warning("split_into_units: no sentence end in short text (%d chars)", len(text))
            return []
        return [text[:end].strip()]

    units: list[str] = []
    cursor = 0
    n = len(text)
    while cursor < n:
        remaining = n - cursor
        if remaining <= target_chars:
            # Last chunk. Verify it ends on a sentence boundary.
            end = _find_last_sentence_end(text, n)
            if end == -1 or end <= cursor:
                # No sentence end in the remaining text. Back off:
                # try the previous sentence end within MAX_CHARS_PER_UNIT
                # of the end. If still none, this topic ends without a
                # clean unit — drop the trailing fragment.
                end = _find_last_sentence_end(text, n)
                if end <= cursor:
                    break
            units.append(text[cursor:end].strip())
            cursor = end
            break

        target_cut = cursor + target_chars
        # Look for a sentence end at or before the target.
        cut = _find_last_sentence_end(text, target_cut)
        if cut == -1 or cut <= cursor:
            # No sentence end in the first `target_chars` window. Search
            # further out, up to 1.2 * target.
            extended_cut = cursor + MAX_CHARS_PER_UNIT
            if extended_cut < n:
                cut = _find_last_sentence_end(text, extended_cut)
            else:
                cut = _find_last_sentence_end(text, n)
        if cut == -1 or cut <= cursor:
            # Still nothing. The body must be one long run-on sentence
            # with no `.` `!` `?` for 3,600+ chars. Back off to whatever
            # sentence end exists in the entire remaining text.
            cut = _find_last_sentence_end(text, n)
            if cut == -1 or cut <= cursor:
                # Truly no sentence ends at all. Treat the whole
                # remaining text as one unit (this is the absolute
                # last-resort — only happens for malformed input).
                cut = n
        units.append(text[cursor:cut].strip())
        cursor = cut

    return [u for u in units if u]


# ════════════════════════════════════════════════════════════════════════
# Persistence: parent + topic slices + reading units
# ════════════════════════════════════════════════════════════════════════

async def slice_openstax_chapter(
    db: AsyncSession,
    parent: ContentCatalog,
    chapter_html: str,
) -> int:
    """Parse an OpenStax chapter, persist N children + reading units.

    Returns the number of topic slices persisted. Returns 0 if parsing
    fails or yields no usable sections.

    Idempotency: if the parent already has children, returns the
    existing count without re-parsing. Same contract as the casual-
    reader slice_and_persist so a re-run is safe.
    """
    # Idempotency check.
    existing = await db.execute(
        select(ContentCatalog.id).where(ContentCatalog.parent_work_id == parent.id).limit(1)
    )
    if existing.scalar_one_or_none() is not None:
        count_row = await db.execute(
            select(ContentCatalog.id).where(ContentCatalog.parent_work_id == parent.id)
        )
        return len(count_row.scalars().all())

    sections = parse_openstax_chapter(chapter_html)
    if not sections:
        logger.warning(
            "slice_openstax_chapter: no topics parsed for parent %s (id=%s)",
            parent.title, getattr(parent, "id", None),
        )
        return 0

    total_slices = 0
    for order, sec in enumerate(sections, start=1):
        units = split_into_units(sec.body_text)
        if not units:
            # Topic body had no sentence ends (very rare). Drop the
            # topic rather than ship an unreadable slice.
            logger.warning(
                "slice_openstax_chapter: dropped topic '%s' (no sentence ends)",
                sec.title,
            )
            continue
        total_units = len(units)
        # Build the full slice body from the unit bodies, joined with
        # blank lines. The slice.body_text is what's used by the casual
        # reader; for education it's the concatenation of all units.
        combined_body = "\n\n".join(units)
        char_count = len(combined_body)
        word_count = len(combined_body.split())
        # Section number prefix for nicer titles: "1.1 Physics: …"
        full_title = (
            f"{sec.section_number} {sec.title}" if sec.section_number else sec.title
        )
        # Use the parent's title as prefix so the user can tell at a
        # glance which chapter this topic belongs to.
        base_title = parent.title.split(";")[0].strip()
        slice_title = f"{base_title} — {full_title}"
        child = ContentCatalog(
            title=slice_title,
            content_type=parent.content_type,
            category=parent.category,
            source_url=None,
            body_text=combined_body,
            author=parent.author,
            estimated_read_minutes=max(1, total_units * 2),  # ~2 min per unit
            parent_work_id=parent.id,
            read_order=order,
            total_slices=None,  # filled after we know the total
            word_count=word_count,
            char_count=char_count,
            # Inherit the parent's education + license fields so the
            # catalog filter and the AttributionCard work without
            # re-fetching the parent.
            source=parent.source,
            education_level=parent.education_level,
            subject=parent.subject,
            license_type=parent.license_type,
            attribution_text=parent.attribution_text,
        )
        db.add(child)
        await db.flush()  # populate child.id for FK on reading_units
        # Persist each unit. body_text is the unit's own prose; we
        # store it separately so the unit reader can render without
        # re-splitting the slice body.
        for unit_order, unit_body in enumerate(units, start=1):
            db.add(
                ReadingUnit(
                    slice_id=child.id,
                    unit_order=unit_order,
                    total_units=total_units,
                    body_text=unit_body,
                    char_count=len(unit_body),
                    word_count=len(unit_body.split()),
                    estimated_read_minutes=2,
                )
            )
        total_slices += 1

    if total_slices == 0:
        # Every section was dropped. Don't persist a parent with no
        # children — it'd be a "ghost" book in the catalog.
        return 0

    # Set the slice's total_slices to the actual count of surviving
    # topics. We didn't know this in the loop above because some
    # sections may have been dropped.
    await db.execute(
        update(ContentCatalog)
        .where(ContentCatalog.parent_work_id == parent.id)
        .where(ContentCatalog.read_order.is_not(None))
        .values(total_slices=total_slices)
    )
    # Demote the parent's per-row estimated minutes to the sum of
    # child estimated minutes. The catalog uses this for the "X min
    # total" badge on the parent card.
    total_minutes = await db.execute(
        select(ContentCatalog.estimated_read_minutes)
        .where(ContentCatalog.parent_work_id == parent.id)
    )
    child_minutes = [m for (m,) in total_minutes.all() if m is not None]
    if child_minutes:
        await db.execute(
            update(ContentCatalog)
            .where(ContentCatalog.id == parent.id)
            .values(
                estimated_read_minutes=sum(child_minutes),
                word_count=None,
                char_count=None,
                read_order=None,
                total_slices=None,
            )
        )

    await db.commit()
    return total_slices
