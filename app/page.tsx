import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { accountFromCookieHeader } from "@/lib/auth/guard";

/*
 * RootRealm landing — polished standalone landing page.
 *
 * The full polished design is embedded as JSX so it lives inside the
 * application's layout (CSP nonce from proxy.ts applies correctly) while
 * preserving its standalone aesthetic and interactive behaviour.
 *
 * Assets (CSS / JS / SVG) are served from /landing/* and loaded normally.
 * Every authentication CTA points at the login wall before the landing script
 * enhances the page.
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  const account = await accountFromCookieHeader((await cookies()).toString());

  if (account !== null) {
    redirect("/home");
  }

  return (
    <>
      <title>RootRealm — Your code builds your realm</title>
      <link
        rel="icon"
        href="/landing/images/sigil.svg"
        type="image/svg+xml"
      />

      {/* The landing CSS is standalone and does not rely on the app's token layer. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/landing/css/style.css" />

      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="nav" id="top">
        <div className="nav__inner">
          <a className="brand" href="#top" aria-label="RootRealm home">
            <svg
              className="sigil"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="1.5" y="1.5" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 19V12M12 12L6.5 7M12 12L17.5 7" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <rect x="4.5" y="5" width="4" height="4" className="sigil__node" />
              <rect x="15.5" y="5" width="4" height="4" className="sigil__node" />
              <rect x="10.5" y="17.5" width="3" height="3" fill="currentColor" />
            </svg>
            <span className="brand__word">RootRealm</span>
          </a>

          <nav className="nav__links" aria-label="Primary">
            <a href="#product">Product</a>
            <a href="#progression">Progression</a>
            <a href="#features">Features</a>
          </nav>

          <div className="nav__actions">
            <a
              className="btn btn--primary btn--sm"
              href="/login"
              data-auth="/login"
              aria-label="Continue with GitHub - opens login page"
            >
              <svg className="gh" viewBox="0 0 16 16" aria-hidden="true">
                <use href="#gh-mark" />
              </svg>
              <span>Continue with GitHub</span>
            </a>
            <button
              className="nav__toggle"
              type="button"
              aria-expanded="false"
              aria-controls="mobile-menu"
              aria-label="Open menu"
            >
              <span></span>
              <span></span>
            </button>
          </div>
        </div>

        <div className="mobile-menu" id="mobile-menu" hidden>
          <nav aria-label="Mobile">
            <a href="#product">
              <span className="idx">01</span>Product
            </a>
            <a href="#progression">
              <span className="idx">02</span>Progression
            </a>
            <a href="#features">
              <span className="idx">03</span>Features
            </a>
            <a href="#evidence">
              <span className="idx">04</span>Evidence &amp; scoring
            </a>
          </nav>
          <a className="btn btn--primary btn--block" href="/login" data-auth="/login">
            Continue with GitHub
          </a>
        </div>
      </header>

      <main id="main">
        {/* ============ HERO ============ */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="wrap hero__grid">
            <div className="hero__copy">
              <p className="eyebrow enter" style={{ "--d": 0 } as React.CSSProperties}>
                <span className="eyebrow__tick"></span>Developer progression from GitHub activity
              </p>
              <h1 id="hero-title" className="hero__title enter" style={{ "--d": 1 } as React.CSSProperties}>
                Your code<br />builds your <em>realm.</em>
              </h1>
              <p className="hero__lede enter" style={{ "--d": 2 } as React.CSSProperties}>
                Turn your GitHub activity into developer progression. Earn XP, develop your attributes, unlock skills, and build a profile that reflects your journey.
              </p>
              <div className="hero__ctas enter" style={{ "--d": 3 } as React.CSSProperties}>
                <a className="btn btn--primary" href="/login" data-auth="/login">
                  <svg className="gh" viewBox="0 0 16 16" aria-hidden="true">
                    <use href="#gh-mark" />
                  </svg>
                  Continue with GitHub
                </a>
                <a className="btn btn--ghost" href="#progression">Explore progression <span className="arrow" aria-hidden="true">→</span></a>
              </div>
              <dl className="hero__meta enter" style={{ "--d": 4 } as React.CSSProperties}>
                <div><dt>Source</dt><dd>Commits · PRs · Issues · Reviews</dd></div>
                <div><dt>Attributes</dt><dd>6</dd></div>
                <div><dt>Scoring</dt><dd>Versioned rules</dd></div>
              </dl>
            </div>

            {/* Product preview: profile panel */}
            <figure className="preview enter" style={{ "--d": 2 } as React.CSSProperties} aria-label="Preview of a RootRealm profile panel using sample data">
              <div className="panel">
                <div className="panel__bar">
                  <span className="panel__path">rootrealm / profile</span>
                  <span className="tag tag--muted">Sample data</span>
                </div>
                <div className="profile">
                  <div className="avatar" data-frame="bracket" id="hero-avatar">
                    <svg className="avatar__img" viewBox="0 0 5 5" aria-hidden="true" shapeRendering="crispEdges">
                      <rect width="5" height="5" fill="#1B1D22" />
                      <g fill="#B49AF7">
                        <rect x="0" y="1" width="1" height="1" /><rect x="4" y="1" width="1" height="1" />
                        <rect x="1" y="0" width="1" height="1" /><rect x="3" y="0" width="1" height="1" />
                        <rect x="2" y="2" width="1" height="1" />
                        <rect x="1" y="3" width="1" height="1" /><rect x="3" y="3" width="1" height="1" />
                        <rect x="0" y="4" width="1" height="1" /><rect x="4" y="4" width="1" height="1" />
                        <rect x="2" y="4" width="1" height="1" />
                      </g>
                    </svg>
                    <svg className="avatar__frame" viewBox="0 0 100 100" aria-hidden="true"><use href="#frame-bracket" /></svg>
                  </div>
                  <div className="profile__id">
                    <p className="profile__handle">@your-handle</p>
                    <p className="profile__title">Builder · Collaborator</p>
                  </div>
                  <div className="profile__level">
                    <span className="label">Level</span>
                    <span className="profile__lvl">14</span>
                  </div>
                </div>
                <div className="xp">
                  <div className="xp__row">
                    <span className="label">XP to level 15</span>
                    <span className="mono">2,340 / 3,000</span>
                  </div>
                  <div className="meter" role="img" aria-label="78 percent of the way to the next level">
                    <span className="meter__fill" style={{ "--v": ".78" } as React.CSSProperties}></span>
                    <svg className="meter__ticks" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
                      <line x1="10" y1="0" x2="10" y2="8" /><line x1="20" y1="0" x2="20" y2="8" />
                      <line x1="30" y1="0" x2="30" y2="8" /><line x1="40" y1="0" x2="40" y2="8" />
                      <line x1="50" y1="0" x2="50" y2="8" /><line x1="60" y1="0" x2="60" y2="8" />
                      <line x1="70" y1="0" x2="70" y2="8" /><line x1="80" y1="0" x2="80" y2="8" />
                      <line x1="90" y1="0" x2="90" y2="8" />
                    </svg>
                  </div>
                </div>
                <ul className="attrs" aria-label="Attributes">
                  <li><span className="attrs__k">Builder</span><span className="attrs__bar"><i style={{ "--v": ".82" } as React.CSSProperties}></i></span><span className="attrs__v">Lv 9</span></li>
                  <li><span className="attrs__k">Debugger</span><span className="attrs__bar"><i style={{ "--v": ".46" } as React.CSSProperties}></i></span><span className="attrs__v">Lv 5</span></li>
                  <li><span className="attrs__k">Scholar</span><span className="attrs__bar"><i style={{ "--v": ".30" } as React.CSSProperties}></i></span><span className="attrs__v">Lv 3</span></li>
                  <li><span className="attrs__k">Collaborator</span><span className="attrs__bar"><i style={{ "--v": ".68" } as React.CSSProperties}></i></span><span className="attrs__v">Lv 7</span></li>
                  <li><span className="attrs__k">Maintainer</span><span className="attrs__bar"><i style={{ "--v": ".38" } as React.CSSProperties}></i></span><span className="attrs__v">Lv 4</span></li>
                  <li><span className="attrs__k">Architect</span><span className="attrs__bar"><i style={{ "--v": ".22" } as React.CSSProperties}></i></span><span className="attrs__v">Lv 2</span></li>
                </ul>
              </div>
              <div className="log" aria-label="Recent evidence (sample)">
                <p className="log__head"><span className="label">Recent evidence</span><span className="dot" aria-hidden="true"></span></p>
                <ol>
                  <li><span className="log__ev">pull_request.merged</span><span className="log__xp">+120 XP</span><span className="log__attr">Builder</span></li>
                  <li><span className="log__ev">review.submitted</span><span className="log__xp">+45 XP</span><span className="log__attr">Collaborator</span></li>
                  <li><span className="log__ev">issue.closed</span><span className="log__xp">+30 XP</span><span className="log__attr">Debugger</span></li>
                </ol>
              </div>
              <figcaption className="sr-only">Illustrative profile showing level, XP progress, six attribute levels and recent evidence entries. Values are sample data, not a real user.</figcaption>
            </figure>
          </div>
        </section>

        {/* ============ PRODUCT: ACTIVITY → EVIDENCE → PROGRESSION ============ */}
        <section className="product" id="product" aria-labelledby="product-title">
          <div className="wrap">
            <header className="sec-head reveal">
              <span className="sec-head__idx">01 / Product</span>
              <h2 id="product-title">Activity becomes evidence.<br />Evidence becomes progression.</h2>
              <p>Supported GitHub events are normalized into structured evidence records, evaluated by versioned scoring rules, and translated into XP and attribute progress. Pick an event to follow it through the pipeline.</p>
            </header>
            <div className="flow reveal" id="flow">
              <div className="flow__stage">
                <p className="flow__label"><span className="flow__n">A</span>Activity</p>
                <div className="flow__events" role="radiogroup" aria-label="GitHub event">
                  <button type="button" role="radio" aria-checked="true" data-event="pr">Pull request merged</button>
                  <button type="button" role="radio" aria-checked="false" data-event="commit">Commits pushed</button>
                  <button type="button" role="radio" aria-checked="false" data-event="review">Review submitted</button>
                  <button type="button" role="radio" aria-checked="false" data-event="issue">Issue closed</button>
                </div>
                <p className="flow__note">From repositories you connect. Unsupported events are ignored, not guessed at.</p>
              </div>
              <div className="flow__link" aria-hidden="true"><span></span></div>
              <div className="flow__stage flow__stage--evidence">
                <p className="flow__label"><span className="flow__n">B</span>Evidence</p>
                <pre className="record" aria-live="polite"><code id="flow-record">{`{\n  source: "github",\n  type: "pull_request.merged",\n  repo: "you/project",\n  ref: "#482",\n  signals: { files: 9, reviewed: true },\n  rule_set: "v1"\n}`}</code></pre>
                <p className="flow__note">One normalized record per event. Each is traceable back to its GitHub source.</p>
              </div>
              <div className="flow__link" aria-hidden="true"><span></span></div>
              <div className="flow__stage">
                <p className="flow__label"><span className="flow__n">C</span>Progression</p>
                <div className="result" aria-live="polite">
                  <p className="result__xp"><span id="flow-xp">+120</span><small>XP</small></p>
                  <ul className="result__attrs" id="flow-attrs">
                    <li><span>Builder</span><span>+80 XP</span></li>
                    <li><span>Collaborator</span><span>+40 XP</span></li>
                  </ul>
                  <p className="result__rule mono">rule <span id="flow-rule">pr.merged</span> · <span className="tag tag--accent">v1</span></p>
                </div>
                <p className="flow__note">Values shown are illustrative. Actual weights live in the active rule set.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ SKILL PROGRESSION ============ */}
        <section className="skills" id="progression" aria-labelledby="skills-title">
          <div className="wrap skills__grid">
            <div className="skills__intro reveal">
              <span className="sec-head__idx">02 / Progression</span>
              <h2 id="skills-title">Six attributes.<br />One tree each.</h2>
              <p>Attribute XP unlocks nodes along a branching path. Every node has a parent requirement, and capstones ask for depth in more than one branch — so the tree reflects how you actually work, not a single number.</p>
              <div className="attr-tabs" role="tablist" aria-label="Attributes">
                <button role="tab" type="button" aria-selected="true" data-attr="builder"><span className="attr-tabs__i">01</span>Builder</button>
                <button role="tab" type="button" aria-selected="false" data-attr="debugger" tabIndex={-1}><span className="attr-tabs__i">02</span>Debugger</button>
                <button role="tab" type="button" aria-selected="false" data-attr="scholar" tabIndex={-1}><span className="attr-tabs__i">03</span>Scholar</button>
                <button role="tab" type="button" aria-selected="false" data-attr="collaborator" tabIndex={-1}><span className="attr-tabs__i">04</span>Collaborator</button>
                <button role="tab" type="button" aria-selected="false" data-attr="maintainer" tabIndex={-1}><span className="attr-tabs__i">05</span>Maintainer</button>
                <button role="tab" type="button" aria-selected="false" data-attr="architect" tabIndex={-1}><span className="attr-tabs__i">06</span>Architect</button>
              </div>
            </div>
            <div className="tree reveal" role="tabpanel" id="tree-panel" aria-label="Skill tree preview">
              <div className="tree__bar">
                <span className="panel__path">skill-tree / <b id="tree-attr">builder</b></span>
                <ul className="legend" aria-label="Legend">
                  <li><i className="lg lg--on"></i>Unlocked</li>
                  <li><i className="lg lg--av"></i>Available</li>
                  <li><i className="lg lg--off"></i>Locked</li>
                </ul>
              </div>
              <div className="tree__canvas">
                <svg id="tree-svg" viewBox="0 0 640 340" role="group" aria-label="Skill tree nodes"></svg>
              </div>
              <div className="tree__detail" aria-live="polite">
                <div>
                  <p className="label" id="node-state">Unlocked</p>
                  <p className="tree__name" id="node-name">First Commit</p>
                </div>
                <p className="tree__desc" id="node-desc">Push your first tracked commit.</p>
                <p className="tree__req mono" id="node-req">Requires —</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section className="features" id="features" aria-labelledby="features-title">
          <div className="wrap">
            <header className="sec-head sec-head--row reveal">
              <span className="sec-head__idx">03 / Features</span>
              <h2 id="features-title">What you build along the way.</h2>
            </header>
            <article className="feat feat--profile reveal">
              <div className="feat__text">
                <p className="feat__k">Profile &amp; progression</p>
                <h3>A profile that shows the shape of your work.</h3>
                <p>Your level, XP and six attribute levels sit together on one page. Someone who reviews heavily and someone who ships features look different — on purpose.</p>
              </div>
              <div className="radar" aria-hidden="true">
                <svg viewBox="-36 0 332 244">
                  <g className="radar__grid" fill="none" stroke="#2B2E35">
                    <polygon points="130,20 225,75 225,165 130,220 35,165 35,75" />
                    <polygon points="130,60 190,95 190,145 130,180 70,145 70,95" />
                    <path d="M130 20V220M35 75L225 165M225 75L35 165" />
                  </g>
                  <polygon className="radar__shape" points="130,38 203,88 186,152 130,162 92,142 85,94" />
                  <g className="radar__labels" fontSize="9">
                    <text x="130" y="12" textAnchor="middle">BUILDER</text>
                    <text x="232" y="72">DEBUGGER</text>
                    <text x="232" y="172">SCHOLAR</text>
                    <text x="130" y="236" textAnchor="middle">COLLAB.</text>
                    <text x="28" y="172" textAnchor="end">MAINT.</text>
                    <text x="28" y="72" textAnchor="end">ARCHITECT</text>
                  </g>
                </svg>
              </div>
            </article>

            <div className="feat-split">
              <article className="feat feat--ach reveal">
                <p className="feat__k">Achievements</p>
                <h3>Milestones, recorded.</h3>
                <p>Achievements mark specific, checkable moments — each one tied to the evidence that earned it.</p>
                <ol className="ledger">
                  <li className="is-earned"><span className="ledger__glyph" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 2l8 8-8 8-8-8z" /></svg></span><span className="ledger__name">First Merge</span><span className="ledger__crit">1 merged pull request</span><span className="ledger__s">Earned</span></li>
                  <li className="is-earned"><span className="ledger__glyph" aria-hidden="true"><svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" /></svg></span><span className="ledger__name">Second Opinion</span><span className="ledger__crit">10 reviews submitted</span><span className="ledger__s">Earned</span></li>
                  <li><span className="ledger__glyph" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 2l8 14H2z" /></svg></span><span className="ledger__name">Closer</span><span className="ledger__crit">25 issues closed</span><span className="ledger__s mono">18 / 25</span></li>
                  <li><span className="ledger__glyph" aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" /></svg></span><span className="ledger__name">Long Haul</span><span className="ledger__crit">Activity in 12 separate weeks</span><span className="ledger__s mono">7 / 12</span></li>
                </ol>
              </article>

              <article className="feat feat--cos reveal">
                <p className="feat__k">Cosmetics &amp; customization</p>
                <h3>Make the profile yours.</h3>
                <p>Avatar frames and profile cosmetics are purely visual. They never change how activity is scored.</p>
                <div className="frames">
                  <div className="frames__stage">
                    <div className="avatar avatar--lg" data-frame="bracket" id="cos-avatar">
                      <svg className="avatar__img" viewBox="0 0 5 5" aria-hidden="true" shapeRendering="crispEdges">
                        <rect width="5" height="5" fill="#1B1D22" />
                        <g fill="#B49AF7">
                          <rect x="0" y="1" width="1" height="1" /><rect x="4" y="1" width="1" height="1" />
                          <rect x="1" y="0" width="1" height="1" /><rect x="3" y="0" width="1" height="1" />
                          <rect x="2" y="2" width="1" height="1" />
                          <rect x="1" y="3" width="1" height="1" /><rect x="3" y="3" width="1" height="1" />
                          <rect x="0" y="4" width="1" height="1" /><rect x="4" y="4" width="1" height="1" />
                          <rect x="2" y="4" width="1" height="1" />
                        </g>
                      </svg>
                      <svg className="avatar__frame" viewBox="0 0 100 100" aria-hidden="true"><use href="#frame-bracket" /></svg>
                    </div>
                    <p className="frames__name mono" id="frame-name">Frame · Bracket</p>
                  </div>
                  <div className="frames__list" role="radiogroup" aria-label="Avatar frame">
                    <button type="button" role="radio" aria-checked="false" data-frame="plain" aria-label="Plain frame"><svg viewBox="0 0 100 100"><use href="#frame-plain" /></svg></button>
                    <button type="button" role="radio" aria-checked="true" data-frame="bracket" aria-label="Bracket frame"><svg viewBox="0 0 100 100"><use href="#frame-bracket" /></svg></button>
                    <button type="button" role="radio" aria-checked="false" data-frame="notch" aria-label="Notch frame"><svg viewBox="0 0 100 100"><use href="#frame-notch" /></svg></button>
                    <button type="button" role="radio" aria-checked="false" data-frame="circuit" aria-label="Circuit frame"><svg viewBox="0 0 100 100"><use href="#frame-circuit" /></svg></button>
                  </div>
                </div>
              </article>
            </div>

            <article className="feat feat--quests reveal">
              <div className="feat__text">
                <p className="feat__k">Quests &amp; seasons</p>
                <h3>Optional goals, if you want them.</h3>
                <p>Quests are opt-in objectives with rewards. Ignore them and your progression still counts the same.</p>
              </div>
              <table className="quests">
                <caption className="sr-only">Example quests and season status</caption>
                <thead><tr><th scope="col">Quest</th><th scope="col">Objective</th><th scope="col">Reward</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  <tr><td>Review Rotation</td><td>Submit 5 pull request reviews</td><td>Collaborator XP</td><td><span className="status status--ok">Available</span></td></tr>
                  <tr><td>Clean Slate</td><td>Close 3 issues you opened</td><td>Debugger XP</td><td><span className="status status--ok">Available</span></td></tr>
                  <tr><td>Seasonal track</td><td>Time-boxed progression with season rewards</td><td>Season cosmetics</td><td><span className="status status--plan">Planned</span></td></tr>
                </tbody>
              </table>
            </article>
          </div>
        </section>

        {/* ============ EVIDENCE & SCORING ============ */}
        <section className="evidence" id="evidence" aria-labelledby="evidence-title">
          <div className="wrap evidence__grid">
            <div className="reveal">
              <span className="sec-head__idx">04 / Evidence &amp; scoring</span>
              <h2 id="evidence-title">Rules, not judgments.</h2>
              <p className="evidence__lede">Progression comes from structured evidence and explicit scoring rules. There is no model deciding whether your code is “good”.</p>
            </div>
            <dl className="principles reveal">
              <div><dt><span className="mono">01</span>Consistent</dt><dd>The same event under the same rule version always yields the same result.</dd></div>
              <div><dt><span className="mono">02</span>Traceable</dt><dd>Every XP change points back to an evidence record and the GitHub event behind it.</dd></div>
              <div><dt><span className="mono">03</span>Versioned</dt><dd>Scoring rules carry a version. When rules change, the version changes with them.</dd></div>
              <div className="principles__not"><dt><span className="mono">!=</span>Not a rating</dt><dd>RootRealm measures recorded activity for game mechanics. It does not measure programming ability or a developer&apos;s worth.</dd></div>
            </dl>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="closing" id="get-started" aria-labelledby="closing-title">
          <div className="wrap closing__grid reveal">
            <svg className="closing__mark" viewBox="0 0 120 120" aria-hidden="true">
              <rect x="4" y="4" width="112" height="112" fill="none" stroke="#2B2E35" strokeWidth="1.5" />
              <path className="draw" d="M60 100V60M60 60L30 32M60 60L90 32" fill="none" stroke="#B49AF7" strokeWidth="2" />
              <rect x="22" y="24" width="16" height="16" fill="#131518" stroke="#B49AF7" strokeWidth="2" />
              <rect x="82" y="24" width="16" height="16" fill="#B49AF7" />
              <rect x="54" y="94" width="12" height="12" fill="#F1F1F4" />
            </svg>
            <div>
              <h2 id="closing-title">Build your realm.</h2>
              <p>Connect GitHub and start from level one. Your existing work is where the tree begins.</p>
            </div>
            <div className="closing__cta">
              <a className="btn btn--primary btn--lg" href="/login" data-auth="/login">
                <svg className="gh" viewBox="0 0 16 16" aria-hidden="true"><use href="#gh-mark" /></svg>
                Continue with GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer__inner">
          <a className="brand brand--sm" href="#top" aria-label="RootRealm, back to top">
            <svg className="sigil" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="1.5" y="1.5" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 19V12M12 12L6.5 7M12 12L17.5 7" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <rect x="4.5" y="5" width="4" height="4" className="sigil__node" />
              <rect x="15.5" y="5" width="4" height="4" className="sigil__node" />
              <rect x="10.5" y="17.5" width="3" height="3" fill="currentColor" />
            </svg>
            <span className="brand__word">RootRealm</span>
          </a>
          <nav className="footer__links" aria-label="Footer">
            <a href="#product">Product</a>
            <a href="#progression">Progression</a>
            <a href="#features">Features</a>
            <a href="#evidence">Evidence &amp; scoring</a>
          </nav>
          <p className="footer__note mono">Not affiliated with GitHub, Inc.</p>
        </div>
      </footer>

      <div className="toast" id="toast" role="status" aria-live="polite" hidden></div>

      {/* Shared SVG symbols */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <symbol id="gh-mark" viewBox="0 0 16 16"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></symbol>
          <symbol id="frame-plain" viewBox="0 0 100 100"><rect x="3" y="3" width="94" height="94" fill="none" stroke="#2B2E35" strokeWidth="3" /></symbol>
          <symbol id="frame-bracket" viewBox="0 0 100 100"><rect x="3" y="3" width="94" height="94" fill="none" stroke="#2B2E35" strokeWidth="2" /><path d="M3 24V3h21M76 3h21v21M97 76v21H76M24 97H3V76" fill="none" stroke="#B49AF7" strokeWidth="4" /></symbol>
          <symbol id="frame-notch" viewBox="0 0 100 100"><path d="M16 3H84L97 16V84L84 97H16L3 84V16Z" fill="none" stroke="#B49AF7" strokeWidth="3" /><path d="M44 3h12M44 97h12" stroke="#F1F1F4" strokeWidth="5" /></symbol>
          <symbol id="frame-circuit" viewBox="0 0 100 100"><rect x="3" y="3" width="94" height="94" fill="none" stroke="#B49AF7" strokeWidth="2" /><path d="M3 30h8v20M97 70h-8V50M30 97v-8h20M70 3v8H50" fill="none" stroke="#B49AF7" strokeWidth="2" /><rect x="8" y="47" width="6" height="6" fill="#B49AF7" /><rect x="86" y="47" width="6" height="6" fill="#B49AF7" /><rect x="47" y="86" width="6" height="6" fill="#F1F1F4" /><rect x="47" y="8" width="6" height="6" fill="#F1F1F4" /></symbol>
        </defs>
      </svg>

      {/* The landing script uses /login as its safe auth fallback. */}
      <script src="/landing/js/main.js" defer></script>
    </>
  );
}
