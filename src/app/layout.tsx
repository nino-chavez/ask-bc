import type { Metadata } from 'next';
import { Source_Sans_3 } from 'next/font/google';
import StyledComponentsRegistry from '@/components/StyledComponentsRegistry';
import BigCommerceSDK from '@/components/BigCommerceSDK';
import './globals.css';

// BigDesign theme declares fontFamily as
// '"Source Sans 3", "Source Sans Pro", "Helvetica Neue", Arial, sans-serif'.
// Without explicit loading the browser falls back to system sans-serif,
// which produces visibly different weights + letter-spacing vs the BC
// core admin chrome. next/font/google self-hosts the font with FOUT
// suppression, matching what BC's admin shell loads.
const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-source-sans',
});

export const metadata: Metadata = {
  title: 'Ask BC — BigCommerce Store Assistant',
  description: 'AI-powered store assistant for BigCommerce merchants',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={sourceSans.variable}>
      <body>
        <StyledComponentsRegistry>
          <BigCommerceSDK />
          {children}
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
