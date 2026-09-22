from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

import jwt
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://lelefa:lelefa@localhost:5432/lelefachambers"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "development-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 480
    cors_origins: str = "http://localhost:3000"
    bootstrap_admin_email: str = "admin@lelefachambers.co.ls"
    bootstrap_admin_password: str = "change-me"
    bootstrap_admin_name: str = "Lelefa Chambers Administrator"
    upload_dir: str = "./uploads"
    max_upload_mb: int = 10


settings = Settings()


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(64), default="content_editor", nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SiteSetting(TimestampMixin, Base):
    __tablename__ = "site_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    value: Mapped[Any] = mapped_column(JSON, nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Page(TimestampMixin, Base):
    __tablename__ = "pages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    nav_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    hero_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hero_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    sections: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    seo_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    seo_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    show_in_navigation: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    submitted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PracticeArea(TimestampMixin, Base):
    __tablename__ = "practice_areas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_description: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    icon: Mapped[str | None] = mapped_column(String(80), nullable=True)
    audience: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    seo_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    seo_description: Mapped[str | None] = mapped_column(Text, nullable=True)


class Professional(TimestampMixin, Base):
    __tablename__ = "professionals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str | None] = mapped_column(String(160), nullable=True)
    biography: Mapped[str] = mapped_column(Text, default="", nullable=False)
    qualifications: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    practice_areas: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    admission_date: Mapped[str | None] = mapped_column(String(64), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)


class Credential(TimestampMixin, Base):
    __tablename__ = "credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    professional_id: Mapped[int] = mapped_column(ForeignKey("professionals.id"), index=True, nullable=False)
    credential_type: Mapped[str] = mapped_column(String(120), nullable=False)
    issuer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reference_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    issue_date: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expiry_date: Mapped[str | None] = mapped_column(String(64), nullable=True)
    document_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Article(TimestampMixin, Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    excerpt: Mapped[str] = mapped_column(Text, default="", nullable=False)
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    category: Mapped[str] = mapped_column(String(120), default="Legal Insight", nullable=False)
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True, nullable=False)
    submitted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    seo_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    seo_description: Mapped[str | None] = mapped_column(Text, nullable=True)


class ConsultationRequest(TimestampMixin, Base):
    __tablename__ = "consultation_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(80), nullable=False)
    matter_type: Mapped[str] = mapped_column(String(160), nullable=False)
    preferred_date: Mapped[str | None] = mapped_column(String(80), nullable=True)
    preferred_method: Mapped[str | None] = mapped_column(String(80), nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="new", index=True, nullable=False)
    assigned_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    internal_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class MediaAsset(TimestampMixin, Base):
    __tablename__ = "media_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    public_url: Mapped[str] = mapped_column(String(512), nullable=False)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    before: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    after: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    request_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(120), nullable=True)


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    iterations = 310_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iteration_text, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iteration_text)
        )
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


ROLE_PERMISSIONS: dict[str, set[str]] = {
    "system_owner": {"*"},
    "chambers_admin": {"cms:*", "people:*", "consultation:*", "media:*", "audit:read"},
    "managing_advocate": {"cms:*", "people:read", "consultation:*", "media:*", "audit:read"},
    "advocate": {"cms:read", "consultation:read", "consultation:update", "people:read"},
    "content_editor": {"cms:read", "cms:draft", "cms:submit", "media:create"},
    "reception": {"consultation:*", "cms:read", "people:read"},
    "auditor": {"cms:read", "people:read", "consultation:read", "audit:read"},
}


def role_allows(role: str, permission: str) -> bool:
    allowed = ROLE_PERMISSIONS.get(role, set())
    if "*" in allowed or permission in allowed:
        return True
    prefix = permission.split(":", 1)[0] + ":*"
    return prefix in allowed


def current_user(
    authorization: str | None = Header(default=None), db: Session = Depends(get_db)
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = int(payload["sub"])
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from exc
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User is inactive or unavailable")
    return user


def require(permission: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if not role_allows(user.role, permission):
            raise HTTPException(status_code=403, detail="Insufficient permission")
        return user

    return dependency


def audit(
    db: Session,
    request: Request,
    user: User | None,
    action: str,
    entity_type: str,
    entity_id: str | None,
    before: Any = None,
    after: Any = None,
):
    db.add(
        AuditLog(
            actor_user_id=user.id if user else None,
            actor_email=user.email if user else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before=before,
            after=after,
            request_path=request.url.path,
            ip_address=request.client.host if request.client else None,
        )
    )


def model_dict(obj: Any) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if isinstance(value, datetime):
            value = value.isoformat()
        data[column.name] = value
    return data


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class ConsultationCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    phone: str = Field(min_length=5, max_length=80)
    matter_type: str = Field(min_length=2, max_length=160)
    preferred_date: str | None = None
    preferred_method: str | None = None
    summary: str = Field(min_length=10, max_length=3000)


class PageInput(BaseModel):
    slug: str
    title: str
    nav_label: str | None = None
    hero_title: str | None = None
    hero_body: str | None = None
    excerpt: str | None = None
    sections: list[dict[str, Any]] = Field(default_factory=list)
    seo_title: str | None = None
    seo_description: str | None = None
    status: Literal["draft", "review", "published", "archived"] = "draft"
    sort_order: int = 0
    show_in_navigation: bool = True


class PracticeInput(BaseModel):
    slug: str
    name: str
    short_description: str
    body: str = ""
    icon: str | None = None
    audience: list[str] = Field(default_factory=list)
    featured: bool = False
    sort_order: int = 0
    status: Literal["draft", "review", "published", "archived"] = "draft"
    seo_title: str | None = None
    seo_description: str | None = None


class ProfessionalInput(BaseModel):
    slug: str
    full_name: str
    title: str
    role: str | None = None
    biography: str = ""
    qualifications: list[str] = Field(default_factory=list)
    practice_areas: list[str] = Field(default_factory=list)
    admission_date: str | None = None
    image_url: str | None = None
    email: EmailStr | None = None
    featured: bool = False
    sort_order: int = 0
    status: Literal["draft", "review", "published", "archived"] = "draft"


class ArticleInput(BaseModel):
    slug: str
    title: str
    excerpt: str = ""
    body: str = ""
    category: str = "Legal Insight"
    author_name: str | None = None
    image_url: str | None = None
    status: Literal["draft", "review", "published", "archived"] = "draft"
    seo_title: str | None = None
    seo_description: str | None = None


class ConsultationUpdate(BaseModel):
    status: Literal["new", "reviewing", "conflict_check", "scheduled", "closed", "declined"] | None = None
    assigned_to: str | None = None
    internal_note: str | None = None


app = FastAPI(title="Lelefa Chambers API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_path = Path(settings.upload_dir)
upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")


def upsert_setting(db: Session, key: str, value: Any, is_public: bool = True):
    existing = db.scalar(select(SiteSetting).where(SiteSetting.key == key))
    if existing:
        return
    db.add(SiteSetting(key=key, value=value, is_public=is_public))


def seed_data(db: Session):
    admin = db.scalar(select(User).where(User.email == settings.bootstrap_admin_email.lower()))
    if not admin:
        db.add(
            User(
                email=settings.bootstrap_admin_email.lower(),
                full_name=settings.bootstrap_admin_name,
                role="system_owner",
                password_hash=hash_password(settings.bootstrap_admin_password),
            )
        )

    upsert_setting(db, "brand", {"name": "Lelefa Chambers", "tagline": "Legal Strategy. Litigation. Recovery."})
    upsert_setting(
        db,
        "contact",
        {
            "email": "info@lelefachambers.co.ls",
            "phone": "+266 5776 3829",
            "address": "Lenyora House, Office No. 4, 190 Nightingale Road, New Europa, Maseru, Lesotho",
        },
    )
    upsert_setting(db, "domains", {"primary": "lelefachambers.co.ls", "debt_recovery": "lelefadebtcollectors.co.ls", "lending": "loanhub.co.ls", "technology": "ithute.co.ls"})

    if not db.scalar(select(Page).where(Page.slug == "home")):
        db.add(
            Page(
                slug="home",
                title="Home",
                nav_label="Home",
                hero_title="Legal Strategy. Litigation. Recovery.",
                hero_body="Disciplined legal representation, commercial dispute resolution and debt-recovery litigation for individuals, businesses and financial institutions across Lesotho.",
                excerpt="A modern Chambers combining professional legal practice with controlled, auditable legal-recovery workflows.",
                status="published",
                sort_order=0,
                sections=[
                    {"type": "eyebrow", "text": "Lelefa Chambers • Maseru, Lesotho"},
                    {"type": "statement", "title": "Counsel when the matter is important", "body": "We combine legal analysis, negotiation, litigation discipline and clear client communication from instruction through resolution."},
                    {"type": "institutional", "title": "For financial institutions and creditors", "body": "A controlled pathway from legal readiness and demand through litigation, settlement, judgment, execution and recovery reporting."},
                    {"type": "cta", "title": "Discuss your matter with Lelefa Chambers", "button": "Request a consultation", "href": "/contact"},
                ],
                seo_title="Lelefa Chambers | Advocates & Legal Recovery in Lesotho",
                seo_description="Lelefa Chambers provides litigation, debt recovery, commercial law, compliance, mediation and legal advisory services in Lesotho.",
                published_at=datetime.now(timezone.utc),
            )
        )

    pages = [
        ("about", "About", "About Lelefa Chambers", "A disciplined legal practice built around professional service, clear advice and accountable execution.", 1),
        ("institutional-recovery", "Financial Institutions", "Legal recovery for financial institutions", "From default to enforcement, one controlled legal-recovery process with clear authority, evidence and reporting.", 4),
        ("contact", "Contact", "Talk to Lelefa Chambers", "Request a consultation without sending unnecessary confidential case material through a public form.", 6),
    ]
    for slug, nav, hero, body, order in pages:
        if not db.scalar(select(Page).where(Page.slug == slug)):
            db.add(Page(slug=slug, title=nav, nav_label=nav, hero_title=hero, hero_body=body, status="published", sort_order=order, published_at=datetime.now(timezone.utc)))

    practices = [
        ("debt-recovery-litigation", "Debt Recovery & Litigation", "Legal recovery from demand and negotiated settlement through court proceedings, judgment and lawful execution.", ["Banks", "Microfinance institutions", "SACCOs", "Companies"], True, 1),
        ("commercial-litigation", "Commercial Litigation", "Representation in commercial disputes with a focus on disciplined preparation, proportionate strategy and enforceable outcomes.", ["Businesses", "Institutions", "Entrepreneurs"], True, 2),
        ("corporate-commercial", "Corporate & Commercial Law", "Contracts, corporate advisory, governance and commercial risk support for organisations and growing businesses.", ["Companies", "Directors", "Investors"], True, 3),
        ("compliance", "Compliance & Regulatory Advisory", "Practical legal and compliance support for regulated and operational environments.", ["Financial institutions", "Companies"], False, 4),
        ("mediation-negotiation", "Mediation & Negotiation", "Structured negotiation and dispute-resolution support aimed at resolving matters efficiently where appropriate.", ["Individuals", "Businesses", "Institutions"], False, 5),
    ]
    for slug, name, description, audience, featured, order in practices:
        if not db.scalar(select(PracticeArea).where(PracticeArea.slug == slug)):
            db.add(PracticeArea(slug=slug, name=name, short_description=description, body=description, audience=audience, featured=featured, sort_order=order, status="published"))

    if not db.scalar(select(Professional).where(Professional.slug == "matsepe-luciah-lelefa")):
        db.add(
            Professional(
                slug="matsepe-luciah-lelefa",
                full_name="Mats'epe Luciah Lelefa",
                title="Advocate",
                role="Lelefa Chambers",
                biography="Advocate Mats'epe Luciah Lelefa practises through Lelefa Chambers with a focus that includes litigation, debt recovery, negotiation, mediation and compliance-oriented legal work.",
                qualifications=["LLB", "LLM", "Compliance Management certification", "Mediation training"],
                practice_areas=["Debt Recovery & Litigation", "Commercial Litigation", "Compliance", "Mediation & Negotiation"],
                admission_date="15 February 2016",
                email="info@lelefachambers.co.ls",
                featured=True,
                sort_order=1,
                status="published",
            )
        )
    db.commit()


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_data(db)


@app.get("/health")
def health():
    return {"status": "ok", "service": "lelefa-chambers-api"}


@app.post("/api/v1/auth/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash) or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    before = model_dict(user)
    user.last_login_at = datetime.now(timezone.utc)
    audit(db, request, user, "auth.login", "user", str(user.id), before=before, after=model_dict(user))
    db.commit()
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role},
    }


@app.get("/api/v1/auth/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role}


@app.get("/api/v1/public/site")
def public_site(db: Session = Depends(get_db)):
    settings_rows = db.scalars(select(SiteSetting).where(SiteSetting.is_public.is_(True))).all()
    pages = db.scalars(select(Page).where(Page.status == "published").order_by(Page.sort_order, Page.title)).all()
    practices = db.scalars(select(PracticeArea).where(PracticeArea.status == "published").order_by(PracticeArea.sort_order, PracticeArea.name)).all()
    professionals = db.scalars(select(Professional).where(Professional.status == "published").order_by(Professional.sort_order, Professional.full_name)).all()
    articles = db.scalars(select(Article).where(Article.status == "published").order_by(Article.published_at.desc()).limit(6)).all()
    return {
        "settings": {row.key: row.value for row in settings_rows},
        "pages": [model_dict(row) for row in pages],
        "practice_areas": [model_dict(row) for row in practices],
        "professionals": [model_dict(row) for row in professionals],
        "articles": [model_dict(row) for row in articles],
    }


@app.get("/api/v1/public/pages/{slug}")
def public_page(slug: str, db: Session = Depends(get_db)):
    page = db.scalar(select(Page).where(Page.slug == slug, Page.status == "published"))
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return model_dict(page)


@app.get("/api/v1/public/practice-areas")
def public_practice_areas(db: Session = Depends(get_db)):
    rows = db.scalars(select(PracticeArea).where(PracticeArea.status == "published").order_by(PracticeArea.sort_order)).all()
    return [model_dict(row) for row in rows]


@app.get("/api/v1/public/professionals")
def public_professionals(db: Session = Depends(get_db)):
    rows = db.scalars(select(Professional).where(Professional.status == "published").order_by(Professional.sort_order)).all()
    return [model_dict(row) for row in rows]


@app.get("/api/v1/public/articles")
def public_articles(db: Session = Depends(get_db)):
    rows = db.scalars(select(Article).where(Article.status == "published").order_by(Article.published_at.desc())).all()
    return [model_dict(row) for row in rows]


@app.post("/api/v1/public/consultations", status_code=201)
def create_consultation(payload: ConsultationCreate, request: Request, db: Session = Depends(get_db)):
    item = ConsultationRequest(**payload.model_dump())
    db.add(item)
    db.flush()
    audit(db, request, None, "consultation.created", "consultation_request", str(item.id), after={"matter_type": item.matter_type, "status": item.status})
    db.commit()
    return {"id": item.id, "status": item.status, "message": "Your consultation request has been received."}


@app.get("/api/v1/admin/dashboard")
def admin_dashboard(db: Session = Depends(get_db), user: User = Depends(require("cms:read"))):
    def count(model, condition=None):
        stmt = select(func.count()).select_from(model)
        if condition is not None:
            stmt = stmt.where(condition)
        return db.scalar(stmt) or 0

    return {
        "pages": count(Page),
        "practice_areas": count(PracticeArea),
        "professionals": count(Professional),
        "articles": count(Article),
        "new_consultations": count(ConsultationRequest, ConsultationRequest.status == "new"),
        "media_assets": count(MediaAsset),
        "user": {"full_name": user.full_name, "role": user.role},
    }


@app.get("/api/v1/admin/pages")
def admin_pages(db: Session = Depends(get_db), user: User = Depends(require("cms:read"))):
    return [model_dict(row) for row in db.scalars(select(Page).order_by(Page.sort_order, Page.title)).all()]


@app.post("/api/v1/admin/pages", status_code=201)
def admin_create_page(payload: PageInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require("cms:draft"))):
    if db.scalar(select(Page).where(Page.slug == payload.slug)):
        raise HTTPException(status_code=409, detail="Page slug already exists")
    item = Page(**payload.model_dump())
    if item.status == "published" and not role_allows(user.role, "cms:publish"):
        item.status = "review"
        item.submitted_by_id = user.id
    elif item.status == "published":
        item.approved_by_id = user.id
        item.published_at = datetime.now(timezone.utc)
    db.add(item)
    db.flush()
    audit(db, request, user, "page.created", "page", str(item.id), after=model_dict(item))
    db.commit()
    return model_dict(item)


@app.put("/api/v1/admin/pages/{item_id}")
def admin_update_page(item_id: int, payload: PageInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require("cms:draft"))):
    item = db.get(Page, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Page not found")
    before = model_dict(item)
    incoming = payload.model_dump()
    if incoming["status"] == "published" and not role_allows(user.role, "cms:publish"):
        incoming["status"] = "review"
        item.submitted_by_id = user.id
    elif incoming["status"] == "published":
        item.approved_by_id = user.id
        item.published_at = datetime.now(timezone.utc)
    for key, value in incoming.items():
        setattr(item, key, value)
    audit(db, request, user, "page.updated", "page", str(item.id), before=before, after=model_dict(item))
    db.commit()
    return model_dict(item)


@app.post("/api/v1/admin/pages/{item_id}/publish")
def admin_publish_page(item_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require("cms:publish"))):
    item = db.get(Page, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Page not found")
    before = model_dict(item)
    item.status = "published"
    item.approved_by_id = user.id
    item.published_at = datetime.now(timezone.utc)
    audit(db, request, user, "page.published", "page", str(item.id), before=before, after=model_dict(item))
    db.commit()
    return model_dict(item)


@app.get("/api/v1/admin/practice-areas")
def admin_practices(db: Session = Depends(get_db), user: User = Depends(require("cms:read"))):
    return [model_dict(row) for row in db.scalars(select(PracticeArea).order_by(PracticeArea.sort_order)).all()]


@app.post("/api/v1/admin/practice-areas", status_code=201)
def admin_create_practice(payload: PracticeInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require("cms:draft"))):
    if db.scalar(select(PracticeArea).where(PracticeArea.slug == payload.slug)):
        raise HTTPException(status_code=409, detail="Practice-area slug already exists")
    item = PracticeArea(**payload.model_dump())
    if item.status == "published" and not role_allows(user.role, "cms:publish"):
        item.status = "review"
    db.add(item)
    db.flush()
    audit(db, request, user, "practice.created", "practice_area", str(item.id), after=model_dict(item))
    db.commit()
    return model_dict(item)


@app.put("/api/v1/admin/practice-areas/{item_id}")
def admin_update_practice(item_id: int, payload: PracticeInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require("cms:draft"))):
    item = db.get(PracticeArea, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Practice area not found")
    before = model_dict(item)
    incoming = payload.model_dump()
    if incoming["status"] == "published" and not role_allows(user.role, "cms:publish"):
        incoming["status"] = "review"
    for key, value in incoming.items():
        setattr(item, key, value)
    audit(db, request, user, "practice.updated", "practice_area", str(item.id), before=before, after=model_dict(item))
    db.commit()
    return model_dict(item)


@app.get("/api/v1/admin/professionals")
def admin_professionals(db: Session = Depends(get_db), user: User = Depends(require("people:read"))):
    return [model_dict(row) for row in db.scalars(select(Professional).order_by(Professional.sort_order)).all()]


@app.post("/api/v1/admin/professionals", status_code=201)
def admin_create_professional(payload: ProfessionalInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require("people:*"))):
    if db.scalar(select(Professional).where(Professional.slug == payload.slug)):
        raise HTTPException(status_code=409, detail="Professional slug already exists")
    item = Professional(**payload.model_dump())
    db.add(item)
    db.flush()
    audit(db, request, user, "professional.created", "professional", str(item.id), after=model_dict(item))
    db.commit()
    return model_dict(item)


@app.put("/api/v1/admin/professionals/{item_id}")
def admin_update_professional(item_id: int, payload: ProfessionalInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require("people:*"))):
    item = db.get(Professional, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Professional not found")
    before = model_dict(item)
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    audit(db, request, user, "professional.updated", "professional", str(item.id), before=before, after=model_dict(item))
    db.commit()
    return model_dict(item)


@app.get("/api/v1/admin/articles")
def admin_articles(db: Session = Depends(get_db), user: User = Depends(require("cms:read"))):
    return [model_dict(row) for row in db.scalars(select(Article).order_by(Article.updated_at.desc())).all()]


@app.post("/api/v1/admin/articles", status_code=201)
def admin_create_article(payload: ArticleInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require("cms:draft"))):
    if db.scalar(select(Article).where(Article.slug == payload.slug)):
        raise HTTPException(status_code=409, detail="Article slug already exists")
    item = Article(**payload.model_dump())
    if item.status == "published" and not role_allows(user.role, "cms:publish"):
        item.status = "review"
        item.submitted_by_id = user.id
    elif item.status == "published":
        item.approved_by_id = user.id
        item.published_at = datetime.now(timezone.utc)
    db.add(item)
    db.flush()
    audit(db, request, user, "article.created", "article", str(item.id), after=model_dict(item))
    db.commit()
    return model_dict(item)


@app.put("/api/v1/admin/articles/{item_id}")
def admin_update_article(item_id: int, payload: ArticleInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require("cms:draft"))):
    item = db.get(Article, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Article not found")
    before = model_dict(item)
    incoming = payload.model_dump()
    if incoming["status"] == "published" and not role_allows(user.role, "cms:publish"):
        incoming["status"] = "review"
        item.submitted_by_id = user.id
    elif incoming["status"] == "published":
        item.approved_by_id = user.id
        item.published_at = item.published_at or datetime.now(timezone.utc)
    for key, value in incoming.items():
        setattr(item, key, value)
    audit(db, request, user, "article.updated", "article", str(item.id), before=before, after=model_dict(item))
    db.commit()
    return model_dict(item)


@app.get("/api/v1/admin/consultations")
def admin_consultations(db: Session = Depends(get_db), user: User = Depends(require("consultation:read"))):
    return [model_dict(row) for row in db.scalars(select(ConsultationRequest).order_by(ConsultationRequest.created_at.desc())).all()]


@app.patch("/api/v1/admin/consultations/{item_id}")
def admin_update_consultation(item_id: int, payload: ConsultationUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(require("consultation:update"))):
    item = db.get(ConsultationRequest, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Consultation request not found")
    before = model_dict(item)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    audit(db, request, user, "consultation.updated", "consultation_request", str(item.id), before=before, after=model_dict(item))
    db.commit()
    return model_dict(item)


@app.post("/api/v1/admin/media", status_code=201)
async def upload_media(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require("media:create")),
    db: Session = Depends(get_db),
):
    allowed = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=415, detail="Unsupported media type")
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds upload size limit")
    ext = Path(file.filename or "upload").suffix.lower()
    stored_name = f"{secrets.token_hex(16)}{ext}"
    target = upload_path / stored_name
    target.write_bytes(content)
    item = MediaAsset(
        original_name=file.filename or stored_name,
        stored_name=stored_name,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        public_url=f"/uploads/{stored_name}",
        uploaded_by_id=user.id,
    )
    db.add(item)
    db.flush()
    audit(db, request, user, "media.uploaded", "media_asset", str(item.id), after={"name": item.original_name, "url": item.public_url})
    db.commit()
    return model_dict(item)


@app.get("/api/v1/admin/audit")
def audit_logs(db: Session = Depends(get_db), user: User = Depends(require("audit:read"))):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(250)).all()
    return [model_dict(row) for row in rows]
