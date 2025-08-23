import type { ReactNode } from 'react';
import BottomTabs from '../components/BottomTabs';

export const metadata = { title: 'Cookbook' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          background: '#f7f7fb',
          color: '#1f2333',
          margin: 0,
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          // Added so the fixed bottom tabs don't cover your content (~4rem)
          paddingBottom: '64px',
        }}
      >
        {children}

        {/* Global bottom navigation */}
        <BottomTabs />
      </body>
    </html>
  );
}
