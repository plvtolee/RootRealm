/**
 * TEMPORARY placeholder.
 *
 * It exists only because the create-next-app boilerplate relied on the
 * Tailwind default palette, which the RootRealm token layer intentionally
 * removes. It verifies that the token layer renders in the browser and will be
 * replaced by the application shell in Task 1.4.
 *
 * This is not product UI and contains no progression logic.
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <p className="text-label uppercase text-text-secondary">RootRealm</p>

      <h1 className="text-display text-text-primary">Design tokens active</h1>

      <p className="max-w-md text-center text-body text-text-secondary">
        Phase 1 — UI foundation. Colors, typography, spacing, shape, elevation
        and motion now resolve from a single token source.
      </p>

      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-md">
        <p className="text-label uppercase text-text-muted">Token layer</p>
        <p className="mt-3 text-caption text-text-secondary">
          Semantic surfaces, hairlines and restrained elevation resolve from
          styles/tokens. No accent color is applied globally.
        </p>
      </div>
    </main>
  );
}

