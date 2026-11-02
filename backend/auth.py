"""Password hashing, server-side sessions and login throttling.

* Passwords: Argon2id hashes (argon2-cffi defaults); the plain password is never stored or logged.
* Sessions: a random 256-bit token goes in an HttpOnly cookie; the database keeps only its SHA-256,
  so a database leak does not hand out working sessions. Logout deletes the row, so it takes effect at once.
* Throttle: 5 failed logins per e-mail (30 per IP) in 15 minutes -> HTTP 429. It lives in process memory,
  so with several workers each keeps its own count (use a shared store such as Redis if you scale out).
"""
from __future__ import annotations

import hashlib
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError, VerificationError

COOKIE_NAME = "complainiq_session"
_ph = PasswordHasher()
_DUMMY_HASH = _ph.hash("dummy-password-for-timing")
COMMON_PASSWORDS = {"password", "password1", "password123", "1234567890", "qwertyuiop", "iloveyou12",
                    "letmein123", "admin12345", "welcome123", "abc1234567", "0123456789", "passw0rd123"}


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """Constant-ish time: an unknown user is checked against a dummy hash so timing does not reveal accounts."""
    try:
        return _ph.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, InvalidHashError, VerificationError):
        return False


def password_problem(password: str, email: str, min_length: int) -> str | None:
    if len(password) < min_length:
        return f"Password must be at least {min_length} characters."
    if len(password) > 128:
        return "Password must be at most 128 characters."
    if password.lower() in COMMON_PASSWORDS or len(set(password)) < 4:
        return "That password is too easy to guess. Please choose another."
    if email and password.lower() == email.split("@")[0].lower():
        return "Password must not be the same as your e-mail name."
    return None


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def session_expiry(days: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


class LoginThrottle:
    def __init__(self, max_email: int = 5, max_ip: int = 30, window_s: int = 900, clock=time.monotonic):
        self.max_email, self.max_ip, self.window, self.clock = max_email, max_ip, window_s, clock
        self._fails: dict[str, deque] = defaultdict(deque)

    def _prune(self, key: str) -> deque:
        q, now = self._fails[key], self.clock()
        while q and now - q[0] > self.window:
            q.popleft()
        if not q:
            self._fails.pop(key, None)
            return self._fails[key]
        return q

    def blocked(self, email: str, ip: str) -> bool:
        return (len(self._prune(f"e:{email}")) >= self.max_email) or (len(self._prune(f"i:{ip}")) >= self.max_ip)

    def failed(self, email: str, ip: str) -> None:
        now = self.clock()
        self._fails[f"e:{email}"].append(now)
        self._fails[f"i:{ip}"].append(now)

    def succeeded(self, email: str) -> None:
        self._fails.pop(f"e:{email}", None)
