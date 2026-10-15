"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const NAV_LINKS = [
  { href: "#the-realm", label: "The Realm" },
  { href: "#progression", label: "Progression" },
  { href: "#character", label: "Character" },
  { href: "#rewards", label: "Rewards" },
] as const;

const EMBERS = [
  { x: 8, y: 22, size: 3, delay: -2, duration: 12 },
  { x: 17, y: 72, size: 2, delay: -8, duration: 15 },
  { x: 28, y: 16, size: 2, delay: -5, duration: 13 },
  { x: 42, y: 83, size: 3, delay: -9, duration: 17 },
  { x: 54, y: 12, size: 2, delay: -4, duration: 14 },
  { x: 64, y: 69, size: 3, delay: -7, duration: 16 },
  { x: 72, y: 27, size: 2, delay: -1, duration: 13 },
  { x: 81, y: 80, size: 2, delay: -10, duration: 18 },
  { x: 91, y: 42, size: 3, delay: -6, duration: 15 },
  { x: 36, y: 48, size: 2, delay: -3, duration: 16 },
  { x: 59, y: 91, size: 2, delay: -11, duration: 14 },
  { x: 95, y: 14, size: 2, delay: -5, duration: 17 },
] as const;

const ATTRIBUTES = [
  { name: "Builder", detail: "Shipping useful work" },
  { name: "Debugger", detail: "Finding and fixing faults" },
  { name: "Scholar", detail: "Learning in public" },
  { name: "Collaborator", detail: "Helping work move forward" },
  { name: "Maintainer", detail: "Keeping projects healthy" },
  { name: "Architect", detail: "Designing what lasts" },
] as const;

function BrandMark() {
  return (
    <svg aria-hidden="true" className="rr-brand-mark" viewBox="0 0 40 40" fill="none">
      <path d="M20 34V20M20 26C14 26 10 22 9 16C15 16 19 19 20 26ZM20 20C20 12 25 7 32 6C32 14 28 19 20 20ZM20 30C25 30 29 27 31 22C25 22 21 25 20 30Z" />
      <circle cx="20" cy="35" r="2" />
    </svg>
  );
}

function ArrowIcon({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg aria-hidden="true" className="rr-arrow-icon" viewBox="0 0 20 20" fill="none">
      {diagonal ? (
        <path d="M5 15 15 5M6 5h9v9" />
      ) : (
        <path d="M3.5 10h12m-5-5 5 5-5 5" />
      )}
    </svg>
  );
}

