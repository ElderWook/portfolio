"""
interpreter.py -- a small IEC 61131-3 Structured Text interpreter.

This is NOT a full compiler. It supports the subset ST-Quest needs to actually
*execute* a learner's code and assert on outputs (a step beyond regex checks):

    - assignment            x := expr;
    - booleans / logic      AND OR XOR NOT, TRUE/FALSE
    - comparisons           =  <>  <  >  <=  >=
    - arithmetic            +  -  *  /  MOD
    - IF / ELSIF / ELSE / END_IF
    - CASE ... OF ... END_CASE   (integer labels, comma lists, a..b ranges)
    - FOR i := a TO b [BY s] DO ... END_FOR
    - WHILE ... DO ... END_WHILE
    - arrays                Data[i]           (0-based, like Studio 5000)
    - VAR ... END_VAR declaration blocks are parsed and skipped

Timers/function-blocks are intentionally out of scope (those lessons stay
regex-checked). Undeclared variables read as 0 / FALSE. Identifiers are
case-insensitive, matching both Studio 5000 and SCL.
"""

from __future__ import annotations
import re

# ---- reuse comment stripping semantics locally (avoid import cycle) ----
_BLOCK = re.compile(r"\(\*.*?\*\)", re.DOTALL)
_LINE  = re.compile(r"//[^\n]*")

def _strip_comments(s: str) -> str:
    return _LINE.sub(" ", _BLOCK.sub(" ", s))


class STError(Exception):
    pass


# --------------------------------------------------------------------------
# Tokenizer
# --------------------------------------------------------------------------
KEYWORDS = {"if","then","elsif","else","end_if","case","of","end_case",
            "for","to","by","do","end_for","while","end_while","repeat",
            "until","end_repeat","var","var_input","var_output","end_var","and","or","xor","not",
            "mod","true","false","function","end_function","function_block","end_function_block"}
# multi-char operators first
_OPS = [":=","<=",">=","<>","..","(",")","[","]",";",",",":",".","+","-",
        "*","/","<",">","="]

_TOKEN_RE = re.compile(r"""
    (?P<real>\d+\.\d+)
  | (?P<int>\d+)
  | (?P<id>[A-Za-z_][A-Za-z0-9_]*)
  | (?P<op>:=|<=|>=|<>|\.\.|[()\[\];,:.+\-*/<>=])
  | (?P<ws>\s+)
""", re.VERBOSE)


class Tok:
    __slots__ = ("kind","val")
    def __init__(self, kind, val): self.kind, self.val = kind, val
    def __repr__(self): return f"{self.kind}:{self.val}"


def tokenize(src: str):
    src = _strip_comments(src)
    toks, i, n = [], 0, len(src)
    while i < n:
        m = _TOKEN_RE.match(src, i)
        if not m:
            raise STError(f"Unexpected character {src[i]!r}")
        i = m.end()
        if m.lastgroup == "ws":
            continue
        if m.lastgroup == "real":
            toks.append(Tok("num", float(m.group())))
        elif m.lastgroup == "int":
            toks.append(Tok("num", int(m.group())))
        elif m.lastgroup == "id":
            low = m.group().lower()
            if low in KEYWORDS:
                toks.append(Tok(low, low))
            else:
                toks.append(Tok("id", m.group()))
        else:
            toks.append(Tok(m.group(), m.group()))
    toks.append(Tok("eof", None))
    return toks


