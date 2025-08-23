'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/friends',   label: 'Friends' },
  { href: '/community', label: 'Community' },
  { href: '/cookbook',  label: 'My Cookbook' },
];

export default function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-white">
      <ul className="flex justify-around py-2">
        {tabs.map(t => {
          const active = pathname?.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`px-4 py-2 text-sm ${active ? 'font-semibold underline' : 'text-gray-600'}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
