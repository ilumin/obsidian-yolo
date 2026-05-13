import { RequestMessage } from '../../types/llm/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../../types/llm/response'

export type ClaudeWebRequestPayload = {
  prompt: string
  model: string
  max_tokens_to_sample: number
  stream: boolean
  timezone: string
}

type ClaudeWebStreamEvent = {
  type: string
  completion?: string
  stop_reason?: string | null
  model?: string
  error?: {
    type?: string
    message?: string
  }
}

const buildHumanAssistantPrompt = (messages: RequestMessage[]): string => {
  const parts: string[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      parts.push(`\n\nHuman: <system>${msg.content}</system>`)
    } else if (msg.role === 'user') {
      const text =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter((p) => p.type === 'text')
              .map((p) => (p as { type: 'text'; text: string }).text)
              .join('\n')
      parts.push(`\n\nHuman: ${text}`)
    } else if (msg.role === 'assistant') {
      parts.push(`\n\nAssistant: ${msg.content}`)
    }
  }

  parts.push('\n\nAssistant:')
  return parts.join('')
}

export class ClaudeWebMessageAdapter {
  buildRequestPayload(
    messages: RequestMessage[],
    modelId: string,
    maxTokens?: number,
  ): ClaudeWebRequestPayload {
    return {
      prompt: buildHumanAssistantPrompt(messages),
      model: modelId,
      max_tokens_to_sample: maxTokens ?? 8192,
      stream: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  }

  parseStreamEvent(
    rawData: string,
    requestId: string,
    modelId: string,
  ): LLMResponseStreaming | null {
    let event: ClaudeWebStreamEvent
    try {
      event = JSON.parse(rawData) as ClaudeWebStreamEvent
    } catch {
      return null
    }

    if (event.type === 'error') {
      const msg =
        event.error?.message ?? 'Unknown error from claude.ai'
      throw new Error(`claude.ai error: ${msg}`)
    }

    if (event.type !== 'completion') {
      return null
    }

    const delta = event.completion ?? ''
    const finishReason = event.stop_reason ?? null

    return {
      id: requestId,
      object: 'chat.completion.chunk',
      model: modelId,
      choices: [
        {
          finish_reason: finishReason,
          delta: {
            content: delta,
            role: 'assistant',
          },
        },
      ],
    }
  }

  parseFullResponse(
    text: string,
    requestId: string,
    modelId: string,
  ): LLMResponseNonStreaming {
    return {
      id: requestId,
      object: 'chat.completion',
      model: modelId,
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: text,
            role: 'assistant',
          },
        },
      ],
    }
  }
}