# --------------------------------------------------------------------------
# Parser -> simple AST as nested tuples
# --------------------------------------------------------------------------
class Parser:
    def __init__(self, toks): self.toks, self.p = toks, 0
    def peek(self): return self.toks[self.p]
    def next(self): t = self.toks[self.p]; self.p += 1; return t
    def accept(self, kind):
        if self.toks[self.p].kind == kind:
            return self.next()
        return None
    def expect(self, kind):
        t = self.toks[self.p]
        if t.kind != kind:
            raise STError(f"Expected {kind!r} but found {t.kind!r} ({t.val!r})")
        return self.next()

    def parse_program(self):
        stmts = []
        while self.peek().kind != "eof":
            stmts.append(self.parse_statement())
        return ("block", stmts)

    def parse_block(self, terminators):
        stmts = []
        while self.peek().kind not in terminators:
            if self.peek().kind == "eof":
                raise STError("Unexpected end of input in block")
            stmts.append(self.parse_statement())
        return ("block", stmts)

    def parse_statement(self):
        k = self.peek().kind
        if k == "var":
            return self.parse_var()
        if k == "function":
            return self.parse_function()
        if k == "function_block":
            return self.parse_fb()
        if k == "if":
            return self.parse_if()
        if k == "case":
            return self.parse_case()
        if k == "for":
            return self.parse_for()
        if k == "while":
            return self.parse_while()
        if k == "id":
            return self.parse_assign()
        if k == ";":
            self.next(); return ("nop",)
        raise STError(f"Unexpected token {self.peek().val!r}")

    def parse_var(self):
        self.expect("var")
        # skip everything up to END_VAR (we don't need declared types to run)
        while self.peek().kind not in ("end_var","eof"):
            self.next()
        self.expect("end_var")
        self.accept(";")
        return ("nop",)

    def parse_function(self):
        self.expect("function")
        name = self.expect("id").val
        if self.accept(":"):
            self.next()  # return-type token (REAL/INT/...)
        inputs = []
        while self.peek().kind in ("var_input", "var_output", "var"):
            sect = self.next().kind
            while self.peek().kind not in ("end_var", "eof"):
                if sect == "var_input" and self.peek().kind == "id":
                    inputs.append(self.peek().val)
                    while self.peek().kind not in (";", "end_var", "eof"):
                        self.next()
                    self.accept(";")
                else:
                    self.next()
            self.expect("end_var"); self.accept(";")
        body = self.parse_block(("end_function",))
        self.expect("end_function"); self.accept(";")
        return ("funcdef", name, inputs, body)

    def parse_fb(self):
        self.expect("function_block")
        name = self.expect("id").val
        inputs, outputs = [], []
        while self.peek().kind in ("var_input", "var_output", "var"):
            sect = self.next().kind
            while self.peek().kind not in ("end_var", "eof"):
                if self.peek().kind == "id" and sect in ("var_input", "var_output"):
                    nm = self.peek().val
                    (inputs if sect == "var_input" else outputs).append(nm)
                    while self.peek().kind not in (";", "end_var", "eof"):
                        self.next()
                    self.accept(";")
                else:
                    self.next()
            self.expect("end_var"); self.accept(";")
        body = self.parse_block(("end_function_block",))
        self.expect("end_function_block"); self.accept(";")
        return ("fbdef", name, inputs, outputs, body)

    def parse_lvalue(self):
        name = self.expect("id").val
        idx = None
        if self.accept("["):
            idx = self.parse_expr()
            self.expect("]")
        return ("lval", name, idx)

    def parse_assign(self):
        lv = self.parse_lvalue()
        self.expect(":=")
        e = self.parse_expr()
        self.accept(";")
        return ("assign", lv, e)

    def parse_if(self):
        self.expect("if")
        cond = self.parse_expr()
        self.expect("then")
        body = self.parse_block(("elsif","else","end_if"))
        branches = [(cond, body)]
        while self.peek().kind == "elsif":
            self.next()
            c = self.parse_expr(); self.expect("then")
            b = self.parse_block(("elsif","else","end_if"))
            branches.append((c, b))
        els = None
        if self.accept("else"):
            els = self.parse_block(("end_if",))
        self.expect("end_if"); self.accept(";")
        return ("if", branches, els)

    def parse_case(self):
        self.expect("case")
        sel = self.parse_expr()
        self.expect("of")
        cases = []
        default = None
        while self.peek().kind not in ("end_case","else"):
            labels = self.parse_case_labels()
            self.expect(":")
            body = self.parse_block(("end_case","else","num"))
            # a label body ends when the next token starts a new label (num) at
            # top level OR reaches else/end_case; we approximate: parse until we
            # see a number-then-colon, else, or end_case.
            cases.append((labels, body))
        if self.accept("else"):
            default = self.parse_block(("end_case",))
        self.expect("end_case"); self.accept(";")
        return ("case", sel, cases, default)

    def parse_case_labels(self):
        labels = []
        while True:
            lo = self.expect("num").val
            if self.accept(".."):
                hi = self.expect("num").val
                labels.append((lo, hi))
            else:
                labels.append((lo, lo))
            if not self.accept(","):
                break
        return labels

    def parse_for(self):
        self.expect("for")
        var = self.expect("id").val
        self.expect(":=")
        start = self.parse_expr()
        self.expect("to")
        end = self.parse_expr()
        step = None
        if self.accept("by"):
            step = self.parse_expr()
        self.expect("do")
        body = self.parse_block(("end_for",))
        self.expect("end_for"); self.accept(";")
        return ("for", var, start, end, step, body)

    def parse_while(self):
        self.expect("while")
        cond = self.parse_expr()
        self.expect("do")
        body = self.parse_block(("end_while",))
        self.expect("end_while"); self.accept(";")
        return ("while", cond, body)

    # expression precedence: OR < XOR < AND < compare < add < mul < unary < primary
    def parse_expr(self): return self.parse_or()
    def _binleft(self, sub, ops):
        left = sub()
        while self.peek().kind in ops:
            op = self.next().kind
            right = sub()
            left = ("bin", op, left, right)
        return left
    def parse_or(self):  return self._binleft(self.parse_xor, ("or",))
    def parse_xor(self): return self._binleft(self.parse_and, ("xor",))
    def parse_and(self): return self._binleft(self.parse_cmp, ("and",))
    def parse_cmp(self): return self._binleft(self.parse_add, ("=","<>","<",">","<=",">="))
    def parse_add(self): return self._binleft(self.parse_mul, ("+","-"))
    def parse_mul(self): return self._binleft(self.parse_unary, ("*","/","mod"))
    def parse_unary(self):
        if self.peek().kind == "not":
            self.next(); return ("not", self.parse_unary())
        if self.peek().kind == "-":
            self.next(); return ("neg", self.parse_unary())
        return self.parse_primary()
    def parse_primary(self):
        t = self.peek()
        if t.kind == "num":
            self.next(); return ("num", t.val)
        if t.kind == "true":
            self.next(); return ("num", True)
        if t.kind == "false":
            self.next(); return ("num", False)
        if t.kind == "(":
            self.next(); e = self.parse_expr(); self.expect(")"); return e
        if t.kind == "id":
            name = self.next().val
            if self.accept("["):
                idx = self.parse_expr(); self.expect("]")
                return ("index", name, idx)
            if self.accept("("):
                args = []
                if self.peek().kind != ")":
                    args.append(self.parse_expr())
                    while self.accept(","):
                        args.append(self.parse_expr())
                self.expect(")")
                return ("call", name, args)
            return ("var", name)
        raise STError(f"Unexpected token in expression: {t.val!r}")


