import type { Metadata } from 'next';
import { ADMIN_NAME } from '@/lib/admin';

// The page itself is a client component, so its shareable title lives here.
export const metadata: Metadata = {
  title: `${ADMIN_NAME}'s Recs · Watch`,
  description: `Movies and TV shows ${ADMIN_NAME} recommends, rated out of five stars.`,
};

export default function RecsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
