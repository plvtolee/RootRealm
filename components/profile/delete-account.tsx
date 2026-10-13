"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { DELETE_CONFIRMATION } from "@/lib/auth/delete-account";

/**
 * The account-deletion control (TASKS 22.5).
 *
 * ## Why this needs two deliberate steps
 *
 * Deletion is irreversible, so the bar is "cannot happen by accident" rather than
 * "has a confirm dialog". One click opens the panel; the second click types a
 * phrase the user must have read. Nothing here is destructive until the phrase
 * matches, and the phrase is checked by the server too — a client-only check
 * would be a UI convention rather than a rule.
 *
 * ## Why the warning is written the way it is
 *
 * "This cannot be undone" appears before the confirmation, not after. A user who
 * has already typed the phrase is past the point where a warning helps; the only
 * moment a warning can protect someone is before they commit.
 */
export function DeleteAccount({ login }: { login: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const confirmed = phrase.trim() === DELETE_CONFIRMATION;

  async function submit() {
    setState("working");
    setMessage(null);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json", accept: "application/json" },
        // The server is the authority on whether this is confirmed; sending the
        // literal phrase rather than `confirmed: true` means the two cannot
        // disagree about what was typed.
        body: JSON.stringify({ confirmation: phrase }),
      });

      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setState("error");
        setMessage(body?.message ?? "That did not work. Try again.");
        return;
      }

      // The cookie is already cleared by the response. A full navigation is the
      // simplest honest end: every screen is now showing a signed-out visitor,
      // and a client-side redirect would leave cached profile data on screen.
      // The cookie is already cleared by the response. A replace (not a push) so Back
      // cannot return to a page about an account that no longer exists, and a
      // refresh so nothing cached from before the deletion survives.
      router.replace("/"); router.refresh();
    } catch {
      setState("error");
      setMessage("That did not work. Check your connection and try again.");
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4 border border-danger p-4">
      <Text as="h2" variant="subheading" className="text-danger">
        Delete {login}&rsquo;s account
      </Text>

      <Text as="p" variant="body" className="text-text-secondary">
        This removes your profile, your CodeCoins, everything you have bought and
        every unlock you have earned. <strong>It cannot be undone.</strong> Your
        GitHub account is not affected.
      </Text>

      <label className="flex flex-col gap-2">
        <Text as="span" variant="label" className="text-text-secondary">
          Type <code className="font-mono text-text-primary">{DELETE_CONFIRMATION}</code> to
          confirm
        </Text>
        <input
          type="text"
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="delete-account-warning"
          className="border border-border bg-surface px-3 py-2 text-text-primary"
        />
      </label>

      <div className="flex gap-3">
        <Button
          variant="danger"
          disabled={!confirmed || state === "working"}
          onClick={submit}
        >
          {state === "working" ? "Deleting…" : "Delete permanently"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(false);
            setPhrase("");
            setMessage(null);
            setState("idle");
          }}
        >
          Cancel
        </Button>
      </div>

      {message !== null && (
        <Text as="p" variant="caption" className="text-danger" role="alert">
          {message}
        </Text>
      )}
    </div>
  );
}