# Nucleus Calculator — Engineering Intern Interview Submission

## Live Demo
Deploy to Vercel → see **Deployment** section below.

---

## Project Structure

```
nucleus-calculator/
├── pages/
│   ├── index.tsx          ← Calculator UI (Next.js / React)
│   └── api/
│       └── calculate.ts   ← Backend API route (safe math evaluator)
├── styles/
│   └── calculator.css     ← Shared stylesheet
├── public/
│   └── calculator.html    ← Standalone HTML/CSS/JS calculator (no framework)
├── backend/
│   ├── app.py             ← Fixed Python Flask webhook
│   └── webhook.php        ← Fixed PHP webhook
├── CODE_REVIEW.md         ← Code review answers
├── next.config.js
├── tsconfig.json
├── vercel.json
└── package.json
```

---

## Deployment to Vercel

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "feat: nucleus calculator"
gh repo create nucleus-calculator --public --push
```

### 2. Import on Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import** on your GitHub repo
3. Framework preset will be detected as **Next.js** automatically
4. Click **Deploy** — done!

No environment variables are required for the calculator.

---

## Running Locally

```bash
npm install
npm run dev
# → http://localhost:3000
```

The standalone HTML version (no build needed):
```
open public/calculator.html
```

---

## Code Review Summary

See `CODE_REVIEW.md` for the full review. Key findings:

| Issue | Severity |
|-------|----------|
| SQL Injection via f-string queries | 🔴 Critical |
| Timing attack on `==` signature compare | 🔴 High |
| Insecure default secret (`"dev-secret"`) | 🔴 High |
| No email/role input validation | 🟡 Medium |
| `metadata` field silently dropped | 🟡 Medium |
| No JSON error handling | 🟡 Medium |
| DB connection never closed | 🟢 Low |
| `INSERT` is not actually an upsert | 🟢 Low |

---

## Calculator — Feature Notes

### What's included
- Full arithmetic: `+`, `−`, `×`, `÷`, `%`
- Parentheses grouping: `(3+4)*2`
- Keyboard support (0–9, operators, Enter, Escape, Backspace)
- Calculation history (last 10, click to reuse)
- Chaining: after `=`, pressing an operator continues from result
- Floating-point noise suppression (`0.1+0.2` → `0.3`, not `0.30000000000000004`)
- Safe server-side evaluator — **no `eval()`** used anywhere

### Backend API
`POST /api/calculate`
```json
{ "expression": "3*(4+2)/2" }
```
Response:
```json
{ "result": 9 }
```
Error:
```json
{ "result": "", "error": "Division by zero" }
```

### Math evaluator
The backend uses a hand-written recursive-descent parser (not `eval`). This is safe against code injection. The same algorithm is mirrored in the standalone HTML file.

Grammar:
```
expr   → term (('+' | '-') term)*
term   → factor (('*' | '/' | '%') factor)*
factor → base ('^' factor)?
base   → NUM | '(' expr ')' | '-' base
```

---

## Follow-up Answers

### Code Review Follow-up

**Prompt used:**
> "Review this Python webhook endpoint for security issues, correctness bugs, and style issues. Be specific about line numbers."

**What I hoped for:** A structured list of issues by severity.
**What it did:** Identified all critical issues correctly. Did not initially flag the `metadata` field being silently dropped, which required a follow-up prompt: "Are there any data loss or business-logic issues besides security?"
**Did I re-prompt?** Yes, once — to catch the metadata gap and the "INSERT is not an upsert" issue.

---

### Coding Challenge Follow-up

**1. How far did you get?**
Fully working calculator with Next.js frontend, a typed Next.js API route for server-side evaluation, a standalone HTML/CSS/JS version, shared CSS file, full keyboard support, and history panel.

**2. Challenges encountered**
- Floating-point representation (e.g. `0.1+0.2`) — solved with `toPrecision(12)` rounding.
- Chaining after `=` (pressing operator should chain, pressing number should reset) — required explicit `committed` state.
- Keeping the standalone HTML version in sync with the React version — ended up duplicating the evaluator, which is acceptable since it's small.

**3. With unlimited time, I'd add:**
- Scientific functions: `sin`, `cos`, `sqrt`, `log`
- Memory registers (M+, MR, MC)
- Expression editing (cursor positioning)
- Themes (light mode, high-contrast)
- Unit conversions
- PWA / installable app
- Persistent history (localStorage)
- Shareable calculation URLs

**4. AI usage**

*What it did well:*
- Scaffolded the Next.js project structure instantly
- Suggested `hmac.compare_digest` and parameterized queries unprompted when asked to fix the webhook
- Generated clean TypeScript types

*What it did poorly:*
- First attempt at the evaluator used `eval()` — had to explicitly say "no eval, write a recursive-descent parser"
- CSS specificity issues in the initial design pass required manual fixes

*How I adjusted prompts:*
- Added "no eval, write a safe parser" constraint upfront
- Asked for "a single self-contained CSS file I can import" to avoid inline style sprawl
