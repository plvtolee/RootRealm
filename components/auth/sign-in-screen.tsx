import Link from "next/link";

import { safeNextPath } from "@/lib/auth/next-path";

import styles from "./sign-in-screen.module.css";

function RootRealmMark() {
  return (
    <svg className={styles.brandMark} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M20 4.5 34.5 13v14L20 35.5 5.5 27V13L20 4.5Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 10v20M20 17 12.5 12.5M20 22l8-5M20 26l-7.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="17" r="2.1" fill="currentColor" />
      <circle cx="12.5" cy="12.5" r="1.5" fill="currentColor" />
      <circle cx="28" cy="17" r="1.5" fill="currentColor" />
      <circle cx="12.5" cy="30" r="1.5" fill="currentColor" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.54v-2.13c-3.1.67-3.75-1.32-3.75-1.32-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.21 3.23.93.1-.72.39-1.21.7-1.49-2.47-.28-5.07-1.24-5.07-5.5 0-1.21.43-2.2 1.15-2.98-.12-.29-.5-1.41.11-2.94 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.11-1.44 3.05-1.14 3.05-1.14.61 1.53.23 2.65.11 2.94.72.78 1.15 1.77 1.15 2.98 0 4.27-2.61 5.21-5.09 5.49.4.35.75 1.02.75 2.06v3.06c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" />
    </svg>
  );
}

function ShieldMark() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2.5 16 5v4.8c0 3.6-2.5 6.2-6 7.7-3.5-1.5-6-4.1-6-7.7V5l6-2.5Z" stroke="currentColor" strokeWidth="1.3" />
      <path d="m7.2 9.8 1.8 1.8 3.8-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The universal signed-out entry surface for all protected application routes. */
export function SignInScreen({ next }: { next?: string | null }) {
  const destination = safeNextPath(next);
  const signInHref = `/api/auth/github?next=${encodeURIComponent(destination)}`;

  return (
    <div className={`${styles.page} authPage`}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="RootRealm home">
          <RootRealmMark />
          <span>rootrealm</span>
        </Link>
        <span className={styles.topNote}>One identity. Built from your code.</span>
      </header>

      <div className={styles.main}>
        <section className={styles.auth} aria-labelledby="login-title">
          <div className={styles.eyebrow}><span className={styles.eyebrowLine} />Developer identity</div>
          <h1 id="login-title">Enter your<br />realm.</h1>
          <p className={styles.intro}>Your developer journey starts with GitHub. Connect your account to bring your activity, progress, and earned unlocks into RootRealm.</p>
          <a className={styles.githubButton} href={signInHref}>
            <GitHubMark />
            Continue with GitHub
          </a>
          <p className={styles.status} role="status" aria-live="polite" />
          <div className={styles.providerNote}>
            <ShieldMark />
            <span>You’ll be redirected to GitHub to authorize RootRealm, then returned here to continue.</span>
          </div>
          <p className={styles.fineprint}>By continuing, you agree to RootRealm&apos;s <Link href="/">Terms</Link> and <Link href="/">Privacy Policy</Link>.</p>
        </section>
      </div>

      <footer className={styles.bottom}>
        <span>© {new Date().getFullYear()} RootRealm</span>
        <div className={styles.bottomLinks}><Link href="/">Help</Link><Link href="/">Status</Link><Link href="/">Privacy</Link></div>
      </footer>
    </div>
  );
}
