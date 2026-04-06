'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';

/**
 * Loads the BigCommerce JS SDK for iframe session sync.
 * Only renders on /stores/[storeHash] routes (inside BC admin iframe).
 */
export default function BigCommerceSDK() {
  const pathname = usePathname();

  const match = pathname.match(/^\/stores\/([^/]+)/);
  if (!match) return null;

  const storeHash = match[1];

  return (
    <>
      <Script
        src="https://cdn.bigcommerce.com/jssdk/bc-sdk.js"
        strategy="beforeInteractive"
      />
      <Script id="bc-sdk-init">
        {`
          window.bcAsyncInit = function() {
            Bigcommerce.init({
              onLogout: function() {
                fetch('/stores/${storeHash}/logout', {
                  method: 'POST',
                  credentials: 'include'
                }).then(function() {
                  window.location.href = '/';
                });
              }
            });
          };
        `}
      </Script>
    </>
  );
}
