import Home from "@/components/updates/updates-home";

export const dynamic = "force-dynamic";

/**
 * The signed-in updates hub. The public landing route at `/` is intentionally
 * separate so the OAuth fallback keeps the product feed behind the account
 * boundary without duplicating its implementation.
 */
export default Home;
