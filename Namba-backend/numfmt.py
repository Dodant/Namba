"""Value parsing: a raw display string -> (format, sort_key)."""
import re

FORMATS = ("INTEGER", "DECIMAL", "MIXED", "TIME", "ABBR")

_TIME_AMPM = re.compile(r"^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]$")
_TIME_24 = re.compile(r"^(\d{1,2}):(\d{2})$")
_INT = re.compile(r"^\d+$")
_DEC = re.compile(r"^\d+\.\d+$")
# What parse_number will *guess* is an abbreviation: letters, and the
# punctuation one carries inside it -- R&D, Ph.D, X-ray. No digits, because
# "3M" and "G7" are a number doing the same work as a word and which of the
# two they are is the poster's call, not a regex's.
_ABBR = re.compile(r"^[A-Za-z][A-Za-z.&-]*$")
# What may be *stored* as one, which is a different question and a looser
# answer. This section is Latin script only -- 유에프오 and УФО are the same
# abbreviation written in another alphabet, and one /a/ page per alphabet is
# the split the upper-casing rule exists to avoid. Digits are allowed here
# and not above: MP3, Y2K and COVID-19 are English abbreviations the parser
# will never guess at, and refusing what a poster explicitly picked would be
# the gate deciding something it was not asked to.
_ABBR_OK = re.compile(r"^(?=.*[A-Za-z])[A-Za-z0-9.&-]+$")
_LOCALIZABLE = re.compile(r"^(\d+)(?:\.(\d+))?$")

# Stored values use no grouping and a dot decimal. These are display/input
# punctuation only; a locale never becomes part of a number's identity.
_NUMBER_PUNCTUATION = {
    "en": (",", "."),
    "ko": (",", "."),
    "ja": (",", "."),
    "zh-hans": (",", "."),
    "es": (".", ","),
    "fr": ("\u202f", ","),
    "de": (".", ","),
}


def number_punctuation(locale="en"):
    """(group, decimal, accepted group marks) for a supported UI locale."""
    code = (locale or "en").lower()
    if code.startswith("zh"):
        code = "zh-hans"
    else:
        code = code.split("-", 1)[0]
    group, decimal = _NUMBER_PUNCTUATION.get(code, _NUMBER_PUNCTUATION["en"])
    # French text arrives with normal, no-break and narrow no-break spaces.
    accepted = (group, " ", "\u00a0", "\u202f") if code == "fr" else (group,)
    return group, decimal, tuple(dict.fromkeys(accepted))


def canonical_value(value, locale="en"):
    """Normalise one strictly grouped localized number without touching prose.

    Invalid grouping is returned verbatim: 1,2,3 and Apollo,11 are mixed
    notation/content, not malformed thousands separators we may delete.
    """
    raw = (value or "").strip()
    _, decimal, group_marks = number_punctuation(locale)
    decimal_parts = raw.split(decimal)
    if len(decimal_parts) > 2:
        return raw, False
    integer = decimal_parts[0]
    fraction = decimal_parts[1] if len(decimal_parts) == 2 else None
    if not integer or (fraction is not None and not fraction.isdigit()):
        return raw, False
    split = "[" + "".join(re.escape(mark) for mark in group_marks) + "]"
    groups = re.split(split, integer)
    grouped = len(groups) > 1
    valid = (
        groups[0].isdigit()
        and (not grouped or 1 <= len(groups[0]) <= 3)
        and all(part.isdigit() and len(part) == 3 for part in groups[1:])
    )
    if not valid:
        return raw, False
    canonical = "".join(groups) + (("." + fraction) if fraction is not None else "")
    return canonical, grouped


def grouped_value(value, grouped, locale="en"):
    """The value as it should read on screen, given the poster's preference.

    Display only. The stored value never carries separators -- "1000" and
    "1,000" have to stay one number, or /n/1000 and /n/1%2C000 become two
    pages and a number stops being a column. Anything that is not a plain
    integer or decimal comes back untouched: there is no thousand in 10:04PM.
    """
    m = _LOCALIZABLE.match(value or "")
    if not m:
        return value
    group, decimal, _ = number_punctuation(locale)
    integer = m.group(1)
    if grouped and len(integer) >= 4:
        integer = re.sub(r"(?<!^)(?=(\d{3})+$)", group, integer)
    return integer + ((decimal + m.group(2)) if m.group(2) is not None else "")


def parse_number(s):
    """Suggest (format, sort_key) for a number string.

    A suggestion only -- the poster overrides it in the form. "11:11" is a
    clock time but "1:29:300" (Heinrich's law) is a ratio; no parser can tell
    those apart on its own, so the human gets the last word.

    sort_key is the value itself for INTEGER/DECIMAL, minutes-since-midnight
    for TIME, and None for MIXED and ABBR (which sort by string instead).
    """
    s = (s or "").strip()
    if not s:
        return ("MIXED", None)

    m = _TIME_AMPM.match(s)
    if m:
        h, mi, ap = int(m.group(1)), int(m.group(2)), m.group(3).lower()
        if 1 <= h <= 12 and mi < 60:
            h = h % 12 + (12 if ap == "p" else 0)
            return ("TIME", float(h * 60 + mi))
        return ("MIXED", None)

    m = _TIME_24.match(s)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if h < 24 and mi < 60:
            return ("TIME", float(h * 60 + mi))
        return ("MIXED", None)

    if _INT.match(s):
        return ("INTEGER", float(s))
    if _DEC.match(s):
        return ("DECIMAL", float(s))
    if _ABBR.match(s):
        return ("ABBR", None)
    return ("MIXED", None)


def is_abbr(value):
    """Whether this may be filed as an abbreviation.

    The public API has no login, so this is the whole of the rule: a format
    the poster picks is otherwise taken at its word, and without this any
    string at all could be filed under /a/. Latin letters, digits and the
    punctuation an abbreviation carries, and at least one letter -- "42" is a
    number however it is filed.
    """
    return bool(_ABBR_OK.match((value or "").strip()))


def bucket_of(sort_key, fmt="INTEGER"):
    """Magnitude band that sections the Integer index: 1 / 10 / 100 / 1000 / 10000+.

    Only integers get one. A TIME sort_key is minutes past midnight, so banding
    it by magnitude would put 09:41 in the "100" band, which means nothing, and
    an ABBR has no sort key to band at all.
    """
    if sort_key is None or fmt != "INTEGER":
        return None
    v = abs(sort_key)
    if v < 10:
        return "1"
    if v < 100:
        return "10"
    if v < 1000:
        return "100"
    if v < 10000:
        return "1000"
    return "10000+"
