import { streamText, convertToModelMessages, validateUIMessages, stepCountIs } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/bigcommerce/auth';
import { getModel } from '@/lib/ai/models';
import { createBcTools } from '@/lib/ai/tools';
import { buildSystemPrompt } from '@/lib/ai/system-prompt';

const MAX_MESSAGES_PER_REQUEST = 50;
const MAX_TOOL_ROUNDS = 10;

/**
 * POST /stores/[storeHash]/api/chat
 *
 * Streaming chat endpoint using Vercel AI SDK.
 * Accepts optional context for page-aware system prompt.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storeHash: string }> },
) {
  const { storeHash } = await params;

  let session;
  try {
    session = await authorize(storeHash);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { messages?: unknown; context?: { type?: string; id?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { messages, context } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return NextResponse.json({ error: `Too many messages (max ${MAX_MESSAGES_PER_REQUEST})` }, { status: 400 });
  }

  // Validate context if provided
  let chatContext: { type: 'order' | 'product' | 'section'; id: string } | undefined;
  if (context?.type && context?.id) {
    const validTypes = ['order', 'product', 'section'];
    if (validTypes.includes(context.type)) {
      chatContext = { type: context.type as 'order' | 'product' | 'section', id: context.id };
    }
  }

  const validated = await validateUIMessages({ messages });
  const modelMessages = await convertToModelMessages(validated);

  const tools = createBcTools({
    storeHash,
    accessToken: session.accessToken,
  });

  const result = streamText({
    model: getModel('chat'),
    system: buildSystemPrompt(chatContext),
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    maxOutputTokens: 4096,
  });

  return result.toUIMessageStreamResponse();
}
