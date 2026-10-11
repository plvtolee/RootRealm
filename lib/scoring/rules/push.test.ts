import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../../developer-event";
import { SCORING_V1 } from "../types";
import { pushRule, RULE_ID } from "./push";

function push(over: Partial<DeveloperEvent> = {}): DeveloperEvent {
  return {
    id: "push:1",
    kind: "push",
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-09T05:51:24Z",
    visibility: "public",
    confidence: "verified",
    sourceUrl: "https://github.com/octocat/octo-repo/commit/abc123",
    relevance: "scored",
    limitations: ["commit_count_unavailable"],
    evidence: { branch: "main", headSha: "abc123", beforeSha: "def456" },
    ...over,
  } as DeveloperEvent;
}

const score = (event: DeveloperEvent) => pushRule.evaluate(event, SCORING_V1);

/* -------------------------------------------------------------------------- */

describe("dispatch", () => {
  it("handles a push", () => {
    expect(score(push())).not.toBeNull();
  });

  it("leaves other kinds alone", () => {
    // `null` means "not my concern", which the engine needs to tell apart from a
    // decline (§33). Claiming every kind would make dispatch order a decision.
    expect(score(push({ kind: "pull_request" }))).toBeNull();
    expect(score(push({ kind: "lifecycle" }))).toBeNull();
  });

  it("identifies itself as push.landed", () => {
    // The rule id is persisted on every award and ledger entry (§17), so it is an
    // identity rather than a label.
    expect(pushRule.ruleId).toBe(RULE_ID);
    expect(score(push())?.attributeAwards[0].ruleId).toBe("push.landed");
  });
});

describe("the award", () => {
  it("gives §7's value, per push", () => {
    const result = score(push());

    expect(result?.eligible).toBe(true);
    expect(result?.xp).toBe(3);
    expect(result?.xp).toBe(SCORING_V1.xp.qualifying_push);
    expect(result?.classification).toBe("qualifying_push");
  });

  it("awards one Builder unit (§14's implementation work)", () => {
    expect(score(push())?.attributeAwards).toEqual([
      {
        attribute: "builder",
        amount: 1,
        eventId: "push:1",
        ruleId: "push.landed",
      },
    ]);
  });

  it("is flat: the same value however many commits went unseen", () => {
    // §7 warns against "rewarding large amounts of trivial commit activity". A
    // flat award cannot grow with an unobservable commit count, so the limit is
    // structural rather than something a later rule has to remember.
    const small = score(push());
    const large = score(
      push({ limitations: ["commit_count_unavailable", "timestamp_missing"] }),
    );

    expect(small?.xp).toBe(large?.xp);
    expect(small?.xp).toBe(3);
  });

  it("names the branch, so an explanation says more than 'pushed code'", () => {
    expect(score(push())?.reason).toBe("Landed code on main");
  });

  it("still explains a push with no branch", () => {
    // The branch is the nice-to-have, not the evidence. Declining would turn a
    // missing label into a missing award.
    const result = score(
      push({ evidence: { branch: null, headSha: "abc123", beforeSha: "def" } }),
    );

    expect(result?.eligible).toBe(true);
    expect(result?.reason).toBe("Landed code");
  });

  it("stamps the scoring version, so §3's history guarantee holds", () => {
    expect(score(push())?.scoringVersion).toBe(SCORING_V1.id);
  });

  it("does not mutate its event", () => {
    const target = push();
    const before = JSON.stringify(target);

    score(target);

    expect(JSON.stringify(target)).toBe(before);
  });
});

describe("eligibility — attribution (§5 rule 3, §6)", () => {
  it("declines inferred evidence", () => {
    const result = score(push({ confidence: "inferred" }));

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("not_attributable");
    expect(result?.xp).toBe(0);
  });

  it("explains why, in words the reader can act on", () => {
    expect(score(push({ confidence: "inferred" }))?.reason).toContain(
      "could not be attributed",
    );
  });

  it("still names the classification it recognised", () => {
    // "This was a push that could not be attributed" is more useful than "this
    // was rejected" (§17).
    expect(
      score(push({ confidence: "inferred" }))?.classification,
    ).toBe("qualifying_push");
  });
});

describe("eligibility — a citable source (§17)", () => {
  it("declines a push with no head commit", () => {
    const result = score(
      push({ evidence: { branch: "main", headSha: null, beforeSha: "def" } }),
    );

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("insufficient_evidence");
    expect(result?.reason).toContain("no head commit");
  });

  it("awards a push whose only gap is the commit list", () => {
    // The limitation is real and is the whole reason the award is per push, but it
    // is not a reason to award nothing — the head commit is citable.
    const result = score(push());

    expect(result?.eligible).toBe(true);
  });
});

describe("anti-farming (§7)", () => {
  it("declines a push that landed nothing", () => {
    // head === before means the ref did not move. GitHub emits these, and §7
    // forbids rewarding trivial activity.
    const result = score(
      push({ evidence: { branch: "main", headSha: "abc", beforeSha: "abc" } }),
    );

    expect(result?.eligible).toBe(false);
    expect(result?.rejectionReason).toBe("anti_farming_rule");
    expect(result?.xp).toBe(0);
  });

  it("uses anti_farming_rule rather than unsupported_event", () => {
    // §35 keeps these apart: one is a rule judging evidence, the other is no rule
    // knowing the event exists.
    expect(
      score(push({ evidence: { branch: "main", headSha: "a", beforeSha: "a" } }))
        ?.rejectionReason,
    ).toBe("anti_farming_rule");
  });

  it("awards a push that moved exactly one commit", () => {
    // before and head differing by one SHA is still a landed change.
    const result = score(
      push({ evidence: { branch: "main", headSha: "abc", beforeSha: "abd" } }),
    );

    expect(result?.eligible).toBe(true);
  });

  it("does not treat a missing `before` as a no-op", () => {
    // GitHub withholding a field is missing evidence, not evidence that nothing
    // changed. §35 draws that distinction; flattening it would decline pushes for
    // a reason we cannot support.
    const result = score(
      push({ evidence: { branch: "main", headSha: "abc", beforeSha: null } }),
    );

    expect(result?.eligible).toBe(true);
  });

  it("cannot detect repetition inside one push, and does not pretend to", () => {
    // §7's real warning — a long repetitive commit sequence in one push — is not
    // detectable here, because the commit list does not exist in this data. What
    // the flat award guarantees is the half that is fixable: splitting work into
    // more pushes cannot multiply the score.
    const single = score(push());
    const fivePushes = [0, 1, 2, 3, 4].map((index) =>
      score(push({ id: `push:${index}` })),
    );

    expect(single?.xp).toBe(3);
    expect(fivePushes.map((r) => r?.xp)).toEqual([3, 3, 3, 3, 3]);
    expect(fivePushes.reduce((total, r) => total + (r?.xp ?? 0), 0)).toBe(15);
  });
});

describe("determinism and purity (§1)", () => {
  it("returns the same result for the same event", () => {
    expect(score(push())).toEqual(score(push()));
  });

  it("carries no clock, so a replay reproduces it", () => {
    // A timestamp here would make two identical runs differ, which is the defect
    // TASKS 5.10's ledger avoids by taking `awardedAt` as an argument.
    expect(score(push())).not.toHaveProperty("awardedAt");
  });
});