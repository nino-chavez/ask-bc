import { NextRequest, NextResponse } from 'next/server';
import { verifyBcJwt } from '@/lib/bigcommerce/auth';
import { deleteStoreUser } from '@/lib/store-credentials';

/**
 * GET /api/remove-user
 *
 * Called by BigCommerce when a user's access to the app is revoked.
 */
export async function GET(request: NextRequest) {
  const signedPayloadJwt = request.nextUrl.searchParams.get('signed_payload_jwt');

  if (!signedPayloadJwt) {
    return NextResponse.json({ error: 'Missing signed_payload_jwt' }, { status: 400 });
  }

  try {
    const payload = await verifyBcJwt(signedPayloadJwt);
    const storeHash = payload.sub;
    const userId = payload.user.id;

    await deleteStoreUser(storeHash, userId);

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error('Remove user callback failed:', error);
    return new NextResponse(null, { status: 200 });
  }
}
