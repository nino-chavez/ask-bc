import ThemeProvider from '@/components/ThemeProvider';

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
