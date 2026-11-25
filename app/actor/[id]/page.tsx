import { permanentRedirect } from 'next/navigation';

/**
 * Legacy route: the person page lives at /star/[id]. Redirect instead of
 * rendering the old "coming soon" placeholder so stray links land somewhere real.
 */
export default async function ActorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/star/${encodeURIComponent(id)}`);
}
