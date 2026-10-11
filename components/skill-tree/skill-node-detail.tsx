/**
 * RootRealm — skill node detail panel (TASKS §2.5).
 *
 * The card for the selected node: identity, description, evidence progress,
 * requirements, rewards, Learn / Refund with reasons, and the cheapest-path
 * preview. All copy comes from `skill-tree-logic.ts` views.
 */

import { ATTRIBUTE_LABEL } from "@/lib/attributes";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Text } from "@/components/ui/text";
import { SkillGlyph } from "./skill-tree-glyphs";
import { STATUS_BADGE_VARIANT } from "./skill-tree-presentation";

import { SKILL_DEFINITIONS } from "@/lib/skills/catalog";
import { indexSkills } from "@/lib/skills/definition";
import { shortestPathTo } from "@/lib/skills/prerequisites";
import { STATUS_LABEL, type SkillNodeView, type SkillTreeState } from "@/lib/skills/view";
import type { SkillDefinition } from "@/lib/skills/definition";
import type { SkillNodePresentation } from "./skill-node-presentation";

const TIER_LABEL: Record<SkillDefinition["tier"], string> = {
  roots: "Roots",
  foundation: "Foundation",
  intermediate: "Intermediate",
  advanced: "Advanced",
  mastery: "Mastery",
};

const TYPE_LABEL: Record<SkillDefinition["type"], string> = {
  core: "Core",
  keystone: "Keystone",
  notable: "Notable",
  minor: "Minor",
};

export type SkillNodeDetailProps = {
  state: SkillTreeState;
  view: SkillNodeView | null;
  onLearn: (id: string) => void;
  onRefund: (id: string) => void;
  presentation: ReadonlyMap<string, SkillNodePresentation>;
};
function PathPreview({ state, view }: { state: SkillTreeState; view: SkillNodeView }) {
  const index = indexSkills(SKILL_DEFINITIONS);
  const path = shortestPathTo(view.node.id, index, state.learnedIds);
  if (view.status === "learned" || path === null || path.length === 0) {
    return null;
  }
  const names = path.map((id) => index.get(id)?.title ?? id);
  return (
    <div className="flex flex-col gap-2">
      <Text variant="label" className="uppercase text-text-muted">
        Path to unlock
      </Text>
      <ol className="flex flex-col gap-1">
        {names.map((name, index) => (
          <Text
            key={path[index]}
            as="li"
            variant="caption"
            className={cn(
              "text-text-secondary",
              index === names.length - 1 && "font-medium text-text-primary",
            )}
          >
            {index + 1}. {name}
          </Text>
        ))}
      </ol>
    </div>
  );
}

export function SkillNodeDetail({ state, view, onLearn, onRefund, presentation }: SkillNodeDetailProps) {
  const index = indexSkills(SKILL_DEFINITIONS);

  if (!view) {
    return (
      <Card className="flex flex-col gap-3">
        <Text variant="subheading" as="h2">
          No node selected
        </Text>
        <Text variant="body" className="text-text-secondary">
          Select a node on the tree — or pick one from the list — to see its
          requirements, evidence and rewards.
        </Text>
      </Card>
    );
  }
  const { node, status } = view;
  const shown = presentation.get(node.id);
  return (
    <Card className="flex flex-col gap-4" aria-live="polite">
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-bg p-3 text-text-primary"
        >
          <SkillGlyph name={shown?.icon ?? node.id} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Text variant="subheading" as="h2">
            {node.title}
          </Text>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[status]} size="sm">
              {STATUS_LABEL[status]}
            </Badge>
            {node.branch ? (
              <Text variant="caption" className="text-text-secondary">
                {ATTRIBUTE_LABEL[node.branch]}
              </Text>
            ) : null}
            <Text variant="caption" className="text-text-muted">
              {TIER_LABEL[node.tier]} · {TYPE_LABEL[node.type]} · {node.cost}{" "}
              {node.cost === 1 ? "point" : "points"}
            </Text>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Text variant="body" className="text-text-secondary">
          {node.description}
        </Text>
        <Text variant="caption" className="text-text-muted">
          {shown?.flavor ?? ""}
        </Text>
      </div>
      <ProgressBar
        label="Evidence"
        value={view.progress.current}
        max={view.progress.required}
        showValue
        size="sm"
      />
      <div className="flex flex-col gap-2">
        <Text variant="label" className="uppercase text-text-muted">
          Evidence source
        </Text>
        <Text variant="caption" className="text-text-secondary">
          {shown?.flavor ?? "Verified from public GitHub activity."}{" "}
          <a
            href="https://github.com/octocat"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-4"
          >
            Open source
          </a>
        </Text>
      </div>
      <div className="flex flex-col gap-2">
        <Text variant="label" className="uppercase text-text-muted">
          Requirements
        </Text>
        {node.prerequisiteIds.length === 0 ? (
          <Text variant="caption" className="text-text-secondary">
            None — the Origin is always learned.
          </Text>
        ) : (
          <ul className="flex flex-col gap-1">
            {node.prerequisiteIds.map((id) => {
              const prereq = index.get(id);
              const met = state.learnedIds.has(id);
              return (
                <Text
                  key={id}
                  as="li"
                  variant="caption"
                  className={met ? "text-success" : "text-text-secondary"}
                >
                  {met ? "✓ " : "○ "}
                  {prereq?.title ?? id} (any one satisfies)
                </Text>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Text variant="label" className="uppercase text-text-muted">
          Rewards
        </Text>
        <ul className="flex flex-col gap-1">
          {(presentation.get(node.id)?.effects ?? []).map((effect) => (
            <Text key={effect} as="li" variant="caption" className="text-text-secondary">
              + {effect}
            </Text>
          ))}
          <Text as="li" variant="caption" className="text-text-secondary">
            + {presentation.get(node.id)?.xpReward ?? 0} XP
          </Text>
          <Text as="li" variant="caption" className="text-text-secondary">
            + {presentation.get(node.id)?.codeCoinReward ?? 0} CodeCoins
          </Text>
        </ul>
      </div>
      <PathPreview state={state} view={view} />
      <div className="flex flex-col gap-2">
        {view.canLearn ? (
          <Button onClick={() => onLearn(node.id)}>Learn — {node.cost} points</Button>
        ) : view.learnReason ? (
          <Text variant="caption" className="text-text-muted">
            {view.learnReason}
          </Text>
        ) : null}
        {view.canRefund ? (
          <Button variant="secondary" onClick={() => onRefund(node.id)}>
            Refund — regain {node.cost} points
          </Button>
        ) : view.refundReason ? (
          <Text variant="caption" className="text-text-muted">
            {view.refundReason}
          </Text>
        ) : null}
      </div>
    </Card>
  );
}
