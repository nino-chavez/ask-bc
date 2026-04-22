import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/bigcommerce/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { getRedis } from '@/lib/redis';

const FEEDBACK_KEY_PREFIX = 'ask-bc:feedback:';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storeHash: string }> },
) {
  const { storeHash } = await params;

  const csrfError = assertSameOrigin(request);
  if (csrfError) {
    return NextResponse.json({ error: csrfError }, { status: 403 });
  }

  try {
    await authorize(storeHash);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { messageId?: string; rating?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.messageId || !body.rating || !['up', 'down'].includes(body.rating)) {
    return NextResponse.json({ error: 'messageId and rating (up|down) required' }, { status: 400 });
  }

  const redis = getRedis();
  if (redis) {
    const key = `${FEEDBACK_KEY_PREFIX}${storeHash}`;
    const entry = {
      messageId: body.messageId,
      rating: body.rating,
      timestamp: Date.now(),
    };
    // Append to a list (capped at 1000 most recent)
    await redis.lpush(key, JSON.stringify(entry));
    await redis.ltrim(key, 0, 999);
  }

  return NextResponse.json({ ok: true });
}
