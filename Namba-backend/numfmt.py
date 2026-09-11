"""Value parsing: a raw display string -> (format, sort_key)."""
import re

FORMATS = ("INTEGER", "DECIMAL", "MIXED", "TIME", "CALENDAR", "ABBR")

_TIME_AMPM = re.compile(r"^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]$")
_TIME_24 = re.compile(r"^(\d{1,2}):(\d{2})$")
_INT = re.compile(r"^\d+$")
_DEC = re.compile(r"^\d+\.\d+$")
# A date with no year, zero-padded: 12-25, 04-01, 02-29. Strict about the
# padding, because nothing here may fold `1-5` into `01-05` -- a value is
# stored as it was typed (ADR-0005), so refusing the other spellings is the
# only way left to keep one date at one address. February gets 29 days: a leap
# day is a fixed date, and there is no year here for it to disagree with.
#
# `[0-9]` and not `\d`, which in a Python str pattern is every Unicode decimal
# numeral: `١٢-٢٥` and `１２-２５` would both read as December 25 and both be
# stored as typed, which is three addresses for one day. The other formats can
# take `\d` because two spellings of a number are two entries by design
# (ADR-0005); this one promised the opposite. The front end's own regex is
# ASCII by the language's default, so this is also what keeps the two agreeing.
_DATE = re.compile(r"^([0-9]{2})-([0-9]{2})$")
_MONTH_DAYS = (31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
# What parse_number will *guess* is an abbreviation: letters, and the
# punctuation one carries inside it -- R&D, Ph.D, X-ray, I/O, TL;DR. No digits,
# because "3M" and "G7" are a number doing the same work as a word and which
# of the two they are is the poster's call, not a regex's.
_ABBR = re.compile(r"^[A-Za-z][A-Za-z.&/;-]*$")
# What may be *stored* as one, which is a different question and a looser
# answer. This section is Latin script only -- 유에프오 and УФО are the same
# abbreviation written in another alphabet, and one /a/ page per alphabet is
# the split the one-spelling rule exists to avoid. Digits are allowed here
# and not above: MP3, Y2K and COVID-19 are English abbreviations the parser
# will never guess at, and refusing what a poster explicitly picked would be
# the gate deciding something it was not asked to.
_ABBR_OK = re.compile(r"^(?=.*[A-Za-z])[A-Za-z0-9.&/;-]+$")
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

    The public API has no login, so this is the whole of the rule: `ABBR` is
    a claim about what the value *is* rather than a way of reading one, and
    without this any string at all could be filed under /a/. Latin letters, digits and the
    punctuation an abbreviation carries, and at least one letter -- "42" is a
    number however it is filed.
    """
    return bool(_ABBR_OK.match((value or "").strip()))


def date_key(value):
    """month * 100 + day for a fixed calendar date, or None if it is not one.

    The check and the sort key are one question, so one function answers both:
    a value this cannot read is not a date, and `resolve_format` is where that
    becomes the 422. CALENDAR is one of the five formats that are checked
    rather than believed -- like ABBR it is a claim *about* the value and not
    a way of reading one, and on a wiki with no login the claim is a
    stranger's.

    1225 rather than a day of the year, because a band here is a month and the
    month has to come back out of the key (see bucket_of). Either sorts.
    """
    m = _DATE.match((value or "").strip())
    if not m:
        return None
    month, day = int(m.group(1)), int(m.group(2))
    if not 1 <= month <= 12 or not 1 <= day <= _MONTH_DAYS[month - 1]:
        return None
    return float(month * 100 + day)


def bucket_of(sort_key, fmt="INTEGER", value=None):
    """Band that sections an index: magnitude for the Integer one -- 1 / 10 /
    100 / 1000 / 10000+ -- first letter for the Abbreviation one, A to W, then
    X-Z together, then 0-9 last for the MP3s and 3Ms, and the month for the
    Calendar one.

    Nothing else gets one. A TIME sort_key is minutes past midnight, so banding
    it by magnitude would put 09:41 in the "100" band, which means nothing, and
    Decimal and Mixed sort by string and read as one list. An abbreviation has
    no sort key, so its band comes off the value: the first letter or digit in
    it, so that .NET files under N and not under a punctuation mark. A date has
    one, and the month is the top of it.
    """
    if fmt == "ABBR":
        m = re.search(r"[A-Za-z0-9]", value or "")
        if not m:
            return None
        c = m.group().upper()
        return "0-9" if c.isdigit() else "X-Z" if c >= "X" else c
    if fmt == "CALENDAR":
        # the month back out of the key, two digits so that no label of this
        # band collides with the Integer one's "1" and "10" -- the sync test
        # compares every label this function can return against api.ts, as a
        # set, and one shared label would let a real gap pass
        return f"{int(sort_key) // 100:02d}" if sort_key else None
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
