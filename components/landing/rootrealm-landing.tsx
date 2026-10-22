import Link from "next/link";
import type { CSSProperties } from "react";

import { Reveal } from "../motion/reveal";

import styles from "./rootrealm-landing.module.css";

const branches = [
  ["Builder", "Turn ideas into working software, then ship and iterate.", "Merged work and releases", "builder"],
  ["Debugger", "Trace failures to their source and validate the fix.", "Fixes that close real issues", "debugger"],
  ["Scholar", "Explore unfamiliar tools and turn knowledge into practice.", "New tools explored and written up", "scholar"],
  ["Architect", "Connect decisions into systems that stay understandable as they grow.", "Structure that holds as it scales", "architect"],
  ["Maintainer", "Keep projects dependable through documentation and care.", "Documentation and upkeep", "maintainer"],
  ["Collaborator", "Review work, share context, and make teams more effective.", "Reviews and shared context", "collaborator"],
] as const;

function Mark({ className = "" }: { className?: string }) {
  return (
    <svg className={`${styles.mark} ${className}`} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2.5 29 10v12L16 29.5 3 22V10Z" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M16 25V15.5M16 18.5 9.5 13M16 18.5 22.5 13M9.5 13V8.5M22.5 13V8.5" fill="none" stroke="var(--color-accent)" strokeWidth="1.55" strokeLinecap="round" />
      <circle cx="16" cy="15.5" r="2.1" fill="var(--color-accent)" />
      <circle cx="9.5" cy="8.5" r="1.6" fill="currentColor" />
      <circle cx="22.5" cy="8.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

function BranchEmblem({ branch }: { branch: (typeof branches)[number][3] }) {
  const paths = {
    builder: <path d="M30 54 54 30M38 30h16v16" strokeWidth="2.4" />,
    debugger: <path d="M32 33h20v22H32zM37 26v7m10-7v7M25 40h7m20 0h7M25 48h7m20 0h7M37 55v7m10-7v7" strokeWidth="2.2" />,
    scholar: <path d="M26 31q8-4 16 2 8-6 16-2v24q-8-4-16 2-8-6-16-2ZM42 33v24" strokeWidth="2.2" />,
    architect: <path d="m42 24 15 8.5v17L42 58l-15-8.5v-17ZM27 32.5l15 8.5 15-8.5M42 41v17" strokeWidth="2.2" />,
    maintainer: <><circle cx="42" cy="42" r="8" strokeWidth="2.2" /><path d="M42 24v6m0 24v6M24 42h6m24 0h6M29 29l4 4m18 18 4 4m0-26-4 4m-18 18-4 4" strokeWidth="2.2" /></>,
    collaborator: <><circle cx="34" cy="36" r="6" strokeWidth="2.2" /><circle cx="52" cy="36" r="6" strokeWidth="2.2" /><path d="M23 56q11-14 22 0M41 56q11-14 22 0" strokeWidth="2.2" /></>,
  };

  return (
    <svg className={styles.emblem} viewBox="0 0 84 84" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M42 4 76 23v38L42 80 8 61V23Z" opacity=".55" />
      <path d="M42 11 70 27v30L42 73 14 57V27Z" opacity=".25" />
      {paths[branch]}
    </svg>
  );
}

function Radar() {
  return (
    <svg className={styles.radar} viewBox="0 0 400 400" role="img" aria-label="Radar chart of six RootRealm attributes">
      <g fill="none" stroke="var(--color-border)">
        <path d="M200 60 321 130v140L200 340 79 270V130Z" />
        <path d="M200 100 286 150v100L200 300 114 250V150Z" />
        <path d="M200 140 252 170v60L200 260 148 230V170Z" />
        <path d="M200 60V340M79 130 321 270M321 130 79 270" stroke="var(--color-surface-secondary)" />
      </g>
      <path className={styles.radarShape} d="M200 84 300 142 292 254 200 316 108 254 100 142Z" fill="var(--color-state-selected)" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="200" cy="84" r="5" fill="var(--color-branch-builder)" />
      <circle cx="300" cy="142" r="5" fill="var(--color-branch-debugger)" />
      <circle cx="292" cy="254" r="5" fill="var(--color-branch-scholar)" />
      <circle cx="200" cy="316" r="5" fill="var(--color-branch-architect)" />
      <circle cx="108" cy="254" r="5" fill="var(--color-branch-collaborator)" />
      <circle cx="100" cy="142" r="5" fill="var(--color-branch-maintainer)" />
      <circle cx="200" cy="200" r="4" fill="var(--color-text-primary)" />
      {[
        ["Builder", "200", "40"], ["Debugger", "348", "128"], ["Scholar", "348", "285"],
        ["Architect", "200", "372"], ["Collaborator", "52", "285"], ["Maintainer", "52", "128"],
      ].map(([label, x, y]) => <text key={label} x={x} y={y}>{label}</text>)}
    </svg>
  );
}

type HeroTreeSegment = {
  d: string;
  color: string;
  width: number;
  opacity: number;
  delay: number;
};

type HeroTreeTip = {
  x: number;
  y: number;
  color: string;
  delay: number;
};

function createHeroTree() {
  const center = 500;
  const horizon = 290;
  const top = 236;
  const segments: HeroTreeSegment[] = [];
  const tips: HeroTreeTip[] = [];

  const transform = (x: number, y: number, sx: number, sy: number) => ({
    x: center + sx * (x - center),
    y: sy > 0 ? y : 2 * horizon - y,
  });

  const addSegment = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    qx: number,
    qy: number,
    width: number,
    color: string,
    delay: number,
    opacity: number,
  ) => {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const start = transform(x1, y1, sx, sy);
      const control = transform(qx, qy, sx, sy);
      const end = transform(x2, y2, sx, sy);
      segments.push({
        d: `M${start.x} ${start.y}Q${control.x} ${control.y} ${end.x} ${end.y}`,
        color,
        width,
        opacity: sy < 0 ? opacity * 0.5 : opacity,
        delay: delay + (sy < 0 ? 3 : 0),
      });
    }
  };

  const addTip = (x: number, y: number, color: string, delay: number) => {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const point = transform(x, y, sx, sy);
      tips.push({ x: point.x, y: point.y, color, delay: delay + (sy < 0 ? 3 : 0) });
    }
  };

  const grow = (x: number, y: number, angle: number, length: number, depth: number, color: string, delay: number) => {
    const x2 = x + Math.sin(angle) * length;
    const y2 = y - Math.cos(angle) * length;
    const qx = x + Math.sin(angle - 0.14) * length * 0.55;
    const qy = y - Math.cos(angle - 0.14) * length * 0.55;
    addSegment(x, y, x2, y2, qx, qy, Math.max(0.9, 2.6 - depth * 0.42), color, delay, 0.95);

    if (depth > 0) {
      grow(x2, y2, angle - 0.5, length * 0.74, depth - 1, color, delay + 1);
      grow(x2, y2, angle + 0.5, length * 0.74, depth - 1, color, delay + 1);
    } else {
      addTip(x2, y2, color, delay + 1);
    }
  };

  addSegment(center, horizon, center, top, center, (horizon + top) / 2, 3.4, "var(--color-accent)", 0, 1);
  [
    [0.42, "var(--color-branch-scholar)"],
    [1, "var(--color-branch-debugger)"],
    [1.5, "var(--color-branch-builder)"],
  ].forEach(([angle, color], index) => grow(center, top, Number(angle), 72, 4, String(color), index + 1));

  return { segments, tips };
}

