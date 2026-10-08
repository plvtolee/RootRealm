export type CustomizationSection =
  | "Avatar"
  | "Frame"
  | "Banner"
  | "Title"
  | "Theme"
  | "Effects";

export type CustomizationOption = {
  id: string;
  label: string;
  description?: string;
  accent?: "amber" | "cyan" | "violet" | "rose" | "slate";
};

export const CUSTOMIZATION_SECTIONS: readonly CustomizationSection[] = [
  "Avatar",
  "Frame",
  "Banner",
  "Title",
  "Theme",
  "Effects",
];

export const AVATAR_OPTIONS: readonly CustomizationOption[] = [
  { id: "midnight", label: "Midnight", description: "Classic developer portrait", accent: "slate" },
  { id: "signal", label: "Signal", description: "Sharper focus and high contrast", accent: "cyan" },
  { id: "ember", label: "Ember", description: "Warm studio glow", accent: "amber" },
  { id: "nova", label: "Nova", description: "High-energy highlight", accent: "violet" },
];

export const FRAME_OPTIONS: readonly CustomizationOption[] = [
  { id: "noir", label: "Noir", description: "Subtle edge treatment", accent: "slate" },
  { id: "pulse", label: "Pulse", description: "Soft active ring", accent: "cyan" },
  { id: "aurora", label: "Aurora", description: "Gentle cool glow", accent: "violet" },
  { id: "ember-frame", label: "Ember", description: "Warm system hardware feel", accent: "amber" },
];

export const BANNER_OPTIONS: readonly CustomizationOption[] = [
  { id: "cinder", label: "Cinder", description: "Night mode base", accent: "slate" },
  { id: "signal-banner", label: "Signal", description: "Cool cyan wash", accent: "cyan" },
  { id: "sunset", label: "Sunset", description: "Warm studio flares", accent: "amber" },
  { id: "violet-haze", label: "Violet Haze", description: "Soft purple sheen", accent: "violet" },
];

export const TITLE_OPTIONS: readonly CustomizationOption[] = [
  { id: "builder", label: "Builder" },
  { id: "architect", label: "Architect" },
  { id: "debugger", label: "Debugger" },
  { id: "maintainer", label: "Maintainer" },
];

export const THEME_OPTIONS: readonly CustomizationOption[] = [
  { id: "graphite", label: "Graphite", description: "Monochrome and quiet", accent: "slate" },
  { id: "signal-theme", label: "Signal", description: "Blue tone accent", accent: "cyan" },
  { id: "violet-theme", label: "Violet", description: "A richer purple cast", accent: "violet" },
  { id: "ember-theme", label: "Ember", description: "Warm terminal glow", accent: "amber" },
];

export const EFFECT_OPTIONS: readonly CustomizationOption[] = [
  { id: "none", label: "None", description: "Clean and minimal" },
  { id: "pulse", label: "Pulse", description: "Subtle ring movement" },
  { id: "haze", label: "Haze", description: "Soft ambient bloom" },
  { id: "trail", label: "Trail", description: "Faint motion accent" },
];

export const MOCK_CUSTOMIZATION_STATE = {
  avatar: "signal",
  frame: "pulse",
  banner: "signal-banner",
  title: "builder",
  theme: "signal-theme",
  effect: "pulse",
};