# --------------------------------------------------------------------------
# Evaluator
# --------------------------------------------------------------------------
class Env:
    def __init__(self): self.vars = {}
    def key(self, name): return name.lower()
    def get(self, name):
        return self.vars.get(self.key(name), 0)  # undeclared -> 0/FALSE
    def set(self, name, val): self.vars[self.key(name)] = val


class Interpreter:
    MAX_ITERS = 100000

    def __init__(self, src: str):
        self.ast = Parser(tokenize(src)).parse_program()
        self.env = Env()
        self._iters = 0
        self.functions = {}
        self.fbs = {}

    # public: apply a dict of inputs, run one scan of the whole program
    def set_inputs(self, inputs: dict):
        for k, v in inputs.items():
            if isinstance(v, list):
                self.env.set(k, list(v))
            else:
                self.env.set(k, v)

    def scan(self):
        self._iters = 0
        self.exec_block(self.ast)

    def get(self, name): return self.env.get(name)

    # ---- statement execution ----
    def exec_block(self, node):
        for st in node[1]:
            self.exec_stmt(st)

    def exec_stmt(self, node):
        self._iters += 1
        if self._iters > self.MAX_ITERS:
            raise STError("Execution limit exceeded (possible infinite loop)")
        tag = node[0]
        if tag == "nop":
            return
        if tag == "funcdef":
            self.functions[node[1].lower()] = (node[2], node[3]); return
        if tag == "fbdef":
            self.fbs[node[1].lower()] = (node[2], node[3], node[4]); return
        if tag == "assign":
            _, lv, expr = node
            val = self.eval(expr)
            _, name, idx = lv
            if idx is None:
                self.env.set(name, val)
            else:
                arr = self.env.get(name)
                if not isinstance(arr, list):
                    arr = []
                    self.env.set(name, arr)
                i = int(self.eval(idx))
                while len(arr) <= i:
                    arr.append(0)
                arr[i] = val
            return
        if tag == "if":
            _, branches, els = node
            for cond, body in branches:
                if self._truth(self.eval(cond)):
                    self.exec_block(body); return
            if els is not None:
                self.exec_block(els)
            return
        if tag == "case":
            _, sel, cases, default = node
            v = self.eval(sel)
            for labels, body in cases:
                for lo, hi in labels:
                    if lo <= v <= hi:
                        self.exec_block(body); return
            if default is not None:
                self.exec_block(default)
            return
        if tag == "for":
            _, var, start, end, step, body = node
            i = self.eval(start); e = self.eval(end)
            s = self.eval(step) if step is not None else 1
            if s == 0:
                raise STError("FOR step of 0")
            self.env.set(var, i)
            while (s > 0 and self.env.get(var) <= e) or (s < 0 and self.env.get(var) >= e):
                self.exec_block(body)
                self.env.set(var, self.env.get(var) + s)
            return
        if tag == "while":
            _, cond, body = node
            while self._truth(self.eval(cond)):
                self.exec_block(body)
                self._iters += 1
                if self._iters > self.MAX_ITERS:
                    raise STError("Execution limit exceeded (possible infinite loop)")
            return
        raise STError(f"Unknown statement {tag}")

    # ---- expression evaluation ----
    def eval(self, node):
        tag = node[0]
        if tag == "num":
            return node[1]
        if tag == "var":
            return self.env.get(node[1])
        if tag == "call":
            vals = [self.eval(a) for a in node[2]]
            return self.call_function(node[1], vals)
        if tag == "index":
            arr = self.env.get(node[1])
            i = int(self.eval(node[2]))
            if isinstance(arr, list) and 0 <= i < len(arr):
                return arr[i]
            return 0
        if tag == "not":
            return not self._truth(self.eval(node[1]))
        if tag == "neg":
            return -self.eval(node[1])
        if tag == "bin":
            _, op, a, b = node
            if op == "and":
                return self._truth(self.eval(a)) and self._truth(self.eval(b))
            if op == "or":
                return self._truth(self.eval(a)) or self._truth(self.eval(b))
            if op == "xor":
                return self._truth(self.eval(a)) != self._truth(self.eval(b))
            x = self.eval(a); y = self.eval(b)
            if op == "=":  return x == y
            if op == "<>": return x != y
            if op == "<":  return x < y
            if op == ">":  return x > y
            if op == "<=": return x <= y
            if op == ">=": return x >= y
            if op == "+":  return x + y
            if op == "-":  return x - y
            if op == "*":  return x * y
            if op == "/":  return x / y if isinstance(x,float) or isinstance(y,float) else int(x/y) if y else 0
            if op == "mod":return x % y if y else 0
        raise STError(f"Cannot evaluate {tag}")

    @staticmethod
    def _truth(v):
        return bool(v)

    def call_function(self, name, args):
        fn = self.functions.get(name.lower())
        if fn is None:
            raise STError(f"unknown function {name}")
        inputs, body = fn
        old = self.env
        self.env = Env()
        for i, pn in enumerate(inputs):
            if i < len(args):
                self.env.set(pn, args[i])
        self.env.set(name, 0)
        try:
            self.exec_block(body)
            res = self.env.get(name)
        finally:
            self.env = old
        return res

    def new_fb(self, name):
        d = self.fbs.get(name.lower())
        if d is None:
            raise STError(f"unknown function block {name}")
        return FBInstance(self, d)


