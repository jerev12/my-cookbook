import dynamic from 'next/dynamic';
import PublicRecipesFeed from './PublicRecipesFeed';

const CommunitySearch = dynamic(() => import('./CommunitySearch'), { ssr: false });

export default function CommunityPage() {
  return (
    <div className="mx-auto max-w-3xl p-4">
      <CommunitySearch />
      <PublicRecipesFeed />
    </div>
  );
}
