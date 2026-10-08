"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

import { Container } from "./container";
import { NAV_ITEMS, isNavActive } from "./nav-items";

export type TopNavigationProps = {
  className?: string;
};

/**
 * The primary desktop navigation (TASKS §1.6, DESIGN_SYSTEM §22, §29).
 *
 * ```tsx
 * // components/layout/app-shell.tsx — rendered once, before <main>
 * <TopNavigation />
 * ```
 *
 * Notes:
 * - the pattern is the header bar from `references/approved-ui/` (brand
 *   wordmark, horizontal destinations, account avatar on the right), not a
 *   sidebar: the approved screens all show it, and it keeps the shell's single
 *   content column intact. The destinations come from `NAV_ITEMS` — the same
 *   table the mobile bar reads — so the two navigations cannot drift; the
 *   `account` item renders as the avatar affordance instead of a text link,
 *   exactly as the references split Profile out of the link row
 * - it is `display: none` below `lg` and the bottom bar is `lg:hidden`, so at
 *   any viewport exactly one of them is in the accessibility tree; both are
 *   labelled "Primary navigation", which is therefore never doubled
 * - it is sticky rather than fixed and lives in the layout, outside
 *   app/template.tsx: sticky keeps it in flow (no content offset, no reserved
 *   strip) while staying clear of the page entrance's animated transform, which
 *   would otherwise become its containing block
 * - the active destination carries `aria-current="page"` and an accent
 *   underline (`border-b-emphasis` — the `--border-width-emphasis` theme key
 *   from styles/tokens/shape.css); inactive links only change colour on
 *   hover — no motion beyond a colour transition (§11, §12), no glow (§10)
 * - hit areas clear 44px in both axes: the links fill the header's
 *   `--layout-header-height`, and the avatar sits in a padded pill
 *   (§30 — comfortable targets apply to pointer input too)
 */
export function TopNavigation({ className }: TopNavigationProps) {
  const pathname = usePathname();

  const links = NAV_ITEMS.filter((item) => !item.account);
  const account = NAV_ITEMS.find((item) => item.account);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 hidden border-b border-border bg-bg lg:block",
        className,
      )}
    >
      <Container className="flex h-(--layout-header-height) items-stretch gap-6">
        {/*
          The wordmark. It shares the heading role rather than a bespoke
          style: the component may not name a font size (DESIGN_SYSTEM §5), and
          the serif display face in the references would need a new font
          dependency, which this task does not add.
        */}
        <Link
          href="/"
          className="flex items-center whitespace-nowrap text-heading text-text-primary transition-colors duration-(--motion-base) ease-standard hover:text-accent motion-reduce:transition-none"
        >
          RootRealm
        </Link>

        {/*
          The landmark itself. Only this header or the mobile bottom bar is
          ever displayed (`hidden lg:block` vs `lg:hidden`), so the shared
          landmark label is never exposed twice.
        */}
        <nav aria-label="Primary navigation" className="flex items-stretch">
          <ul className="flex items-stretch gap-2">
            {links.map(({ href, label }) => {
              const active = isNavActive(pathname, href);

              return (
                <li key={href} className="flex">
                  {/*
                    Colours are chosen in JS rather than layered: `cn` cannot
                    resolve conflicts (lib/cn.ts), so the active item must be
                    the only source of its text and border colour.
                  */}
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-full items-center whitespace-nowrap px-3 transition-colors duration-(--motion-base) ease-standard motion-reduce:transition-none",
                      active
                        ? "border-b-emphasis border-accent text-accent"
                        : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <div
            aria-label="6 stars"
            className="flex h-(--control-height-md) items-center gap-2 rounded-pill border border-border px-4 text-label text-text-secondary"
          >
            <span aria-hidden="true" className="text-accent-amber">*</span>
            <span>6</span>
          </div>

        {/*
          The account destination from the same table. The avatar is an empty
          neutral circle until Phase 2 supplies an identity — inventing a
          picture or a name here would invent product data. The link takes its
          accessible name from `label`, and the selected state is the shared
          interaction layer rather than a bespoke treatment.
        */}
        {account ? (
          <Link
            href={account.href}
            aria-label={account.label}
            title={account.label}
            aria-current={isNavActive(pathname, account.href) ? "page" : undefined}
            className={cn(
              "flex items-center self-center rounded-pill p-1 transition-colors duration-(--motion-base) ease-standard motion-reduce:transition-none",
              isNavActive(pathname, account.href) && "bg-state-selected",
            )}
          >
            <Avatar size="md" />
          </Link>
        ) : null}
        </div>
      </Container>
    </header>
  );
}