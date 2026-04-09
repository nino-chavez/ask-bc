import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/bigcommerce/auth';
import { registerAppExtensions } from '@/lib/bigcommerce/app-extensions';
import { env } from '@/lib/env';

/**
 * POST /stores/[storeHash]/api/extensions
 *
 * Lazy registration: ensures all expected App Extensions exist.
 * Called on app load to self-heal missing extensions without reinstall.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ storeHash: string }> },
) {
  const { storeHash } = await params;

  let session;
  try {
    session = await authorize(storeHash);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const registered = await registerAppExtensions(
      storeHash,
      session.accessToken,
      env.APP_ORIGIN,
    );
    return NextResponse.json({ registered: registered.length });
  } catch {
    // Non-critical — don't fail the app load
    return NextResponse.json({ registered: 0 });
  }
}
