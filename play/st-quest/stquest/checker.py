"""
checker.py -- Structured Text answer validation for ST-Quest.

We can't run a real PLC scan here, so instead of executing code we validate the
learner's Structured Text against a set of declarative *checks* defined per
lesson. Each check inspects a normalized version of the submitted code and
returns pass/fail with targeted feedback.

Supported check types (see lessons/*.json):
    - contains        : a regex that MUST be found (case-insensitive by default)
    - not_contains    : a regex that must NOT be found
    - line_equals     : after normalization, one line must equal this exactly
    - normalized_equals: the whole answer, normalized, must equal target

Normalization mirrors how a PLC compiler treats source: it strips comments,
collapses whitespace, and is case-insensitive for keywords/identifiers (both
Studio 5000 and TIA Portal SCL are case-insensitive for language keywords).
"""

from __future__ import annotations

import re
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------

_BLOCK_COMMENT = re.compile(r"\(\*.*?\*\)", re.DOTALL)   # (* ... *)  IEC block comment
_LINE_COMMENT = re.compile(r"//[^\n]*")                   # // ...     line comment


def strip_comments(code: str) -> str:
    """Remove IEC 61131-3 comments: (* block *) and // line."""
    code = _BLOCK_COMMENT.sub(" ", code)
    code = _LINE_COMMENT.sub(" ", code)
    return code


def normalize(code: str) -> str:
    """
    Collapse code to a canonical form for forgiving comparison:
    comments removed, runs of whitespace collapsed to single spaces,
    spaces around common operators tidied, lowercased.
    """
    code = strip_comments(code)
    code = code.lower()
    # tidy space around operators/punctuation so `x:=1` == `x := 1`
    code = re.sub(r"\s*(:=|>=|<=|<>|[=<>+\-*/();,:])\s*", r" \1 ", code)
    code = re.sub(r"\s+", " ", code)
    return code.strip()


def normalize_line(line: str) -> str:
    return normalize(line)


# ---------------------------------------------------------------------------
# Check execution
# ---------------------------------------------------------------------------

@dataclass
class CheckResult:
    passed: bool
    message: str        # shown to the learner
    hint: str | None = None


def _run_single(check: dict, raw: str, norm: str) -> CheckResult:
    ctype = check.get("type", "contains")
    flags = 0 if check.get("case_sensitive") else re.IGNORECASE
    hint = check.get("hint")
    label = check.get("message", ctype)

    if ctype == "contains":
        pat = check["pattern"]
        # search the normalized form so whitespace differences don't matter
        target = norm if check.get("normalized", True) else raw
        ok = re.search(pat, target, flags) is not None
        return CheckResult(ok, label, None if ok else hint)

    if ctype == "not_contains":
        pat = check["pattern"]
        target = norm if check.get("normalized", True) else raw
        ok = re.search(pat, target, flags) is None
        return CheckResult(ok, label, None if ok else hint)

    if ctype == "line_equals":
        want = normalize_line(check["pattern"])
        lines = [normalize_line(l) for l in raw.splitlines() if l.strip()]
        ok = want in lines
        return CheckResult(ok, label, None if ok else hint)

    if ctype == "normalized_equals":
        want = normalize(check["pattern"])
        ok = norm == want
        return CheckResult(ok, label, None if ok else hint)

    if ctype == "simulate":
        # Execute the learner's code across steps and assert on outputs.
        from .interpreter import run_steps, STError
        try:
            ok, detail = run_steps(raw, check.get("steps", []))
        except STError as e:
            return CheckResult(False, label, hint or f"ST error while running: {e}")
        except Exception as e:  # noqa: BLE001 - surface any interpreter issue as a hint
            return CheckResult(False, label, hint or f"couldn't run your code: {e}")
        return CheckResult(ok, label, None if ok else (hint or detail))

    if ctype == "call":
        from .interpreter import Interpreter, STError, _values_equal
        try:
            interp = Interpreter(raw); interp.scan()
            ok = True
            for case in check.get("cases", []):
                got = interp.call_function(case["fn"], case.get("args", []))
                if not _values_equal(got, case["expect"]):
                    ok = False; break
        except STError as e:
            return CheckResult(False, label, hint or f"ST error: {e}")
        except Exception as e:  # noqa: BLE001
            return CheckResult(False, label, hint or f"couldn't run your function: {e}")
        return CheckResult(ok, label, None if ok else hint)

    if ctype == "simulate_fb":
        from .interpreter import trace_fb, STError
        try:
            tr = trace_fb(raw, check["fb"], check.get("steps", []))
        except STError as e:
            return CheckResult(False, label, hint or f"ST error: {e}")
        except Exception as e:  # noqa: BLE001
            return CheckResult(False, label, hint or f"couldn't run your function block: {e}")
        ok = all(t["ok"] for t in tr)
        return CheckResult(ok, label, None if ok else hint)

    # Unknown check type -> fail loudly so lesson authors notice.
    return CheckResult(False, f"[lesson error] unknown check type '{ctype}'", None)


def check_answer(code: str, checks: list[dict]) -> list[CheckResult]:
    """Run every check for a lesson and return the ordered results."""
    norm = normalize(code)
    return [_run_single(c, code, norm) for c in checks]


def all_passed(results: list[CheckResult]) -> bool:
    return all(r.passed for r in results)
