/**
 * RootRealm — `GET|POST /api/skills`.
 *
 * GET reads the signed-in developer's durable skill ids. POST recomputes the
 * eligibility decision from the current GitHub evidence before learning or
 * refunding a node; the request body never names an owner.
 */
import { buildProfilePreview } from "@/lib/profile/service";
import { accountStore, progressionStore } from "@/lib/db/stores";
import { userIdFromRequest } from "@/lib/shop/service";
import { parseItemId, safeJson } from "@/lib/security/server";
import {
  learnSkill,
  refundSkill,
  SkillMutationError,
} from "@/lib/skills/service";

export const dynamic = "force-dynamic";

function unauthenticated(): Response {
  return safeJson(
    { error: "unauthenticated", message: "Sign in with GitHub to use skills." },
    { status: 401 },
  );
}

/** `GET /api/skills` → the authenticated developer's persisted ids. */
export async function GET(request: Request): Promise<Response> {
  const account = await accountFor(request);
  if (account === null) return unauthenticated();

  return safeJson({ learnedSkillIds: [...(await progressionStore().learnedSkillIds(account.id))] });
}

/** `POST /api/skills` → `{ skillId, action? }`, owned by the session account. */
export async function POST(request: Request): Promise<Response> {
  const account = await accountFor(request);
  if (account === null) return unauthenticated();

  const body = await request.json().catch(() => null) as {
    skillId?: unknown;
    action?: unknown;
  } | null;
  const parsed = parseItemId(body?.skillId);
  const action = body?.action === undefined ? "learn" : body.action;

  if (!parsed.ok || (action !== "learn" && action !== "refund")) {
    return safeJson(
      { error: "bad_request", message: "Send { skillId, action? } with a valid skill id." },
      { status: 400 },
    );
  }

  const preview = await buildProfilePreview(account.login, { signal: request.signal });
  if (!preview.ok) {
    return safeJson(
      { error: "evidence_unavailable", message: preview.failure.message },
      { status: 503 },
    );
  }

  try {
    const input = {
      userId: account.id,
      developerLogin: account.login,
      skillId: parsed.itemId,
      events: preview.preview.events,
      attributeTotals: preview.preview.profile.attributes,
      store: progressionStore(),
    } as const;
    const result = action === "refund"
      ? await refundSkill(input)
      : await learnSkill(input);

    return safeJson({
      action,
      learnedSkillIds: result.learnedIds,
      duplicate: result.duplicate,
    });
  } catch (error) {
    if (!(error instanceof SkillMutationError)) throw error;

    return safeJson(
      { error: error.code, message: error.message },
      { status: error.code === "unknown_skill" ? 400 : 409 },
    );
  }
}

async function accountFor(request: Request) {
  const userId = userIdFromRequest(request);
  if (userId === null) return null;
  return accountStore().findById(userId);
}