function TreeArtwork() {
  return (
    <figure className="rr-hero-art">
      <div className="rr-art-glow" aria-hidden="true" />
      <div className="rr-art-orbit rr-art-orbit-one" aria-hidden="true" />
      <div className="rr-art-orbit rr-art-orbit-two" aria-hidden="true" />
      <div className="rr-art-serial" aria-hidden="true">
        <span>ROOTREALM / 001</span>
        <span>THE LIVING TREE</span>
      </div>
      <div className="rr-tree-art">
        <svg
          aria-hidden="true"
          className="rr-tree-svg"
          viewBox="0 0 680 560"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="rr-core-light" cx="0" cy="0" r="1" gradientTransform="translate(340 286) rotate(90) scale(245 245)" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E3A94E" stopOpacity=".2" />
              <stop offset="1" stopColor="#E3A94E" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="340" cy="286" r="245" fill="url(#rr-core-light)" />
          <ellipse className="rr-tree-ring" cx="340" cy="292" rx="218" ry="236" transform="rotate(-14 340 292)" />
          <ellipse className="rr-tree-ring rr-tree-ring-inner" cx="340" cy="292" rx="166" ry="188" transform="rotate(16 340 292)" />
          <path className="rr-tree-branch rr-tree-trunk" pathLength={1} d="M340 523C337 473 355 425 342 379C330 339 349 308 340 270C331 229 344 199 340 126" />
          <path className="rr-tree-branch" pathLength={1} d="M342 387C309 357 293 327 275 300C256 274 226 249 192 239" />
          <path className="rr-tree-branch" pathLength={1} d="M342 356C377 337 402 310 424 282C451 248 477 226 508 213" />
          <path className="rr-tree-branch" pathLength={1} d="M340 310C311 286 298 260 300 229C301 202 280 183 253 170" />
          <path className="rr-tree-branch" pathLength={1} d="M341 274C371 247 391 221 391 190C391 170 411 151 437 139" />
          <path className="rr-tree-branch rr-tree-fine" pathLength={1} d="M275 300C267 273 273 252 260 235C248 219 227 208 207 208" />
          <path className="rr-tree-branch rr-tree-fine" pathLength={1} d="M424 282C424 257 439 242 459 235C477 229 489 224 508 213" />
          <path className="rr-tree-branch rr-tree-fine" pathLength={1} d="M300 229C281 222 267 204 266 184" />
          <path className="rr-tree-branch rr-tree-fine" pathLength={1} d="M391 190C411 187 427 171 430 153" />
          <path className="rr-tree-branch rr-tree-fine" pathLength={1} d="M340 191C322 167 319 147 323 126" />
          <path className="rr-tree-branch rr-tree-fine" pathLength={1} d="M342 431C377 408 394 388 399 359" />
          <path className="rr-tree-branch rr-tree-fine" pathLength={1} d="M340 455C310 432 292 407 290 382" />
          <path className="rr-tree-branch rr-tree-root" pathLength={1} d="M340 515C321 529 301 536 274 538M341 515C361 532 386 537 412 535M340 515C337 536 340 543 340 548" />
          {[
            [340, 126, 7],
            [253, 170, 5],
            [437, 139, 6],
            [192, 239, 7],
            [508, 213, 7],
            [260, 235, 4],
            [459, 235, 4],
            [300, 229, 5],
            [391, 190, 5],
            [399, 359, 4],
            [290, 382, 4],
          ].map(([cx, cy, radius], index) => (
            <g key={index} className={index < 5 ? "rr-tree-node rr-tree-node-lit" : "rr-tree-node"}>
              <circle cx={cx} cy={cy} r={radius + 8} className="rr-node-halo" />
              <circle cx={cx} cy={cy} r={radius} />
              <circle cx={cx} cy={cy} r="1.5" className="rr-node-core" />
            </g>
          ))}
        </svg>
        <div className="rr-tree-core" aria-hidden="true">
          <BrandMark />
          <span>ROOT</span>
          <span>REALM</span>
        </div>
        <span className="rr-skill-tag rr-tag-builder">Builder <i /></span>
        <span className="rr-skill-tag rr-tag-scholar">Scholar <i /></span>
        <span className="rr-skill-tag rr-tag-architect">Architect <i /></span>
        <span className="rr-skill-tag rr-tag-collaborator">Collaborator <i /></span>
        <span className="rr-skill-tag rr-tag-debugger">Debugger <i /></span>
        <span className="rr-skill-tag rr-tag-maintainer">Maintainer <i /></span>
      </div>
      <figcaption className="rr-art-caption">
        <span>Six attributes. Many paths.</span>
        <span className="rr-caption-mark"><i /> Progression is earned</span>
      </figcaption>
    </figure>
  );
}

function ProgressionMap() {
  return (
    <figure className="rr-progression-map rr-reveal">
      <div className="rr-map-topline">
        <span>SKILL TREE / SCHEMATIC</span>
        <span>01 — 06</span>
      </div>
      <svg aria-hidden="true" viewBox="0 0 720 370" fill="none" className="rr-map-svg">
        <path className="rr-map-path rr-map-path-lit" d="M360 319V266C360 226 316 216 280 190C243 164 235 130 192 107" />
        <path className="rr-map-path rr-map-path-lit" d="M360 266C390 234 422 216 451 184C475 158 497 130 528 102" />
        <path className="rr-map-path" d="M280 190C269 164 275 137 268 114C262 94 245 79 220 72" />
        <path className="rr-map-path" d="M451 184C429 155 427 124 435 98C440 83 452 71 471 62" />
        <path className="rr-map-path" d="M360 266C331 235 327 209 333 180C336 158 328 138 311 121" />
        <path className="rr-map-path" d="M360 266C389 240 393 212 389 184C385 157 393 138 410 119" />
        <g className="rr-map-node rr-map-node-root">
          <circle cx="360" cy="319" r="17" />
          <circle cx="360" cy="319" r="5" />
        </g>
        <g className="rr-map-node rr-map-node-lit"><circle cx="360" cy="266" r="10" /><circle cx="360" cy="266" r="3" /></g>
        <g className="rr-map-node rr-map-node-lit"><circle cx="280" cy="190" r="8" /><circle cx="280" cy="190" r="2.5" /></g>
        <g className="rr-map-node"><circle cx="451" cy="184" r="8" /></g>
        <g className="rr-map-node"><circle cx="192" cy="107" r="7" /></g>
        <g className="rr-map-node"><circle cx="528" cy="102" r="7" /></g>
        <g className="rr-map-node"><circle cx="220" cy="72" r="5" /></g>
        <g className="rr-map-node"><circle cx="471" cy="62" r="5" /></g>
        <g className="rr-map-node"><circle cx="311" cy="121" r="5" /></g>
        <g className="rr-map-node"><circle cx="410" cy="119" r="5" /></g>
      </svg>
      <span className="rr-map-label rr-map-label-foundation">Foundation</span>
      <span className="rr-map-label rr-map-label-builder">Builder path</span>
      <span className="rr-map-label rr-map-label-scholar">Scholar path</span>
      <span className="rr-map-label rr-map-label-mastery">Mastery</span>
      <div className="rr-map-legend">
        <span><i className="rr-legend-dot rr-legend-learned" /> Learned</span>
        <span><i className="rr-legend-dot rr-legend-next" /> Next path</span>
        <span><i className="rr-legend-dot rr-legend-locked" /> Locked until earned</span>
      </div>
      <figcaption className="rr-sr-only">A branching skill tree diagram showing foundation, specialized paths, and advanced mastery nodes. Unlocks are based on verified GitHub activity.</figcaption>
    </figure>
  );
}

