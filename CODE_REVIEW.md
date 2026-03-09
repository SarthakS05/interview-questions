# Code Review – Webhook Endpoint (Python)

## General Summary

The implementation covers the required features (routing, signature verification, JSON parsing, audit logging, upsert), but contains several **critical security vulnerabilities** and a few reliability issues that must be fixed before merging.

---

## Critical Issues

### 1. SQL Injection (Lines 34–42)
**Severity: Critical**

Both `cur.execute()` calls use f-strings to interpolate user-controlled values directly into SQL:

```python
# VULNERABLE
cur.execute(
    f"INSERT INTO webhook_audit(email, raw_json) VALUES ('{email}', '{raw.decode('utf-8')}')"
)
cur.execute(
    f"INSERT INTO users(email, role) VALUES('{email}', '{role}')"
)
```

An attacker who can forge a signature (or if the secret is weak/leaked) can pass:
```
email = "x'); DROP TABLE users;--"
```
and destroy the database. Even before signature bypass, the raw JSON is stored — so a maliciously crafted body gets written as-is.

**Fix:** Always use parameterized queries:
```python
cur.execute(
    "INSERT INTO webhook_audit(email, raw_json) VALUES (?, ?)",
    (email, raw.decode("utf-8"))
)
cur.execute(
    "INSERT OR REPLACE INTO users(email, role) VALUES (?, ?)",
    (email, role)
)
```

---

### 2. Timing-Attack Vulnerability in Signature Comparison (Line 20)
**Severity: High**

```python
return expected == sig  # simple compare
```

Python's `==` on strings short-circuits on the first differing byte, leaking timing information. An attacker can brute-force the expected signature one byte at a time.

**Fix:** Use `hmac.compare_digest`:
```python
import hmac
return hmac.compare_digest(expected, sig)
```

---

### 3. Weak / Insecure Default Secret (Line 7)
**Severity: High**

```python
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "dev-secret")
```

If the environment variable is accidentally missing in production, the app silently falls back to `"dev-secret"`, making every request trivially forgeable.

**Fix:** Raise an error at startup if the secret is missing:
```python
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")
if not WEBHOOK_SECRET:
    raise RuntimeError("WEBHOOK_SECRET environment variable is required")
```

---

## Medium Issues

### 4. No Input Validation on `email` and `role` (Lines 27–28)
**Severity: Medium**

```python
email = payload.get("email", "")
role = payload.get("role", "user")
```

- `email` is never validated as an actual email address. An empty string or arbitrary text can be inserted into the DB.
- `role` accepts any string. If downstream code performs role-based access checks, an attacker could inject an unexpected role value.

**Fix:** Validate email format and whitelist allowed roles:
```python
import re
ALLOWED_ROLES = {"user", "admin", "vendor"}

if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
    return ("invalid email", 400)
if role not in ALLOWED_ROLES:
    return ("invalid role", 400)
```

---

### 5. Missing `metadata` Field Handling (Line 27)
**Severity: Medium**

The task spec says payloads include `metadata: {"source": "vendor"}`, but the code ignores it entirely. If business logic depends on filtering by source, this is a silent data loss bug.

---

### 6. No JSON Parse Error Handling (Line 23)
**Severity: Medium**

```python
payload = json.loads(raw.decode("utf-8"))
```

If the body is malformed JSON, this raises an unhandled exception, returning a 500. A 400 with a clear message is more appropriate.

**Fix:**
```python
try:
    payload = json.loads(raw.decode("utf-8"))
except (json.JSONDecodeError, UnicodeDecodeError):
    return ("invalid json", 400)
```

---

## Low / Style Issues

### 7. Database Connection Leak (Line 31)
`get_db()` opens a new connection on every request and never closes it. Use a `try/finally` or a context manager:
```python
db = get_db()
try:
    ...
    db.commit()
finally:
    db.close()
```

### 8. The INSERT on `users` Is Not Actually an Upsert (Line 40)
The task says "upsert." A plain `INSERT` will fail (or silently duplicate) if the email already exists. Use `INSERT OR REPLACE` or `INSERT ... ON CONFLICT DO UPDATE`.

### 9. `app.run(host="0.0.0.0")` in Production
Running Flask's dev server on `0.0.0.0` in production is insecure and not suitable for real traffic. Use gunicorn or uvicorn behind a reverse proxy.

### 10. No Request Size Limit
There is no cap on the size of `request.data`. A large payload could exhaust memory. Flask's `MAX_CONTENT_LENGTH` should be set.

---

## Summary Table

| # | Issue | Severity |
|---|-------|----------|
| 1 | SQL Injection via f-string queries | 🔴 Critical |
| 2 | Timing attack on signature compare | 🔴 High |
| 3 | Insecure default secret | 🔴 High |
| 4 | No input validation on email/role | 🟡 Medium |
| 5 | metadata field ignored | 🟡 Medium |
| 6 | No JSON parse error handling | 🟡 Medium |
| 7 | DB connection never closed | 🟢 Low |
| 8 | INSERT is not an upsert | 🟢 Low |
| 9 | Dev server in production | 🟢 Low |
| 10 | No request size limit | 🟢 Low |