const HERO_TREE = createHeroTree();

function HeroTree() {
  return (
    <svg className={styles.tree} viewBox="0 0 1000 580" role="img" aria-label="A symmetrical tree. Branches above a horizon line mirror roots below it.">
      {HERO_TREE.segments.map((segment, index) => (
        <path
          key={`segment-${index}`}
          className={styles.treeBranch}
          d={segment.d}
          pathLength={1}
          stroke={segment.color}
          strokeWidth={segment.width}
          opacity={segment.opacity}
          style={{ "--branch-delay": `${segment.delay * 170 + 150}ms` } as CSSProperties}
        />
      ))}
      {HERO_TREE.tips.map((tip, index) => (
        <circle
          key={`tip-${index}`}
          className={styles.treeTip}
          cx={tip.x}
          cy={tip.y}
          r="2.6"
          fill={tip.color}
          opacity={tip.y < 290 ? 1 : 0.5}
          style={{ "--tip-delay": `${tip.delay * 170 + 900}ms` } as CSSProperties}
        />
      ))}
      <path className={styles.horizon} d="M40 290H455M545 290H960" />
      <path d="M500 281l9 9-9 9-9-9Z" fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth="1.5" />
      <circle cx="500" cy="290" r="2.6" fill="var(--color-accent)" />
    </svg>
  );
}

function SectionHeading({ id, title, intro }: { id: string; title: string; intro: string }) {
  return (
    <div className={styles.head}>
      <h2 id={id}>{title}</h2>
      <p className={styles.intro}>{intro}</p>
    </div>
  );
}

