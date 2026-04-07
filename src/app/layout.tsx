import type { Metadata } from 'next';
import StyledComponentsRegistry from '@/components/StyledComponentsRegistry';
import BigCommerceSDK from '@/components/BigCommerceSDK';
import './globals.css';

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
    <html lang="en">
      <body>
        <StyledComponentsRegistry>
          <BigCommerceSDK />
          {children}
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
