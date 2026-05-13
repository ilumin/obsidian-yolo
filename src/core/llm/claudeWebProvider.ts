import { ChatModel } from '../../types/chat-model.types'
import {
  LLMOptions,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
} from '../../types/llm/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../../types/llm/response'
import { LLMProvider } from '../../types/provider.types'
import { getClaudeWebService } from '../auth/claudeWebRuntime'

import { BaseLLMProvider } from './base'
import { ClaudeWebMessageAdapter } from './claudeWebMessageAdapter'
import { LLMProviderNotConfiguredException } from './exception'
import { createDesktopNodeFetch } from './sdkFetch'

const CLAUDE_AI_BASE_URL = 'https://claude.ai/api'

const generateRequestId = (): string =>
  `claude-web-${Date.now()}-${Math.random().toString(36).slice(2)}`

async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data && data !== '[DONE]') {
            yield data
          }
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6).trim()
      if (data && data !== '[DONE]') {
        yield data
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export class ClaudeWebProvider extends BaseLLMProvider<LLMProvider> {
  private readonly adapter = new ClaudeWebMessageAdapter()
  private readonly nodeFetch = createDesktopNodeFetch()

  async generateResponse(
    model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> {
    const chunks: string[] = []
    const streamRequest: LLMRequestStreaming = { ...request, stream: true }
    const stream = await this.streamResponse(model, streamRequest, options)

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        chunks.push(content)
      }
    }

    const requestId = generateRequestId()
    return this.adapter.parseFullResponse(chunks.join(''), requestId, model.model ?? model.id)
  }

  async streamResponse(
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    const service = getClaudeWebService(this.provider.id)
    if (!service) {
      throw new LLMProviderNotConfiguredException(
        'Claude.ai service not initialized. Please configure the provider.',
      )
    }

    const credential = await service.getUsableCredential()
    if (!credential) {
      throw new LLMProviderNotConfiguredException(
        'Claude.ai session key not configured. Please add your session key in the provider settings.',
      )
    }

    const { sessionKey, organizationId } = credential
    if (!organizationId) {
      throw new LLMProviderNotConfiguredException(
        'Claude.ai organization ID not found. Please re-save your session key in the provider settings.',
      )
    }

    const requestId = generateRequestId()
    const modelId = model.model ?? model.id
    const payload = this.adapter.buildRequestPayload(
      request.messages,
      modelId,
      request.max_tokens,
    )

    const convId = crypto.randomUUID()
    const convUrl = `${CLAUDE_AI_BASE_URL}/organizations/${organizationId}/chat_conversations`
    const completionUrl = `${CLAUDE_AI_BASE_URL}/organizations/${organizationId}/chat_conversations/${convId}/completion`

    const commonHeaders = {
      'Content-Type': 'application/json',
      Cookie: `sessionKey=${sessionKey}`,
    }

    await this.nodeFetch(convUrl, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify({ uuid: convId, name: '' }),
      signal: options?.signal,
    })

    const completionResponse = await this.nodeFetch(completionUrl, {
      method: 'POST',
      headers: {
        ...commonHeaders,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(payload),
      signal: options?.signal,
    })

    if (!completionResponse.ok) {
      const text = await completionResponse.text()
      throw new Error(
        `claude.ai API error ${completionResponse.status}: ${text}`,
      )
    }

    if (!completionResponse.body) {
      throw new Error('claude.ai returned empty response body')
    }

    const sseStream = completionResponse.body
    const adapter = this.adapter

    return {
      [Symbol.asyncIterator](): AsyncIterator<LLMResponseStreaming> {
        const generator = parseSSEStream(sseStream)
        return {
          async next() {
            while (true) {
              const { done, value } = await generator.next()
              if (done) {
                return { done: true, value: undefined as unknown as LLMResponseStreaming }
              }
              try {
                const chunk = adapter.parseStreamEvent(value, requestId, modelId)
                if (chunk !== null) {
                  return { done: false, value: chunk }
                }
              } catch (error) {
                throw error
              }
            }
          },
          async return() {
            await generator.return(undefined)
            return { done: true, value: undefined as unknown as LLMResponseStreaming }
          },
        }
      },
    }
  }

  async getEmbedding(
    _model: string,
    _text: string,
    _options?: { dimensions?: number },
  ): Promise<number[]> {
    throw new LLMProviderNotConfiguredException(
      'Claude.ai (Pro/Max) does not support embeddings.',
    )
  }
}