function AttributeMark({ index }: { index: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="rr-attribute-mark">
      {index === 0 ? <><path d="M16 4 27 10.5V21.5L16 28 5 21.5V10.5L16 4Z" /><path d="M11 19V13L16 10L21 13V19L16 22L11 19Z" /></> : null}
      {index === 1 ? <><path d="M16 4V28M5 10.5 27 21.5M5 21.5 27 10.5" /><circle cx="16" cy="16" r="6" /></> : null}
      {index === 2 ? <><path d="M7 5H25V27H7Z" /><path d="M11 11H21M11 16H21M11 21H18" /></> : null}
      {index === 3 ? <><circle cx="11" cy="11" r="4" /><circle cx="22" cy="12" r="3" /><path d="M3.5 26C4.5 20 8 18 11 18C15 18 18 21 18.5 26M18 19C22.5 18 27.5 20.5 28 25" /></> : null}
      {index === 4 ? <><path d="M6 7H26V25H6Z" /><path d="M10 12H22M10 17H22M10 21H17" /></> : null}
      {index === 5 ? <><path d="M5 26 16 5 27 26H5Z" /><path d="M11 20H21M16 10V16" /></> : null}
    </svg>
  );
}

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    let removeParallax: () => void = () => {};

    const context = gsap.context(() => {
      const entrance = gsap.timeline({ defaults: { ease: "power3.out" } });
      entrance.from(".rr-hero-copy > *", {
        y: 22,
        opacity: 0,
        duration: 0.7,
        stagger: 0.11,
        clearProps: "all",
      });
      entrance.from(".rr-tree-art", {
        y: 18,
        scale: 0.97,
        opacity: 0,
        duration: 1,
        clearProps: "transform,opacity",
      }, "-=0.72");

      gsap.fromTo(".rr-tree-branch", {
        strokeDashoffset: 1,
        opacity: 0.25,
      }, {
        strokeDashoffset: 0,
        opacity: 1,
        duration: 1.4,
        stagger: 0.08,
        delay: 0.25,
        ease: "power2.out",
      });

      gsap.utils.toArray<HTMLElement>(".rr-reveal").forEach((element) => {
        gsap.fromTo(element, {
          autoAlpha: 0,
          y: 24,
        }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.78,
          ease: "power3.out",
          scrollTrigger: {
            trigger: element,
            start: "top 87%",
            once: true,
          },
        });
      });

      const art = root.querySelector<HTMLElement>(".rr-hero-art");
      const tree = root.querySelector<HTMLElement>(".rr-tree-art");
      if (art && tree && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        const handleMove = (event: PointerEvent) => {
          const bounds = art.getBoundingClientRect();
          const x = (event.clientX - bounds.left) / bounds.width - 0.5;
          const y = (event.clientY - bounds.top) / bounds.height - 0.5;
          gsap.to(tree, {
            x: x * 7,
            y: y * 5,
            duration: 0.8,
            ease: "power3.out",
            overwrite: "auto",
          });
        };
        const handleLeave = () => {
          gsap.to(tree, { x: 0, y: 0, duration: 0.9, ease: "power3.out", overwrite: "auto" });
        };
        art.addEventListener("pointermove", handleMove);
        art.addEventListener("pointerleave", handleLeave);
        removeParallax = () => {
          art.removeEventListener("pointermove", handleMove);
          art.removeEventListener("pointerleave", handleLeave);
        };
      }
    }, root);

    return () => {
      removeParallax();
      context.revert();
    };
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="rr-landing-page" ref={rootRef}>
      <div className="rr-ambient" aria-hidden="true">
        {EMBERS.map((ember, index) => (
          <span
            className="rr-ember"
            key={index}
            style={{
              left: ember.x + "%",
              top: ember.y + "%",
              width: ember.size + "px",
              height: ember.size + "px",
              animationDelay: ember.delay + "s",
              animationDuration: ember.duration + "s",
            }}
          />
        ))}
      </div>

      <a className="rr-skip-link" href="#rr-main">Skip to content</a>

      <header className="rr-site-header">
        <div className="rr-shell rr-header-inner">
          <Link className="rr-brand" href="#top" aria-label="RootRealm home" onClick={closeMenu}>
            <BrandMark />
            <span>Root<span>Realm</span></span>
          </Link>

          <nav className="rr-desktop-nav" aria-label="Landing page navigation">
            {NAV_LINKS.map((item) => (
              <a className="rr-nav-link" href={item.href} key={item.href}>{item.label}</a>
            ))}
          </nav>

          <div className="rr-header-actions">
            <Link className="rr-sign-in" href="/api/auth/github">Sign in</Link>
            <Link className="rr-header-cta" href="/preview">Enter Realm <ArrowIcon /></Link>
            <button
              className="rr-menu-button"
              type="button"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              aria-controls="rr-mobile-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>

        <nav
          id="rr-mobile-navigation"
          className={menuOpen ? "rr-mobile-nav is-open" : "rr-mobile-nav"}
          aria-label="Mobile landing page navigation"
          aria-hidden={!menuOpen}
          inert={!menuOpen}
        >
          {NAV_LINKS.map((item) => (
            <a href={item.href} key={item.href} onClick={closeMenu}>{item.label}<ArrowIcon diagonal /></a>
          ))}
          <Link href="/api/auth/github" onClick={closeMenu}>Sign in with GitHub<ArrowIcon diagonal /></Link>
        </nav>
      </header>

      <main id="rr-main">
        <section className="rr-hero" id="top" aria-labelledby="rr-hero-title">
          <div className="rr-shell rr-hero-grid">
            <div className="rr-hero-copy">
              <p className="rr-eyebrow"><span className="rr-eyebrow-dot" /> A DEVELOPER PROGRESSION SYSTEM</p>
              <h1 id="rr-hero-title">Build your skills.<br /><em>Shape your realm.</em></h1>
              <p className="rr-hero-description">
                RootRealm turns real public GitHub activity into a character that grows with your work — through earned skill paths, meaningful achievements, and a realm you can make your own.
              </p>
              <div className="rr-hero-actions">
                <Link className="rr-button rr-button-primary" href="/preview">Enter the Realm <ArrowIcon /></Link>
                <a className="rr-button rr-button-secondary" href="#progression" onClick={closeMenu}>Explore the System <span className="rr-down-mark" aria-hidden="true">↓</span></a>
              </div>
              <div className="rr-proofline">
                <span><i /> Built on public GitHub evidence</span>
                <span>No account needed to explore</span>
              </div>
            </div>

            <TreeArtwork />
          </div>
          <div className="rr-hero-baseline" aria-hidden="true">
            <span>WORK → EVIDENCE → PROGRESSION</span>
            <span>AN OPEN BOOK OF WHAT YOU BUILD</span>
          </div>
        </section>

        <section className="rr-section rr-realm-section" id="the-realm" aria-labelledby="rr-realm-title">
          <div className="rr-shell">
            <div className="rr-section-kicker rr-reveal"><span>01</span><i /> THE REALM</div>
            <div className="rr-realm-grid">
              <h2 id="rr-realm-title" className="rr-section-title rr-reveal">A record of the work.<br /><em>A map of what comes next.</em></h2>
              <div className="rr-realm-copy rr-reveal">
                <p>Most developer profiles show where you have been. RootRealm gives that history shape — translating visible contributions into a character, a set of strengths, and paths you can work toward.</p>
                <p>It is not a fantasy game layered over your life. It is your real development work, organized into a system you can understand and keep growing.</p>
                <Link className="rr-text-link" href="/preview">See a real profile <ArrowIcon /></Link>
              </div>
            </div>

            <div className="rr-evidence-flow rr-reveal" aria-label="How RootRealm turns activity into progression">
              <div className="rr-flow-step"><span>01</span><strong>Public activity</strong><small>Pushes, merges, releases, reviews</small></div>
              <span className="rr-flow-connector" aria-hidden="true">→</span>
              <div className="rr-flow-step"><span>02</span><strong>Verifiable evidence</strong><small>Normalized, explainable signals</small></div>
              <span className="rr-flow-connector" aria-hidden="true">→</span>
              <div className="rr-flow-step"><span>03</span><strong>Progression</strong><small>XP, attributes, skills, milestones</small></div>
            </div>
            <p className="rr-footnote rr-reveal">Public activity is a useful signal, not a complete record of someone's career. RootRealm keeps that distinction visible.</p>
          </div>
        </section>

        <section className="rr-section rr-progression-section" id="progression" aria-labelledby="rr-progression-title">
          <div className="rr-shell">
            <div className="rr-section-kicker rr-reveal"><span>02</span><i /> YOUR PROGRESSION</div>
            <div className="rr-progression-grid">
              <div className="rr-progression-copy">
                <h2 id="rr-progression-title" className="rr-section-title rr-reveal">A skill tree that<br /><em>asks you to earn it.</em></h2>
                <p className="rr-section-description rr-reveal">Every node has prerequisites. Your activity determines which paths are open, what remains locked, and what evidence moves you forward.</p>
                <div className="rr-progression-points rr-reveal">
                  <div><span>01</span><p><strong>Connected paths</strong><small>Skills branch from foundations into focused mastery.</small></p></div>
                  <div><span>02</span><p><strong>Real prerequisites</strong><small>Eligibility is computed from activity, not clicks.</small></p></div>
                  <div><span>03</span><p><strong>Clear evidence</strong><small>See what each path asks you to demonstrate.</small></p></div>
                </div>
                <Link className="rr-text-link" href="/skill-tree">Explore the skill tree <ArrowIcon /></Link>
              </div>
              <ProgressionMap />
            </div>
          </div>
        </section>

        <section className="rr-section rr-character-section" id="character" aria-labelledby="rr-character-title">
          <div className="rr-shell">
            <div className="rr-section-kicker rr-reveal"><span>03</span><i /> BUILD YOUR CHARACTER</div>
            <div className="rr-character-grid">
              <div className="rr-character-copy">
                <h2 id="rr-character-title" className="rr-section-title rr-reveal">Your work has a shape.<br /><em>Give it an identity.</em></h2>
                <p className="rr-section-description rr-reveal">Your profile brings level, XP, six attributes, projects, achievements and current goals into one place. It reflects activity the system can actually observe — not preset stats.</p>
                <Link className="rr-text-link" href="/preview">Preview a developer profile <ArrowIcon /></Link>
              </div>

              <figure className="rr-character-folio rr-reveal">
                <div className="rr-folio-corner rr-folio-corner-tl" aria-hidden="true" />
                <div className="rr-folio-corner rr-folio-corner-tr" aria-hidden="true" />
                <div className="rr-folio-header"><span>CHARACTER FOLIO</span><span>ROOTREALM / ID</span></div>
                <div className="rr-folio-identity">
                  <div className="rr-folio-avatar" aria-hidden="true"><BrandMark /></div>
                  <div><span className="rr-folio-label">YOUR GITHUB IDENTITY</span><h3>Your character</h3><p>Progress, made visible.</p></div>
                  <div className="rr-folio-seal" aria-hidden="true">R</div>
                </div>
                <div className="rr-folio-divider"><span>ATTRIBUTES</span><i /></div>
                <div className="rr-attributes-grid">
                  {ATTRIBUTES.map((attribute, index) => (
                    <div className="rr-attribute" key={attribute.name}>
                      <span className="rr-attribute-symbol"><AttributeMark index={index} /></span>
                      <span className="rr-attribute-name">{attribute.name}</span>
                      <span className="rr-attribute-detail">{attribute.detail}</span>
                    </div>
                  ))}
                </div>
                <figcaption className="rr-folio-foot"><span><i /> Derived from activity</span><span>No sample scores</span></figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="rr-section rr-rewards-section" id="rewards" aria-labelledby="rr-rewards-title">
          <div className="rr-shell">
            <div className="rr-section-kicker rr-reveal"><span>04</span><i /> EARN YOUR PROGRESS</div>
            <div className="rr-rewards-heading">
              <h2 id="rr-rewards-title" className="rr-section-title rr-reveal">Progress you can<br /><em>see, earn, and wear.</em></h2>
              <p className="rr-section-description rr-reveal">Build a trail of achievements, spend earned CodeCoins on cosmetics, and opt into seasonal competition. Different loops, grounded in the same work.</p>
            </div>

            <div className="rr-reward-list">
              <article className="rr-reward-row rr-reveal">
                <div className="rr-reward-index">A / 01</div>
                <div className="rr-reward-sigil rr-sigil-achievement" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M32 5 39 20 56 22 44 34 47 51 32 43 17 51 20 34 8 22 25 20 32 5Z" /><circle cx="32" cy="30" r="8" /><path d="M25 48 22 59 32 54 42 59 39 48" /></svg></div>
                <div className="rr-reward-description"><span className="rr-reward-label">RECOGNITION</span><h3>Achievements with evidence</h3><p>Mark meaningful milestones across shipping, reviewing, documenting and keeping projects alive.</p></div>
                <Link className="rr-round-link" href="/achievements" aria-label="Explore achievements"><ArrowIcon diagonal /></Link>
              </article>
              <article className="rr-reward-row rr-reveal">
                <div className="rr-reward-index">B / 02</div>
                <div className="rr-reward-sigil rr-sigil-currency" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M32 5 51 16V40L32 51 13 40V16L32 5Z" /><path d="M32 16 42 22V34L32 40 22 34V22L32 16Z" /><path d="M32 51V59" /><path d="M24 59H40" /></svg></div>
                <div className="rr-reward-description"><span className="rr-reward-label">CUSTOMIZATION</span><h3>Cosmetics that make it yours</h3><p>Earn CodeCoins, browse frames and other cosmetics, then equip what you own.</p></div>
                <Link className="rr-round-link" href="/shop" aria-label="Explore the shop"><ArrowIcon diagonal /></Link>
              </article>
              <article className="rr-reward-row rr-reveal">
                <div className="rr-reward-index">C / 03</div>
                <div className="rr-reward-sigil rr-sigil-season" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M10 52V38H22V52M26 52V25H38V52M42 52V12H54V52" /><path d="M7 57H57" /><path d="M12 25 25 14 36 19 52 5" /></svg></div>
                <div className="rr-reward-description"><span className="rr-reward-label">SEASONAL PLAY</span><h3>Competition on your terms</h3><p>Opt into a season leaderboard where rank points are separate from permanent XP.</p></div>
                <Link className="rr-round-link" href="/leaderboard" aria-label="Explore the leaderboard"><ArrowIcon diagonal /></Link>
              </article>
            </div>
          </div>
        </section>

        <section className="rr-final-cta" aria-labelledby="rr-final-title">
          <div className="rr-final-ornament" aria-hidden="true"><span /><span /><span /></div>
          <div className="rr-shell rr-final-inner rr-reveal">
            <p className="rr-eyebrow"><span className="rr-eyebrow-dot" /> YOUR NEXT CHAPTER</p>
            <h2 id="rr-final-title">The work is already yours.<br /><em>Give it a realm.</em></h2>
            <p>Start with a GitHub username. Meet the character your public work describes — no account required.</p>
            <div className="rr-final-actions">
              <Link className="rr-button rr-button-primary" href="/preview">Enter the Realm <ArrowIcon /></Link>
              <Link className="rr-button rr-button-secondary" href="/api/auth/github">Claim your identity <ArrowIcon /></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="rr-footer">
        <div className="rr-shell rr-footer-inner">
          <Link className="rr-brand rr-footer-brand" href="#top">
            <BrandMark /><span>Root<span>Realm</span></span>
          </Link>
          <p>Built from public evidence. Always honest about what it can see.</p>
          <nav aria-label="Footer navigation">
            <Link href="/preview">Profile preview</Link>
            <Link href="/skill-tree">Skill tree</Link>
            <Link href="/shop">Shop</Link>
          </nav>
          <span className="rr-footer-mark">RR / 2026</span>
        </div>
      </footer>
    </div>
  );
}
