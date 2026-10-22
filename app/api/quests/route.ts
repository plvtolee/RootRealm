/** `GET /api/quests` — completion state for the session's developer. */
import { safeJson } from "@/lib/security/server";
import { userIdFromRequest } from "@/lib/shop/service";
import { accountFor, completedQuestKeysFor } from "@/lib/quests/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const userId = userIdFromRequest(request);
  if (userId === null) {
    return safeJson(
      { error: "unauthenticated", message: "Sign in to view your quest state." },
      { status: 401 },
    );
  }

  if ((await accountFor(userId)) === null) {
    return safeJson(
      { error: "not_found", message: "That account no longer exists." },
      { status: 404 },
    );
  }

  const keys = await completedQuestKeysFor(userId);
  return safeJson({ completedKeys: [...keys] });
}
