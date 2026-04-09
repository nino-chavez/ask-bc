import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/bigcommerce/auth';
import { getRedis } from '@/lib/redis';
import { isValidThemeId, DEFAULT_THEME_ID } from '@/lib/themes';
import type { ThemeId } from '@/lib/themes';

const THEME_KEY_PREFIX = 'ask-bc:theme:';

function themeKey(storeHash: string) {
  return `${THEME_KEY_PREFIX}${storeHash}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeHash: string }> },
) {
  const { storeHash } = await params;

  try {
    await authorize(storeHash);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const redis = getRedis();
  let theme: ThemeId = DEFAULT_THEME_ID;

  if (redis) {
    const stored = await redis.get<string>(themeKey(storeHash));
    if (stored && isValidThemeId(stored)) {
      theme = stored;
    }
  }

  return NextResponse.json({ theme });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storeHash: string }> },
) {
  const { storeHash } = await params;

  try {
    await authorize(storeHash);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { theme?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.theme || !isValidThemeId(body.theme)) {
    return NextResponse.json(
      { error: 'Invalid theme. Valid: bc-native, ai-assistant, dashboard' },
      { status: 400 },
    );
  }

  const redis = getRedis();
  if (redis) {
    await redis.set(themeKey(storeHash), body.theme);
  }

  return NextResponse.json({ theme: body.theme });
}