def run_steps(src: str, steps: list):
    """
    Execute `src` across a sequence of steps on a persistent environment.
    Each step: {"set": {...inputs...}, "expect": {...outputs...}}.
    Returns (ok, detail) where detail describes the first mismatch, if any.
    """
    interp = Interpreter(src)
    for n, step in enumerate(steps, start=1):
        interp.set_inputs(step.get("set", {}))
        interp.scan()
        for name, want in step.get("expect", {}).items():
            got = interp.get(name)
            if not _values_equal(got, want):
                return False, f"step {n}: expected {name}={want}, got {got}"
    return True, "all steps passed"


def _values_equal(got, want):
    if isinstance(want, bool) or isinstance(got, bool):
        return bool(got) == bool(want)
    if isinstance(want, (int, float)) and isinstance(got, (int, float)):
        return abs(got - want) < 1e-9
    return got == want


def trace_steps(src: str, steps: list):
    """Like run_steps, but returns a per-step trace for animation:
    [{n, inputs(accumulated), outputs(expected keys->actual), expected, ok}]."""
    interp = Interpreter(src)
    seen = {}
    out = []
    for n, step in enumerate(steps, start=1):
        st = step.get("set", {})
        for k, v in st.items():
            seen[k] = v
        interp.set_inputs(st)
        interp.scan()
        exp = step.get("expect", {})
        outputs = {k: interp.get(k) for k in exp}
        ok = all(_values_equal(interp.get(k), v) for k, v in exp.items())
        out.append({"n": n, "inputs": dict(seen), "outputs": outputs,
                    "expected": exp, "ok": ok})
    return out


