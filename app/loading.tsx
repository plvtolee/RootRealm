import { Text } from "@/components/ui/text";

/**
 * RootRealm — the route-level loading state (TASKS 22.4).
 *
 * ```text
 * a navigation in flight → the shape of the page that is coming, immediately
 * ```
 *
 * ## Why a skeleton and not a spinner
 *
 * A spinner says "something is happening". A skeleton says *what is about to
 * happen*, and it holds the layout still while it does. This renders three
 * placeholder bars in the same rhythm as a screen header, a progress row and a
 * heading, so the page does not jump when the real content replaces it — which is
 * the whole reason route-level loading exists, since most of these screens
 * compute a developer's evidence from GitHub before they can render.
 *
 * It is deliberately unlabelled to assistive technology beyond a polite status:
 * the content that replaces it announces itself, and a `role="alert"` here would
 * interrupt whatever the visitor is actually reading.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <Text variant="caption" className="text-text-muted">
        Loading…
      </Text>

      {/* Three bars at the rhythm of a real screen: title, meta, rule. */}
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="motion-sheen h-(--control-height-sm) w-48 rounded-md bg-surface-secondary" />
        <div className="motion-sheen h-3 w-32 rounded-md bg-surface-secondary" />
        <div className="h-px w-full bg-surface-secondary" />
      </div>
    </div>
  );
}
