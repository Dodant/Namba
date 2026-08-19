"""Number parsing: a raw display string -> (format, sort_key)."""
import re

FORMATS = ("INTEGER", "DECIMAL", "MIXED", "TIME")

_TIME_AMPM = re.compile(r"^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]$")
_TIME_24 = re.compile(r"^(\d{1,2}):(\d{2})$")
_INT = re.compile(r"^\d+$")
_DEC = re.compile(r"^\d+\.\d+$")
# 4+ digits, because "100" has no thousand to separate. The fraction is left
# alone: 3.14159 groups nothing after the point.
_GROUPABLE = re.compile(r"^(\d{4,})(\.\d+)?$")


def grouped_value(value, grouped):
    """The value as it should read on screen, given the poster's preference.

    Display only. The stored value never carries separators -- "1000" and
    "1,000" have to stay one number, or /n/1000 and /n/1%2C000 become two
    pages and a number stops being a column. Anything that is not a plain
    integer or decimal comes back untouched: there is no thousand in 10:04PM.
    """
    if not grouped:
        return value
    m = _GROUPABLE.match(value or "")
    return f"{int(m.group(1)):,}{m.group(2) or ''}" if m else value


def parse_number(s):
    """Suggest (format, sort_key) for a number string.

    A suggestion only -- the poster overrides it in the form. "11:11" is a
    clock time but "1:29:300" (Heinrich's law) is a ratio; no parser can tell
    those apart on its own, so the human gets the last word.

    sort_key is the value itself for INTEGER/DECIMAL, minutes-since-midnight
    for TIME, and None for MIXED (which sorts by string instead).
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
    return ("MIXED", None)


def bucket_of(sort_key, fmt="INTEGER"):
    """Magnitude band that sections the Integer index: 1 / 10 / 100 / 1000 / 10000+.

    Only integers get one. A TIME sort_key is minutes past midnight, so banding
    it by magnitude would put 09:41 in the "100" band, which means nothing.
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