class FBInstance:
    """A running instance of a FUNCTION_BLOCK -- keeps its own env, so static
    VARs and outputs persist across scans (real FB memory)."""
    def __init__(self, interp, defn):
        self.interp = interp
        self.body = defn[2]
        self.env = Env()

    def call(self, inputs: dict):
        i = self.interp
        old = i.env
        i.env = self.env
        for k, v in inputs.items():
            i.env.set(k, list(v) if isinstance(v, list) else v)
        try:
            i.exec_block(self.body)
        finally:
            i.env = old

    def get(self, name):
        return self.env.get(name)


def trace_fb(src: str, fb: str, steps: list):
    """Drive one FB instance across steps; per-step trace for check + animation."""
    interp = Interpreter(src)
    interp.scan()                       # register the fbdef
    inst = interp.new_fb(fb)
    seen = {}
    out = []
    for n, step in enumerate(steps, start=1):
        st = step.get("set", {})
        for k, v in st.items():
            seen[k] = v
        inst.call(st)
        exp = step.get("expect", {})
        outputs = {k: inst.get(k) for k in exp}
        ok = all(_values_equal(inst.get(k), v) for k, v in exp.items())
        out.append({"n": n, "inputs": dict(seen), "outputs": outputs,
                    "expected": exp, "ok": ok})
    return out
