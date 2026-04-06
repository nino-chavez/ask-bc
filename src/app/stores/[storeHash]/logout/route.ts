import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * POST /stores/[storeHash]/logout
 *
 * Called by the BigCommerce JS SDK when the merchant logs out.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ storeHash: string }> },
) {
  const { storeHash } = await params;
  const cookieStore = await cookies();
  cookieStore.delete({
    name: 'session-token',
    path: `/stores/${storeHash}`,
  });

  return new NextResponse(null, { status: 200 });
}
