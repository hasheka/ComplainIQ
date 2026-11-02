from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from ..auth import (COOKIE_NAME, hash_password, new_token, password_problem, session_expiry, token_hash,
                    verify_password)
from ..deps import DB, CurrentUser, SettingsDep, StorageDep, current_session
from ..models import User, UserSession
from ..schemas import LoginIn, PasswordChangeIn, PasswordConfirmIn, RegisterIn, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])
GENERIC_LOGIN_ERROR = "Incorrect e-mail or password."


def _start_session(db, user: User, response: Response, settings) -> None:
    token = new_token()
    db.add(UserSession(user_id=user.id, token_hash=token_hash(token), expires_at=session_expiry(settings.session_days)))
    db.commit()
    response.set_cookie(COOKIE_NAME, token, max_age=settings.session_days * 86400, httponly=True,
                        secure=settings.cookie_secure, samesite="lax", path="/")


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, response: Response, db: DB, settings: SettingsDep):
    problem = password_problem(body.password, body.email, settings.min_password_length)
    if problem:
        raise HTTPException(422, problem)
    user = User(email=body.email, password_hash=hash_password(body.password), display_name=body.display_name)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this e-mail already exists.")
    _start_session(db, user, response, settings)
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: DB, settings: SettingsDep):
    throttle = request.app.state.throttle
    ip = _client_ip(request)
    if throttle.blocked(body.email, ip):
        raise HTTPException(429, "Too many failed attempts. Please wait 15 minutes and try again.")
    user = db.scalar(select(User).where(User.email == body.email))
    ok = verify_password(user.password_hash if user else None, body.password)
    if not (user and ok):
        throttle.failed(body.email, ip)
        raise HTTPException(401, GENERIC_LOGIN_ERROR)         # same message whether the e-mail exists or not
    throttle.succeeded(body.email)
    _start_session(db, user, response, settings)
    return user


@router.post("/logout", status_code=204)
def logout(db: DB, sess: UserSession = Depends(current_session)):
    """Deletes the server-side session, so the cookie stops working immediately."""
    db.delete(sess)
    db.commit()
    resp = Response(status_code=204)
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/password", status_code=204)
def change_password(body: PasswordChangeIn, user: CurrentUser, db: DB, settings: SettingsDep,
                    sess: UserSession = Depends(current_session)):
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(403, "Current password is incorrect.")
    problem = password_problem(body.new_password, user.email, settings.min_password_length)
    if problem:
        raise HTTPException(422, problem)
    user.password_hash = hash_password(body.new_password)
    # sign out every OTHER device, keep this one
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.id != sess.id))
    db.commit()
    return Response(status_code=204)


@router.delete("/account", status_code=204)
def delete_account(body: PasswordConfirmIn, user: CurrentUser, db: DB, storage: StorageDep):
    """Permanently deletes the account, all its datasets (database rows AND files) and sessions."""
    if not verify_password(user.password_hash, body.password):
        raise HTTPException(403, "Password is incorrect.")
    storage.delete_user(user.id)
    db.delete(user)
    db.commit()
    resp = Response(status_code=204)
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp
