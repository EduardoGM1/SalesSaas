import { Link, Outlet, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Check,
  Globe,
  Lock,
  Smartphone,
  Users,
  Zap,
} from "lucide-react";
import { useI18n } from "@/hooks/use-i18n.js";
import { useDbStore } from "@/stores/db-store";

const NAV_LINKS = [
  { key: "auth.landing.nav.about", href: "#" },
  { key: "auth.landing.nav.what", href: "#" },
  { key: "auth.landing.nav.faq", href: "#" },
  { key: "auth.landing.nav.contact", href: "#" },
];

const TRUST_ITEMS = [
  { key: "auth.landing.trust.secure", icon: Lock },
  { key: "auth.landing.trust.access", icon: Smartphone },
  { key: "auth.landing.trust.teams", icon: Users },
  { key: "auth.landing.trust.start", icon: Zap },
];

export function AuthLandingShell() {
  const { t, lang } = useI18n();
  const location = useLocation();
  const isLogin = location.pathname === "/login";

  const setLang = (value) => {
    const { db, replaceDb, persist } = useDbStore.getState();
    replaceDb({ ...db, settings: { ...db.settings, language: value } });
    persist();
  };

  return (
    <div className="auth-landing">
      <header className="auth-landing-header">
        <Link to="/register" className="auth-landing-brand">
          <img src="/icon.svg" alt="" className="auth-landing-brand-icon" />
          <span>Saletse</span>
        </Link>
        <nav className="auth-landing-nav" aria-label={t("auth.landing.nav.aria")}>
          {NAV_LINKS.map((item) => (
            <a key={item.key} href={item.href} className="auth-landing-nav-link">{t(item.key)}</a>
          ))}
        </nav>
        <div className="auth-landing-header-actions">
          <label className="auth-landing-lang">
            <Globe size={16} aria-hidden />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label={t("settings.language.visual")}
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
          {isLogin ? (
            <Link to="/register" className="btn btn-ghost btn-sm auth-landing-header-cta">
              {t("auth.login.createAccount")}
            </Link>
          ) : (
            <Link to="/login" className="btn btn-ghost btn-sm auth-landing-header-cta">
              {t("auth.register.signIn")}
            </Link>
          )}
        </div>
      </header>

      <main className="auth-landing-main">
        <section className="auth-landing-hero" aria-label={t("auth.landing.hero.aria")}>
          <h1 className="auth-landing-headline">{t("auth.landing.hero.title")}</h1>
          <p className="auth-landing-lead">{t("auth.landing.hero.sub")}</p>
          <div className="auth-landing-pills">
            <span>{t("auth.landing.pill.prospects")}</span>
            <span>{t("auth.landing.pill.followups")}</span>
            <span>{t("auth.landing.pill.production")}</span>
          </div>

          <div className="auth-landing-flow">
            <div className="auth-landing-flow-card">
              <div className="auth-landing-flow-label">{t("auth.landing.flow.client")}</div>
              <div className="auth-landing-flow-name">Daniel Carter</div>
              <div className="auth-landing-flow-meta">🇺🇸 · {t("auth.landing.flow.active")}</div>
            </div>
            <div className="auth-landing-flow-arrow" aria-hidden>
              <ArrowRight size={20} />
            </div>
            <div className="auth-landing-flow-card auth-landing-flow-card--accent">
              <div className="auth-landing-flow-label">{t("auth.landing.flow.vacation")}</div>
              <div className="auth-landing-flow-stat">$151,050</div>
              <div className="auth-landing-flow-meta">{t("auth.landing.flow.inflation")}</div>
            </div>
            <div className="auth-landing-flow-arrow" aria-hidden>
              <ArrowRight size={20} />
            </div>
            <div className="auth-landing-flow-card">
              <div className="auth-landing-flow-label">{t("auth.landing.flow.worksheet")}</div>
              <div className="auth-landing-flow-row"><span>{t("auth.landing.flow.down")}</span><strong>$4,950</strong></div>
              <div className="auth-landing-flow-row"><span>{t("auth.landing.flow.monthly")}</span><strong>$495</strong></div>
            </div>
          </div>

          <div className="auth-landing-highlights">
            <div className="auth-landing-highlight">
              <div className="auth-landing-highlight-art auth-landing-highlight-art--talk" />
              <div className="auth-landing-highlight-title">{t("auth.landing.highlight.talk")}</div>
              <div className="auth-landing-highlight-sub">{t("auth.landing.highlight.talkSub")}</div>
            </div>
            <div className="auth-landing-highlight">
              <div className="auth-landing-highlight-art auth-landing-highlight-art--work" />
              <div className="auth-landing-highlight-title">{t("auth.landing.highlight.work")}</div>
              <div className="auth-landing-highlight-sub">{t("auth.landing.highlight.workSub")}</div>
            </div>
            <div className="auth-landing-highlight">
              <div className="auth-landing-highlight-art auth-landing-highlight-art--team">
                <BarChart3 size={28} color="#2563eb" />
              </div>
              <div className="auth-landing-highlight-title">{t("auth.landing.highlight.team")}</div>
              <div className="auth-landing-highlight-sub">{t("auth.landing.highlight.teamSub")}</div>
            </div>
          </div>
        </section>

        <section className="auth-landing-panel">
          <div className="auth-card auth-landing-card">
            <Outlet />
          </div>
        </section>
      </main>

      <footer className="auth-landing-trust">
        {TRUST_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="auth-landing-trust-item">
              <div className="auth-landing-trust-icon"><Icon size={18} /></div>
              <div>
                <div className="auth-landing-trust-title">{t(`${item.key}.title`)}</div>
                <div className="auth-landing-trust-sub">{t(`${item.key}.sub`)}</div>
              </div>
            </div>
          );
        })}
      </footer>
    </div>
  );
}
