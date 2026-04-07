export default function ExtensionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ThemeProvider is already provided by the parent [storeHash] layout
  return <>{children}</>;
}
