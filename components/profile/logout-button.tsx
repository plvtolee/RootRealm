"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/** Signs out the current session, then returns the visitor to Home. */
export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { accept: "application/json" },
      });

      if (!response.ok) throw new Error("Log out failed.");

      router.push("/");
    } catch {
      setLoading(false);
      setError("Could not log out. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" loading={loading} onClick={logout}>
        Log out
      </Button>
      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
