import { App, normalizePath } from 'obsidian'
import path from 'path-browserify'

export type ClaudeWebCredential = {
  sessionKey: string
  organizationId?: string
  setAt: number
  updatedAt: number
}

const CREDENTIAL_DIR_NAME = 'claude-web'
const DEFAULT_PROVIDER_ID = 'claude-web'
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

const encodeProviderId = (providerId: string): string =>
  encodeURIComponent(providerId)

export class ClaudeWebStore {
  private readonly dir: string
  private readonly file: string

  constructor(
    private readonly app: App,
    pluginId: string,
    private readonly providerId = DEFAULT_PROVIDER_ID,
  ) {
    this.dir = normalizePath(`${this.app.vault.configDir}/plugins/${pluginId}`)
    this.file = normalizePath(
      path.posix.join(
        this.dir,
        CREDENTIAL_DIR_NAME,
        `${encodeProviderId(this.providerId)}.json`,
      ),
    )
  }

  getFilePath(): string {
    return this.file
  }

  async get(): Promise<ClaudeWebCredential | null> {
    const exists = await this.app.vault.adapter.exists(this.file)
    if (!exists) {
      return null
    }

    try {
      const raw = await this.app.vault.adapter.read(this.file)
      const parsed = JSON.parse(raw) as Partial<ClaudeWebCredential>
      if (
        typeof parsed.sessionKey !== 'string' ||
        typeof parsed.setAt !== 'number' ||
        typeof parsed.updatedAt !== 'number'
      ) {
        return null
      }

      return {
        sessionKey: parsed.sessionKey,
        setAt: parsed.setAt,
        updatedAt: parsed.updatedAt,
        ...(typeof parsed.organizationId === 'string'
          ? { organizationId: parsed.organizationId }
          : {}),
      }
    } catch {
      return null
    }
  }

  async set(credential: ClaudeWebCredential): Promise<void> {
    await this.ensureDir()
    await this.app.vault.adapter.write(
      this.file,
      JSON.stringify(credential, null, 2),
    )
  }

  async clear(): Promise<void> {
    const exists = await this.app.vault.adapter.exists(this.file)
    if (!exists) {
      return
    }
    await this.app.vault.adapter.remove(this.file)
  }

  isStale(credential: Pick<ClaudeWebCredential, 'setAt'>): boolean {
    return credential.setAt <= Date.now() - STALE_THRESHOLD_MS
  }

  private async ensureDir(): Promise<void> {
    const credentialDir = normalizePath(
      path.posix.join(this.dir, CREDENTIAL_DIR_NAME),
    )
    const exists = await this.app.vault.adapter.exists(credentialDir)
    if (exists) {
      return
    }
    await this.app.vault.adapter.mkdir(credentialDir)
  }
}
