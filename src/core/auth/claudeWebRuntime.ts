import { App } from 'obsidian'

import { ClaudeWebService } from './claudeWebService'
import { ClaudeWebStore } from './claudeWebStore'

const services = new Map<string, ClaudeWebService>()

export const initializeClaudeWebRuntime = (
  app: App,
  pluginId: string,
  providerId = 'claude-web',
): ClaudeWebService => {
  const existing = services.get(providerId)
  if (existing) {
    return existing
  }

  const service = new ClaudeWebService(
    new ClaudeWebStore(app, pluginId, providerId),
  )
  services.set(providerId, service)
  return service
}

export const getClaudeWebService = (
  providerId = 'claude-web',
): ClaudeWebService | null => services.get(providerId) ?? null

export const clearClaudeWebService = (providerId: string): void => {
  services.delete(providerId)
}
