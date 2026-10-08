"use client";

import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { AvatarFrame } from "@/components/profile/avatar-frame";

/**
 * Motion Playground – a lightweight dev‑only page to experiment with the
 * AvatarFrame component. Open http://localhost:3000/playground after the dev
 * server is running.
 */
type Mode = "pulse" | "haze" | "trail" | "none";

const MODES: Mode[] = ["pulse", "haze", "trail", "none"];
const DURATIONS: Record<string, string> = {
  ceremonial: "var(--motion-ceremonial)", // 900ms
  reveal: "var(--motion-reveal)",           // 600ms
  slow: "var(--motion-slow)",               // 400ms
  medium: "var(--motion-medium)",           // 250ms
  base: "var(--motion-base)",               // 200ms
};

export default function PlaygroundPage() {
  const [intensity, setIntensity] = useState(80);
  const [mode, setMode] = useState<Mode>("pulse");
  const [glow, setGlow] = useState(true);
  const [durationKey, setDurationKey] = useState<keyof typeof DURATIONS>("ceremonial");
  const [reduced, setReduced] = useState(false);

  // Keep track of the OS reduced‑motion preference.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-3">
        <Badge variant="neutral">Motion Playground</Badge>
        <Text variant="label" className="uppercase text-text-secondary">
          RootRealm
        </Text>
        <Text variant="display">Avatar Frame Motion</Text>
        <Text variant="body" className="text-text-secondary">
          Adjust intensity, mode, glow and duration. All timing comes from
          <span className="font-mono text-text-muted"> styles/tokens/motion.css</span>.
          The animation stops when your OS reduced‑motion setting is on.
        </Text>
        <div className="flex items-center gap-2">
          <span className="text-caption">Reduced motion:</span>
          <Badge variant={reduced ? "danger" : "success"} size="sm">
            {reduced ? "ON" : "OFF"}
          </Badge>
        </div>
      </header>

      {/* Preview */}
      <div className="grid gap-6 md:grid-cols-[260px_1fr] items-start">
        <div className="flex flex-col items-center gap-4">
          <div className="relative isolate">
            <AvatarFrame
              mode={mode}
              intensity={intensity}
              glow={glow}
              duration={DURATIONS[durationKey]}
            >
              <Avatar size="xl" name="plvtolee" />
            </AvatarFrame>
            {/* Decorative diamonds – same as the profile avatar */}
            <span
              aria-hidden="true"
              className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-emphasis border-text-secondary bg-bg"
            />
            <span
              aria-hidden="true"
              className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-emphasis border-text-secondary bg-bg"
            />
          </div>
          <Badge variant="default" size="sm">
            {mode} · {intensity}% · glow {glow ? "on" : "off"} · {durationKey}
          </Badge>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-6">
          {/* Intensity */}
          <div className="flex flex-col gap-3">
            <Text variant="label" className="uppercase text-text-muted">
              Intensity ({intensity}%)
            </Text>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>

          {/* Mode buttons */}
          <div className="flex flex-col gap-3">
            <Text variant="label" className="uppercase text-text-muted">
              Mode
            </Text>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <Button
                  key={m}
                  variant={mode === m ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setMode(m)}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {/* Glow toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="glow-toggle"
              checked={glow}
              onChange={(e) => setGlow(e.target.checked)}
              className="size-4 accent-accent"
            />
            <label htmlFor="glow-toggle" className="text-body">
              Glow overlay
            </label>
          </div>

          {/* Duration selector */}
          <div className="flex flex-col gap-3">
            <Text variant="label" className="uppercase text-text-muted">
              Duration token
            </Text>
            <select
              value={durationKey}
              onChange={(e) => setDurationKey(e.target.value as keyof typeof DURATIONS)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary outline-none focus-visible:border-accent"
            >
              {Object.entries(DURATIONS).map(([key, val]) => (
                <option key={key} value={key}>
                  {key} ({val.replace("var(--motion-", "").replace(")", "")}ms)
                </option>
              ))}
            </select>
          </div>

          {/* Reduced‑motion info */}
          <Card variant="secondary" padding="md">
            <Text variant="label" className="uppercase text-text-muted mb-2">
              To test reduced motion
            </Text>
            <Text variant="caption" className="text-text-secondary">
              Turn on your OS reduced‑motion setting (Windows: Settings →
              Accessibility → Visual Effects → Disable animations; macOS: System
              Settings → Accessibility → Display → Reduce motion). When enabled,
              the frame stops animating and the page entrance becomes a simple
              fade.
            </Text>
          </Card>
        </div>
      </div>

      {/* Token reference */}
      <Card padding="md">
        <Text variant="label" className="uppercase text-text-muted mb-3">
          Motion token reference
        </Text>
        <div className="grid gap-2 text-caption font-mono text-text-secondary sm:grid-cols-2">
          {Object.entries(DURATIONS).map(([key, val]) => (
            <div key={key} className="rounded border border-border bg-surface-secondary px-3 py-2">
              --motion-{key} = {val.replace("var(--motion-", "").replace(")", "")}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
