import { requestUrl } from 'obsidian'

import { ClaudeWebCredential, ClaudeWebStore } from './claudeWebStore'

const CLAUDE_AI_BASE_URL = 'https://claude.ai'

export class ClaudeWebError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClaudeWebError'
  }
}

export class ClaudeWebService {
  constructor(private readonly store: ClaudeWebStore) {}

  async getCredential(): Promise<ClaudeWebCredential | null> {
    return this.store.get()
  }

  async getUsableCredential(): Promise<ClaudeWebCredential | null> {
    return this.store.get()
  }

  isStale(credential: ClaudeWebCredential): boolean {
    return this.store.isStale(credential)
  }

  async setCredential(sessionKey: string): Promise<ClaudeWebCredential> {
    const trimmed = sessionKey.trim()
    if (!trimmed) {
      throw new ClaudeWebError('Session key cannot be empty.')
    }

    let organizationId: string | undefined
    try {
      const response = await requestUrl({
        url: `${CLAUDE_AI_BASE_URL}/api/organizations`,
        method: 'GET',
        headers: {
          Cookie: `sessionKey=${trimmed}`,
          'Content-Type': 'application/json',
        },
      })

      const data = response.json as unknown
      if (Array.isArray(data) && data.length > 0) {
        const firstOrg = data[0] as Record<string, unknown>
        if (typeof firstOrg.uuid === 'string') {
          organizationId = firstOrg.uuid
        }
      }
    } catch (error) {
      throw new ClaudeWebError(
        `Failed to verify session key with claude.ai: ${error instanceof Error ? error.message : String(error)}. Please check that the session key is valid and you are logged in.`,
      )
    }

    const now = Date.now()
    const credential: ClaudeWebCredential = {
      sessionKey: trimmed,
      setAt: now,
      updatedAt: now,
      ...(organizationId ? { organizationId } : {}),
    }

    await this.store.set(credential)
    return credential
  }

  async clearCredential(): Promise<void> {
    await this.store.clear()
  }
}
