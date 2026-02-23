import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { z, type ZodType } from 'zod';
import type { RuntimeContext } from './runtime.js';

interface LlmMessages {
  system: string;
  user: string;
}

interface CallJsonOptions {
  parseRetries?: number;
}

async function openaiChat(system: string, user: string, model: string, temperature: number): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for OpenAI provider');
  }

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model,
    temperature,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  throw new Error('OpenAI returned empty response text');
}

async function anthropicChat(system: string, user: string, model: string, temperature: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    temperature,
    max_tokens: 1_500,
    system,
    messages: [{ role: 'user', content: user }]
  });

  const firstTextBlock = response.content.find((item) => item.type === 'text');
  if (firstTextBlock && 'text' in firstTextBlock) {
    return firstTextBlock.text;
  }

  throw new Error('Anthropic returned empty response text');
}

async function ollamaChat(system: string, user: string, model: string, temperature: number): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      options: {
        temperature
      },
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status})`);
  }

  const json = (await response.json()) as { message?: { content?: string } };
  const text = json.message?.content;
  if (!text) {
    throw new Error('Ollama returned empty response content');
  }

  return text;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }
  }

  throw new Error('Model did not return valid JSON');
}

export async function callJsonModel<T>(
  ctx: RuntimeContext,
  messages: LlmMessages,
  schema: ZodType<T>,
  options: CallJsonOptions = {}
): Promise<T> {
  const parseRetries = options.parseRetries ?? 2;
  const { provider, model, temperature } = ctx.config.llm;

  let lastError: unknown;
  let userPrompt = `${messages.user}\n\nReturn ONLY valid JSON.`;

  for (let attempt = 0; attempt <= parseRetries; attempt += 1) {
    try {
      const raw =
        provider === 'openai'
          ? await openaiChat(messages.system, userPrompt, model, temperature)
          : provider === 'anthropic'
            ? await anthropicChat(messages.system, userPrompt, model, temperature)
            : await ollamaChat(messages.system, userPrompt, model, temperature);

      const parsed = extractJson(raw);
      return schema.parse(parsed);
    } catch (error) {
      lastError = error;
      userPrompt = `${messages.user}\n\nPrevious output was invalid JSON for this exact schema. Return only JSON and match schema keys exactly.`;
    }
  }

  throw lastError ?? new Error('LLM JSON parse failed');
}

export const scoreSchema = z.object({
  score: z.number().int().min(1).max(10),
  reasoning: z.string().min(1)
});

export const tailorSchema = z.object({
  resumeMarkdown: z.string().min(1),
  highlights: z.array(z.string()).min(1)
});

export const coverSchema = z.object({
  coverLetterMarkdown: z.string().min(1),
  tone: z.string().min(1)
});
