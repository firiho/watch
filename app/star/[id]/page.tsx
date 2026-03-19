import { getPersonDetails, getPersonCombinedCredits } from '@/lib/tmdb';
import styles from './star.module.css';
import MovieCard from '@/components/movie-card/movie-card';
import BiographyToggle from './biography-toggle';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StarPage({ params }: PageProps) {
  const { id } = await params;
  
  const [details, credits] = await Promise.all([
    getPersonDetails(id),
    getPersonCombinedCredits(id),
  ]);

  if (!details) {
    return (
      <main className={styles.main}>
        <h1>Star not found</h1>
      </main>
    );
  }

  // Sort credits by popularity
  const sortedCredits = credits?.cast?.sort((a: any, b: any) => {
    return (b.popularity || 0) - (a.popularity || 0);
  }) || [];

  return (
    <main className={styles.main}>
      <header className={styles.profileContainer}>
        <div className={styles.avatarWrapper}>
          {details.profile_path ? (
            <img
              src={`https://image.tmdb.org/t/p/w500${details.profile_path}`}
              alt={details.name}
              className={styles.profileImage}
            />
          ) : (
            <div className={styles.noImage}>👤</div>
          )}
        </div>
        <div className={styles.info}>
          <h1 className={styles.name}>{details.name}</h1>
          <p className={styles.knownFor}>{details.known_for_department}</p>
          <div className={styles.metaGrid}>
            {details.birthday && (
              <div className={styles.meta}>
                <strong>Born</strong>
                <span>{details.birthday}{details.place_of_birth && ` • ${details.place_of_birth}`}</span>
              </div>
            )}
            {details.deathday && (
              <div className={styles.meta}>
                <strong>Died</strong>
                <span>{details.deathday}</span>
              </div>
            )}
          </div>
          
          {details.biography && (
            <BiographyToggle biography={details.biography} />
          )}
        </div>
      </header>

      {sortedCredits.length > 0 && (
        <section className={styles.section}>
          <h2>Known For</h2>
          <div className={styles.creditsGrid}>
            {sortedCredits.map((credit: any, index: number) => {
              const creditId = credit.id;
              const type = credit.media_type || (credit.name ? 'tv' : 'movie');
              const title = credit.title || credit.name;
              const year = (credit.release_date || credit.first_air_date || '').split('-')[0];
              const image = credit.poster_path ? `https://image.tmdb.org/t/p/w500${credit.poster_path}` : null;
              const creditKey = credit.credit_id || `${type}-${creditId}-${credit.character || credit.job || index}`;
              
              if (!image) return null;

              return (
                <MovieCard
                  key={creditKey}
                  id={creditId}
                  title={title}
                  year={year}
                  image={image}
                  rating={(credit.vote_average || 0).toFixed(1)}
                  mediaType={type}
                  description={credit.overview}
                  backdrop={credit.backdrop_path ? `https://image.tmdb.org/t/p/w780${credit.backdrop_path}` : undefined}
                />
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}