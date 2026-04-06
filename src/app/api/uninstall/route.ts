import { NextRequest, NextResponse } from 'next/server';
import { verifyBcJwt } from '@/lib/bigcommerce/auth';
import { deleteStoreCredentials } from '@/lib/store-credentials';

/**
 * GET /api/uninstall
 *
 * Called by BigCommerce when a merchant uninstalls the app.
 */
export async function GET(request: NextRequest) {
  const signedPayloadJwt = request.nextUrl.searchParams.get('signed_payload_jwt');

  if (!signedPayloadJwt) {
    return NextResponse.json({ error: 'Missing signed_payload_jwt' }, { status: 400 });
  }

  try {
    const payload = await verifyBcJwt(signedPayloadJwt);
    const storeHash = payload.sub;

    await deleteStoreCredentials(storeHash);

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error('Uninstall callback failed:', error);
    return new NextResponse(null, { status: 200 });
  }
}
