// pages/index.tsx
import { useState, useCallback, useEffect } from "react";
import Head from "next/head";
import "../styles/calculator.css";

// ── Types ────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  expr: string;
  result: string;
}

// ── Button layout ────────────────────────────────────────────────────────────

type BtnDef = {
  label: string;
  value: string;
  kind: "num" | "op" | "util" | "eq";
  wide?: boolean;
  extra?: string;
};

const BUTTONS: BtnDef[] = [
  { label: "AC",  value: "AC",  kind: "util" },
  { label: "±",   value: "±",   kind: "util" },
  { label: "%",   value: "%",   kind: "op"   },
  { label: "÷",   value: "/",   kind: "op"   },

  { label: "7",   value: "7",   kind: "num"  },
  { label: "8",   value: "8",   kind: "num"  },
  { label: "9",   value: "9",   kind: "num"  },
  { label: "×",   value: "*",   kind: "op"   },

  { label: "4",   value: "4",   kind: "num"  },
  { label: "5",   value: "5",   kind: "num"  },
  { label: "6",   value: "6",   kind: "num"  },
  { label: "−",   value: "-",   kind: "op"   },

  { label: "1",   value: "1",   kind: "num"  },
  { label: "2",   value: "2",   kind: "num"  },
  { label: "3",   value: "3",   kind: "num"  },
  { label: "+",   value: "+",   kind: "op"   },

  { label: "0",   value: "0",   kind: "num", wide: true },
  { label: ".",   value: ".",   kind: "num"  },
  { label: "=",   value: "=",   kind: "eq"   },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function Calculator() {
  const [expr, setExpr]       = useState<string>("");
  const [result, setResult]   = useState<string>("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [committed, setCommitted] = useState(false); // after "=" was pressed

  const calculate = useCallback(async (expression: string) => {
    if (!expression.trim()) return;
    setLoading(true);
    setIsError(false);
    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression }),
      });
      const data = await res.json();
      if (data.error) {
        setResult(data.error);
        setIsError(true);
      } else {
        const formatted = formatNumber(data.result);
        setResult(formatted);
        setHistory(prev => [
          { expr: expression, result: formatted },
          ...prev.slice(0, 9),
        ]);
      }
    } catch {
      setResult("Network error");
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBtn = useCallback((btn: BtnDef) => {
    if (btn.value === "AC") {
      setExpr("");
      setResult("");
      setIsError(false);
      setCommitted(false);
      return;
    }

    if (btn.value === "±") {
      setExpr(prev => {
        if (!prev) return prev;
        return prev.startsWith("-") ? prev.slice(1) : "-" + prev;
      });
      return;
    }

    if (btn.value === "=") {
      setCommitted(true);
      calculate(expr);
      return;
    }

    // If we just committed a result and user presses a number/dot, start fresh
    if (committed && btn.kind === "num") {
      setExpr(btn.value);
      setResult("");
      setIsError(false);
      setCommitted(false);
      return;
    }

    // If we just committed and user presses an operator, chain from result
    if (committed && btn.kind === "op") {
      setExpr(result + btn.value);
      setResult("");
      setIsError(false);
      setCommitted(false);
      return;
    }

    setCommitted(false);
    setIsError(false);
    setExpr(prev => prev + btn.value);
  }, [expr, result, committed, calculate]);

  // Keyboard support
  useEffect(() => {
    const map: Record<string, string> = {
      "Enter": "=", "=": "=",
      "Backspace": "DEL", "Escape": "AC",
      "+": "+", "-": "-", "*": "*", "/": "/",
      "%": "%",
    };
    const onKey = (e: KeyboardEvent) => {
      const mapped = map[e.key] ?? (/^[0-9.]$/.test(e.key) ? e.key : null);
      if (!mapped) return;
      if (mapped === "DEL") {
        setExpr(prev => prev.slice(0, -1));
        setCommitted(false);
        return;
      }
      const btn = BUTTONS.find(b => b.value === mapped);
      if (btn) handleBtn(btn);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleBtn]);

  const displayResult = loading ? null : result;

  return (
    <>
      <Head>
        <title>Nucleus Calc</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="page">
        <p className="wordmark">NUCLEUS <span>CALC</span></p>

        <div className="calc">
          {/* Display */}
          <div className="display">
            <div className="display-history">{committed ? expr : ""}</div>
            <div className="display-expr">{expr || "0"}</div>
            <div className={`display-result${isError ? " error" : ""}${!result && !loading ? " muted" : ""}`}>
              {loading
                ? <span className="spinner" />
                : displayResult ?? "—"
              }
            </div>
          </div>

          {/* Buttons */}
          <div className="buttons">
            {BUTTONS.map((btn) => (
              <button
                key={btn.label}
                className={[
                  "btn",
                  `btn-${btn.kind}`,
                  btn.wide ? "btn-wide" : "",
                  btn.value === "^" ? "btn-pow" : "",
                ].join(" ")}
                onClick={() => handleBtn(btn)}
                aria-label={btn.label}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="history">
            <p className="history-title">History</p>
            <div className="history-list">
              {history.map((h, i) => (
                <div
                  key={i}
                  className="history-item"
                  onClick={() => {
                    setExpr(h.result);
                    setResult("");
                    setCommitted(false);
                  }}
                >
                  <span className="history-expr">{h.expr}</span>
                  <span className="history-res">{h.result}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (!isFinite(n)) return String(n);
  // Use exponential notation for very large or very small values
  if (Math.abs(n) > 1e15 || (Math.abs(n) < 1e-8 && n !== 0)) {
    return n.toExponential(6).replace(/\.?0+e/, "e");
  }
  // Strip floating-point noise (e.g. 0.1+0.2 = 0.30000000000000004)
  const rounded = parseFloat(n.toPrecision(12));
  return String(rounded);
}
