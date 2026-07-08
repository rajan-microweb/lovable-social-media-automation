/**
 * DEPRECATED — kept only to satisfy any legacy imports.
 *
 * The app is now multi-tenant (Organizations → Workspaces). Users create their
 * organization + default workspace via the /onboarding flow. There is no
 * "personal workspace = user_id" concept anymore.
 */
export async function ensurePersonalWorkspace(_userId: string): Promise<void> {
  return;
}
