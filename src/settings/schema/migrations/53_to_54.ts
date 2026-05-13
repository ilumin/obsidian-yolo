import type { SettingMigration } from '../setting.types'

/**
 * v53→v54: purely additive schema bump.
 *
 * - `providerPresetTypeSchema` gains `'claude-web'` for Claude.ai Pro/Max
 *   subscription support via session cookie authentication.
 *
 * Existing v53 data is forward-compatible — the new preset type is optional
 * and old values stay valid. The migration only stamps the version so loaders
 * stay in lock-step with `SETTINGS_SCHEMA_VERSION`.
 */
export const migrateFrom53To54: SettingMigration['migrate'] = (data) => {
  return { ...data, version: 54 }
}
