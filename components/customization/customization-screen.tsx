"use client";

import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

import {
  AVATAR_OPTIONS,
  BANNER_OPTIONS,
  CUSTOMIZATION_SECTIONS,
  EFFECT_OPTIONS,
  FRAME_OPTIONS,
  MOCK_CUSTOMIZATION_STATE,
  THEME_OPTIONS,
  TITLE_OPTIONS,
  type CustomizationOption,
  type CustomizationSection,
} from "./customization-data";

const OPTION_GROUPS: Record<CustomizationSection, readonly CustomizationOption[]> = {
  Avatar: AVATAR_OPTIONS,
  Frame: FRAME_OPTIONS,
  Banner: BANNER_OPTIONS,
  Title: TITLE_OPTIONS,
  Theme: THEME_OPTIONS,
  Effects: EFFECT_OPTIONS,
};

const ACCENT_CLASS: Record<string, string> = {
  amber: "border-warning bg-warning/10 text-warning",
  cyan: "border-info bg-info/10 text-info",
  violet: "border-accent bg-accent/10 text-accent",
  rose: "border-danger bg-danger/10 text-danger",
  slate: "border-border bg-surface-secondary text-text-primary",
};

function PreviewCard({
  selectedAvatar,
  selectedFrame,
  selectedBanner,
  selectedTitle,
  selectedTheme,
  selectedEffect,
}: {
  selectedAvatar: string;
  selectedFrame: string;
  selectedBanner: string;
  selectedTitle: string;
  selectedTheme: string;
  selectedEffect: string;
}) {
  const banner = BANNER_OPTIONS.find((option) => option.id === selectedBanner) ?? BANNER_OPTIONS[0];
  const theme = THEME_OPTIONS.find((option) => option.id === selectedTheme) ?? THEME_OPTIONS[0];
  const frame = FRAME_OPTIONS.find((option) => option.id === selectedFrame) ?? FRAME_OPTIONS[0];
  const title = TITLE_OPTIONS.find((option) => option.id === selectedTitle) ?? TITLE_OPTIONS[0];
  const avatar = AVATAR_OPTIONS.find((option) => option.id === selectedAvatar) ?? AVATAR_OPTIONS[0];
  const effect = EFFECT_OPTIONS.find((option) => option.id === selectedEffect) ?? EFFECT_OPTIONS[0];

  return (
    <Card className="overflow-hidden border-border bg-surface-secondary">
      <div
        className={cn(
          "flex h-(--customization-banner-height) items-end justify-between border-b border-border px-4 pb-3",
          theme.accent === "cyan"
            ? "bg-info/10"
            : theme.accent === "violet"
              ? "bg-accent/10"
              : theme.accent === "amber"
                ? "bg-warning/10"
                : "bg-surface-secondary",
        )}
      >
        <div className="space-y-1">
          <Text variant="label" className="text-text-secondary">
            {banner.label} banner
          </Text>
          <Text variant="subheading" as="h2" className="text-text-primary">
            {title.label}
          </Text>
        </div>
        <Badge variant="neutral" size="sm">
          {effect.label}
        </Badge>
      </div>

      <div className="flex items-center gap-4 px-4 py-6">
        <div className={cn("relative flex items-center justify-center rounded-full border-2 p-1", ACCENT_CLASS[frame.accent ?? "slate"])}>
          <Avatar name="plvtolee" initials="PL" size="xl" className="border border-border" />
        </div>

        <div className="space-y-1">
          <Text variant="heading" as="h3" className="text-text-primary">
            plvtolee
          </Text>
          <Text variant="body" className="text-text-secondary">
            {avatar.label} avatar · {frame.label} frame
          </Text>
        </div>
      </div>
    </Card>
  );
}

export function CustomizationScreen() {
  const [section, setSection] = useState<CustomizationSection>("Avatar");
  const [selected, setSelected] = useState(MOCK_CUSTOMIZATION_STATE);
  const [message, setMessage] = useState<string | null>(null);

  const activeOptions = useMemo(() => OPTION_GROUPS[section], [section]);

  const currentBadge = (
    {
      Avatar: selected.avatar,
      Frame: selected.frame,
      Banner: selected.banner,
      Title: selected.title,
      Theme: selected.theme,
      Effects: selected.effect,
    }[section] ?? selected.avatar
  );

  const sectionLabel = `${section} options`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {CUSTOMIZATION_SECTIONS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setSection(name)}
            className={cn(
              "rounded-md border px-3 py-2 text-label transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
              section === name
                ? "border-border-strong bg-surface-secondary text-text-primary"
                : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
            )}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border bg-surface-secondary p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Text variant="subheading" as="h2" className="text-text-primary">
              {sectionLabel}
            </Text>
            <Badge variant="neutral" size="sm">
              {activeOptions.length} items
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {activeOptions.map((option) => {
              const isSelected = option.id === currentBadge;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    if (section === "Avatar") setSelected((prev) => ({ ...prev, avatar: option.id }));
                    if (section === "Frame") setSelected((prev) => ({ ...prev, frame: option.id }));
                    if (section === "Banner") setSelected((prev) => ({ ...prev, banner: option.id }));
                    if (section === "Title") setSelected((prev) => ({ ...prev, title: option.id }));
                    if (section === "Theme") setSelected((prev) => ({ ...prev, theme: option.id }));
                    if (section === "Effects") setSelected((prev) => ({ ...prev, effect: option.id }));
                  }}
                  className={cn(
                    "flex flex-col items-start rounded-lg border p-3 text-left transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
                    isSelected
                      ? "border-border-strong bg-surface text-text-primary"
                      : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
                  )}
                >
                  <div className={cn("mb-3 size-(--customization-option-swatch-size) rounded-md border", ACCENT_CLASS[option.accent ?? "slate"])} />
                  <Text variant="label" className="text-text-primary">
                    {option.label}
                  </Text>
                  {option.description ? (
                    <Text variant="caption" className="mt-1 text-text-muted">
                      {option.description}
                    </Text>
                  ) : null}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <PreviewCard
            selectedAvatar={selected.avatar}
            selectedFrame={selected.frame}
            selectedBanner={selected.banner}
            selectedTitle={selected.title}
            selectedTheme={selected.theme}
            selectedEffect={selected.effect}
          />

          <Card className="border-border bg-surface-secondary p-4">
            <Text variant="subheading" as="h3" className="mb-3 text-text-primary">
              Live summary
            </Text>
            <div className="space-y-2">
              <Text variant="body" className="text-text-secondary">
                Avatar: {AVATAR_OPTIONS.find((option) => option.id === selected.avatar)?.label ?? "Midnight"}
              </Text>
              <Text variant="body" className="text-text-secondary">
                Theme: {THEME_OPTIONS.find((option) => option.id === selected.theme)?.label ?? "Graphite"}
              </Text>
              <Text variant="body" className="text-text-secondary">
                Title: {TITLE_OPTIONS.find((option) => option.id === selected.title)?.label ?? "Builder"}
              </Text>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelected(MOCK_CUSTOMIZATION_STATE);
                  setMessage("Customization reset.");
                }}
              >
                Reset
              </Button>
              <Button onClick={() => setMessage("Customization saved for this session.")}>Save changes</Button>
            </div>
            <div aria-live="polite" className="mt-4 min-h-(--shop-notice-min-height)">
              {message ? <Text variant="caption" className="text-text-secondary">{message}</Text> : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
