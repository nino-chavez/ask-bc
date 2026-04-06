import type { Metadata } from 'next';
import StyledComponentsRegistry from '@/components/StyledComponentsRegistry';
import BigCommerceSDK from '@/components/BigCommerceSDK';
import './globals.css';

export const metadata: Metadata = {
  title: 'App AI — BigCommerce Store Assistant',
  description: 'AI-powered assistant for BigCommerce merchants',
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