export function RootRealmLanding() {
  return (
    <div className={`${styles.landingRoot} landingRoot`}>
      <header className={styles.siteHeader}>
        <div className={styles.wrap}>
          <nav className={styles.navSide} aria-label="Landing navigation">
            <Link href="#system">The system</Link>
            <Link href="#skill-tree">Skill tree</Link>
          </nav>
          <Link className={styles.brand} href="#top" aria-label="RootRealm home"><Mark />RootRealm</Link>
          <nav className={styles.navSide} aria-label="Landing secondary navigation">
            <Link href="#profile">Profile</Link>
            <Link href="#how">How it works</Link>
          </nav>
        </div>
      </header>

      <div id="top">
        <section className={styles.hero}>
          <div className={styles.wrap}>
            <Reveal className={styles.heroContent}>
              <h1>Your code builds your realm.</h1>
              <p className={styles.lede}>Your development history becomes something you can see. Trace the work you ship, the skills you develop, and the progress you earn along the way.</p>
              <div className={styles.actions}>
                <Link className={`${styles.button} ${styles.primaryButton}`} href="/login">Enter your realm</Link>
                <Link className={`${styles.button} ${styles.accentButton}`} href="#skill-tree">Read the skill tree</Link>
              </div>
              <p className={styles.note}>Sign in with GitHub to build your character from your public activity.</p>
            </Reveal>
            <HeroTree />
            <p className={styles.treeCaption}>Above the line, the work people see. Below it, the roots that hold it up.</p>
          </div>
        </section>

        <section className={styles.section} id="system"><div className={styles.wrap}>
          <SectionHeading id="system-title" title="Work leaves evidence. Evidence shapes progress." intro="RootRealm is built on what you actually contribute, not a random counter. Activity becomes a structured record you can explore and understand." />
          <Reveal className={styles.sequence}>
            {[
              ["Public activity", "Pull requests, reviews, releases, and other observable work."],
              ["Normalized evidence", "Each kind of activity is represented consistently before it counts."],
              ["Skills take shape", "Attributes and branches give different kinds of work a visible structure."],
              ["A living profile", "A snapshot of the craft you have practiced and the milestones you have reached."],
            ].map(([title, detail]) => <div key={title} className={styles.sequenceItem}><div className={styles.sequenceDot} /><h3>{title}</h3><p>{detail}</p></div>)}
          </Reveal>
        </div></section>

        <section className={styles.section} id="skill-tree"><div className={styles.wrap}>
          <SectionHeading id="skills-title" title="Not one path. Six ways to grow." intro="Building, debugging, learning, collaborating, maintaining, and architecting are different kinds of work. Each gets a branch, joined by a shared trunk." />
          <div className={styles.branches}>
            {branches.map(([title, detail, caption, branch]) => <article className={styles.branch} data-branch={branch} key={title}><BranchEmblem branch={branch} /><h3>{title}</h3><p>{detail}</p><small>{caption}</small></article>)}
          </div>
          <Link className={styles.underlinedLink} href="/skill-tree">Explore the full skill tree</Link>
        </div></section>

        <section className={styles.section} id="profile"><div className={styles.wrap}>
          <SectionHeading id="profile-title" title="One profile for the whole picture." intro="Your attributes, projects, and milestones come together as a single developer identity." />
          <Reveal className={styles.triptych}>
            <div className={`${styles.triptychSide} ${styles.triptychLeft}`}>
              <svg viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true"><path d="M36 4 62 19v30L36 64 10 49V19Z" opacity=".5" /><path d="m36 20 5.2 10.6 11.8 1.7-8.5 8.3 2 11.7L36 46.7 25.5 52.3l2-11.7-8.5-8.3 11.8-1.7Z" /></svg>
              <h3>Achievements</h3><p>Milestones that recognize meaningful patterns in your work, not just a streak of activity.</p>
              <Link className={styles.underlinedLink} href="/achievements">See achievements</Link>
            </div>
            <Radar />
            <div className={styles.triptychSide}>
              <svg viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true"><path d="m36 4 32 32-32 32L4 36Z" opacity=".5" /><path d="m36 16 20 20-20 20-20-20Z" /><circle cx="36" cy="36" r="5" /></svg>
              <h3>Cosmetics</h3><p>Equip frames, banners, titles, and effects without letting decoration overpower the work.</p>
              <Link className={styles.underlinedLink} href="/shop">Browse cosmetics</Link>
            </div>
          </Reveal>
        </div></section>

        <section className={styles.section} id="how"><div className={styles.wrap}>
          <SectionHeading id="how-title" title="Progress should have a reason." intro="Public activity is normalized into evidence before it contributes to any attribute, skill, or milestone." />
          <div className={styles.facts}>
            {[
              ["Your public work comes first", "RootRealm reads public GitHub activity — the work you have already shipped."],
              ["Signals stay distinct", "Merges, reviews, releases, documentation, and pushes are never treated as interchangeable."],
              ["Progress is explainable", "Scoring rules and prerequisites show why progress changes, instead of hiding it behind one opaque score."],
              ["Limits are stated plainly", "RootRealm uses only what GitHub makes public. Missing information is never invented."],
            ].map(([title, detail]) => <div className={styles.fact} key={title}><h3>{title}</h3><p>{detail}</p></div>)}
          </div>
        </div></section>

        <section className={styles.cta}><div className={styles.wrap}>
          <Mark className={styles.ctaMark} />
          <h2>See what your work has already built.</h2>
          <p>Sign in with GitHub and see how your activity maps into a progression system.</p>
          <div className={styles.actions}><Link className={`${styles.button} ${styles.primaryButton}`} href="/login">Enter your realm</Link><Link className={`${styles.button} ${styles.accentButton}`} href="#how">How it works</Link></div>
        </div></section>
      </div>

      <footer className={styles.footer}><div className={styles.wrap}>
        <span>Your code builds your realm.</span><Link className={styles.footerBrand} href="#top"><Mark />RootRealm</Link><span>A developer progression concept.</span>
      </div></footer>
    </div>
  );
}
