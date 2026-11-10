import { Link, Outlet } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  FileText,
  FolderOpen,
  Globe,
  LineChart,
  MessageCircle,
  Shield,
  Smartphone,
  TrendingUp,
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

const PILL_ITEMS = [
  { key: "auth.landing.pill.prospects", icon: Users },
  { key: "auth.landing.pill.followups", icon: MessageCircle },
  { key: "auth.landing.pill.production", icon: TrendingUp },
];

const TRUST_ITEMS = [
  { key: "auth.landing.trust.secure", icon: Shield },
  { key: "auth.landing.trust.access", icon: Smartphone },
  { key: "auth.landing.trust.teams", icon: Users },
  { key: "auth.landing.trust.start", icon: Zap },
];

const TEAM_AVATARS = [
  { bg: "#dbeafe", initials: "AC" },
  { bg: "#fce7f3", initials: "MR" },
  { bg: "#dcfce7", initials: "JL" },
  { bg: "#fef3c7", initials: "SK" },
];

export function AuthLandingShell() {
  const { t, lang } = useI18n();

  const setLang = (value) => {
    const { db, replaceDb, persist } = useDbStore.getState();
    replaceDb({ ...db, settings: { ...db.settings, language: value } });
    persist();
  };

  return (
    <div className="auth-landing">
      <header className="auth-landing-header">
        <Link to="/register" className="auth-landing-brand" aria-label="Saletse">
          <img src="/saletse-logo.png" alt="Saletse" className="auth-landing-brand-logo" />
        </Link>

        <nav className="auth-landing-nav" aria-label={t("auth.landing.nav.aria")}>
          {NAV_LINKS.map((item) => (
            <a key={item.key} href={item.href} className="auth-landing-nav-link">{t(item.key)}</a>
          ))}
        </nav>

        <div className="auth-landing-header-actions">
          <label className="auth-landing-lang">
            <Globe size={15} aria-hidden />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label={t("settings.language.visual")}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
            <ChevronDown size={14} aria-hidden />
          </label>
        </div>
      </header>

      <main className="auth-landing-main">
        <section className="auth-landing-hero" aria-label={t("auth.landing.hero.aria")}>
          <h1 className="auth-landing-headline">{t("auth.landing.hero.title")}</h1>
          <p className="auth-landing-lead">{t("auth.landing.hero.sub")}</p>

          <div className="auth-landing-pills">
            {PILL_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <span key={item.key} className="auth-landing-pill">
                  <Icon size={15} aria-hidden />
                  {t(item.key)}
                </span>
              );
            })}
          </div>

          <div className="auth-landing-flow">
            <article className="auth-landing-flow-card">
              <div className="auth-landing-flow-head">
                <span className="auth-landing-flow-icon"><FolderOpen size={15} /></span>
                <span className="auth-landing-flow-num">1</span>
                <span className="auth-landing-flow-title">{t("auth.landing.flow.client")}</span>
              </div>
              <div className="auth-landing-flow-line">
                <span>{t("auth.landing.flow.nameLabel")}</span>
                <strong>Daniel Carter</strong>
              </div>
              <div className="auth-landing-flow-line">
                <span>{t("auth.landing.flow.nationalityLabel")}</span>
                <strong>{t("auth.landing.flow.nationalityValue")}</strong>
              </div>
              <div className="auth-landing-flow-line auth-landing-flow-line--status">
                <span>{t("auth.landing.flow.statusLabel")}</span>
                <span className="auth-landing-status-pill">{t("auth.landing.flow.active")}</span>
              </div>
            </article>

            <div className="auth-landing-flow-arrow" aria-hidden>
              <ArrowRight size={18} />
            </div>

            <article className="auth-landing-flow-card">
              <div className="auth-landing-flow-head">
                <span className="auth-landing-flow-icon"><LineChart size={15} /></span>
                <span className="auth-landing-flow-num">2</span>
                <span className="auth-landing-flow-title">{t("auth.landing.flow.vacation")}</span>
              </div>
              <div className="auth-landing-flow-line">
                <span>{t("auth.landing.flow.currentYearLabel")}</span>
                <strong>$7,000/{t("auth.landing.flow.yearUnit")}</strong>
              </div>
              <div className="auth-landing-flow-line">
                <span>{t("auth.landing.flow.futureYearLabel")}</span>
                <strong className="auth-landing-flow-blue">$14,552/{t("auth.landing.flow.yearUnit")}</strong>
              </div>
              <div className="auth-landing-flow-total">
                <span>{t("auth.landing.flow.inflation")}</span>
                <strong>$151,050</strong>
              </div>
            </article>

            <div className="auth-landing-flow-arrow" aria-hidden>
              <ArrowRight size={18} />
            </div>

            <article className="auth-landing-flow-card">
              <div className="auth-landing-flow-head">
                <span className="auth-landing-flow-icon"><FileText size={15} /></span>
                <span className="auth-landing-flow-num">3</span>
                <span className="auth-landing-flow-title">{t("auth.landing.flow.worksheet")}</span>
              </div>
              <div className="auth-landing-flow-line">
                <span>{t("auth.landing.flow.down")}</span>
                <strong>$25,000</strong>
              </div>
              <div className="auth-landing-flow-line">
                <span>{t("auth.landing.flow.monthly")}</span>
                <strong>$1,250</strong>
              </div>
              <div className="auth-landing-flow-line">
                <span>{t("auth.landing.flow.term")}</span>
                <strong>15 {t("auth.landing.flow.years")}</strong>
              </div>
              <div className="auth-landing-flow-line">
                <span>{t("auth.landing.flow.closing")}</span>
                <strong>{t("auth.landing.flow.closingValue")}</strong>
              </div>
            </article>
          </div>

          <div className="auth-landing-highlights">
            <article className="auth-landing-highlight">
              <img
                src="/landing-conversations.jpg"
                alt=""
                className="auth-landing-highlight-img"
              />
              <div className="auth-landing-highlight-body">
                <div className="auth-landing-highlight-title">{t("auth.landing.highlight.talk")}</div>
                <div className="auth-landing-highlight-sub">{t("auth.landing.highlight.talkSub")}</div>
              </div>
            </article>

            <article className="auth-landing-highlight">
              <img
                src="/landing-work-smarter.jpg"
                alt=""
                className="auth-landing-highlight-img"
              />
              <div className="auth-landing-highlight-body">
                <div className="auth-landing-highlight-title">{t("auth.landing.highlight.work")}</div>
                <div className="auth-landing-highlight-sub">{t("auth.landing.highlight.workSub")}</div>
              </div>
            </article>

            <article className="auth-landing-highlight auth-landing-highlight--team">
              <div className="auth-landing-highlight-body">
                <div className="auth-landing-highlight-title">{t("auth.landing.highlight.team")}</div>
                <div className="auth-landing-highlight-sub">{t("auth.landing.highlight.teamSub")}</div>
                <div className="auth-landing-avatars" aria-hidden>
                  {TEAM_AVATARS.map((avatar) => (
                    <span
                      key={avatar.initials}
                      className="auth-landing-avatar"
                      style={{ background: avatar.bg }}
                    >
                      {avatar.initials}
                    </span>
                  ))}
                  <span className="auth-landing-avatar auth-landing-avatar--more">+2</span>
                </div>
              </div>
            </article>
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
