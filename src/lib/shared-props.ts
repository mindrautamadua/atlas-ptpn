import 'server-only'
import type { AuthUser } from '@/lib/auth'

/**
 * Build the shared Inertia props (mirror of HandleInertiaRequests::share) fed
 * into <PageProvider>. Thresholds use sane defaults from config/atlas-thresholds.php.
 */
export function buildSharedProps(user: AuthUser): Record<string, unknown> {
  return {
    auth: { user },
    flash: { success: null, error: null },
    errors: {},
    features: {},
    strategicPillars: {},
    thresholds: {
      autosave: { debounceMs: 1500, ttlDays: 7, maxPayloadKb: 256 },
      escalationAging: { yellow: 3, orange: 7, red: 14 },
    },
  }
}
