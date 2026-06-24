import './globals.css';

export const metadata = {
  title: 'Dalat TikTok Carousel Tool',
  description: 'Next.js frontend for the Dalat carousel deck studio',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
