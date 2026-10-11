/**
 * RootRealm — `POST /api/auth/logout` (TASKS 9.1).
 *
 * Clears the session cookie. A POST rather than a GET, because logging out is a
 * state change and a GET could be triggered by any image tag on any page.
 */
import { SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  });
}