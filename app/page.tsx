import HeroGallery from '@/components/hero-gallery/hero-gallery';
import ContentRail from '@/components/content-rail/content-rail';
import { getTrendingMovies, getTrendingTVShows, getFeaturedContent } from '@/lib/tmdb';
import styles from './page.module.css';

export default async function Home() {
  const [featuredItems, trendingMovies, trendingTVShows] = await Promise.all([
    getFeaturedContent(),
    getTrendingMovies(),
    getTrendingTVShows(),
  ]);

  return (
    <main className={styles.main}>
      <HeroGallery items={featuredItems} />

      <div className={styles.contentSections}>
        <ContentRail 
          title="Trending Movies" 
          data={trendingMovies} 
        />

        <ContentRail 
          title="Trending TV Shows" 
          data={trendingTVShows} 
        />
      </div>
    </main>
  );
}
