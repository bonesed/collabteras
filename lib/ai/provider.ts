import 'server-only';

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import type { z } from 'zod';

import { serverEnv } from '@/lib/env';

const OPENAI_MODEL = 'gpt-4o';
const GEMINI_MODEL = 'gemini-2.0-flash';

export class AiProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiProviderError';
  }
}

export interface JsonGenerationRequest<T> {
  systemPrompt: string;
  userPrompt: string;
  /** 応答の検証に使うスキーマ。通らなければ AiProviderError にする */
  schema: z.ZodType<T>;
}

export interface JsonGenerationResult<T> {
  data: T;
  /** どのモデルで生成したか。再現性のため proposals に保存する */
  model: string;
}

/**
 * JSON を返す生成を、プロバイダ差を吸収して 1 つの関数にまとめる。
 * OPENAI_API_KEY があれば OpenAI を、なければ Gemini を使う。
 */
export async function generateJson<T>(
  request: JsonGenerationRequest<T>,
): Promise<JsonGenerationResult<T>> {
  const env = serverEnv();

  if (env.OPENAI_API_KEY !== undefined) {
    return parseResponse(
      await generateWithOpenAi(env.OPENAI_API_KEY, request),
      OPENAI_MODEL,
      request.schema,
    );
  }

  if (env.GOOGLE_GEMINI_API_KEY !== undefined) {
    return parseResponse(
      await generateWithGemini(env.GOOGLE_GEMINI_API_KEY, request),
      GEMINI_MODEL,
      request.schema,
    );
  }

  throw new AiProviderError(
    'AI の API キーが設定されていません。OPENAI_API_KEY か GOOGLE_GEMINI_API_KEY を設定してください。',
  );
}

async function generateWithOpenAi<T>(
  apiKey: string,
  request: JsonGenerationRequest<T>,
): Promise<string> {
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ],
  });

  const content = completion.choices[0]?.message.content;

  if (content === null || content === undefined) {
    throw new AiProviderError('AI から空の応答が返りました。');
  }

  return content;
}

async function generateWithGemini<T>(
  apiKey: string,
  request: JsonGenerationRequest<T>,
): Promise<string> {
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: request.userPrompt,
    config: {
      systemInstruction: request.systemPrompt,
      temperature: 0.4,
      responseMimeType: 'application/json',
    },
  });

  const content = response.text;

  if (content === undefined || content === '') {
    throw new AiProviderError('AI から空の応答が返りました。');
  }

  return content;
}

function parseResponse<T>(
  raw: string,
  model: string,
  schema: z.ZodType<T>,
): JsonGenerationResult<T> {
  let json: unknown;

  try {
    json = JSON.parse(raw);
  } catch (cause) {
    throw new AiProviderError('AI の応答を JSON として解釈できませんでした。', {
      cause,
    });
  }

  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    throw new AiProviderError('AI の応答が期待した形式ではありませんでした。', {
      cause: parsed.error,
    });
  }

  return { data: parsed.data, model };
}
