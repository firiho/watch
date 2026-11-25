import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getPersonDetails, getPersonCombinedCredits } from '@/lib/tmdb';
import { ageFrom, formatDisplayDate } from '@/lib/format';
import MovieCard from '@/components/movie-card/movie-card';
import BiographyToggle from './biography-toggle';
import Filmography from './filmography';
import { shapeCredits } from './credits';
import styles from './star.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const details = await getPersonDetails(id);
  if (!details) return { title: 'Not found · Watch' };
  const bio: string = (details.biography || '').replace(/\s+/g, ' ').trim();
  return {
    title: `${details.name} · Watch`,
    description: bio ? `${bio.slice(0, 157)}${bio.length > 157 ? '…' : ''}` : undefined,
  };
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default async function StarPage({ params }: PageProps) {
  const { id } = await params;

  const [details, credits] = await Promise.all([
    getPersonDetails(id),
    getPersonCombinedCredits(id),
  ]);

  if (!details) notFound();

  const name: string = details.name || 'Unknown';
  const department: string | undefined = details.known_for_department || undefined;
  const profilePath: string | null = details.profile_path || null;
  const born = formatDisplayDate(details.birthday);
  const died = formatDisplayDate(details.deathday);
  const age = ageFrom(details.birthday, details.deathday);
  const place: string | undefined = details.place_of_birth || undefined;
  const hasFacts = Boolean(born || died || place);

  const { knownFor, groups } = shapeCredits(credits, department);
  // "Director" under every poster says nothing; captions only when roles differ.
  const showRoles = new Set(knownFor.map((credit) => credit.role)).size > 1;

  let sectionIndex = 0;
  const nextIndex = () => `${String(++sectionIndex).padStart(2, '0')}.`;

  return (
    <main className={styles.main}>
      <header className={styles.hero}>
        {profilePath && (
          <div className={styles.heroBackdrop} aria-hidden="true">
            {/* Tiny source on purpose: it's blurred into a color wash. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${TMDB_IMAGE}/w185${profilePath}`} alt="" className={styles.heroBackdropImage} decoding="async" />
          </div>
        )}

        <div className={styles.heroInner}>
          <div className={styles.portrait}>
            {profilePath ? (
              <Image
                src={`${TMDB_IMAGE}/w500${profilePath}`}
                alt={name}
                fill
                sizes="(max-width: 768px) 148px, 220px"
                className={styles.portraitImage}
                fetchPriority="high"
                loading="eager"
              />
            ) : (
              <span className={styles.portraitFallback} aria-hidden="true">
                {initialsOf(name)}
              </span>
            )}
          </div>

          <div className={styles.info}>
            {department && <p className={styles.department}>{department}</p>}
            <h1 className={styles.name}>{name}</h1>

            {hasFacts && (
              <dl className={styles.facts}>
                {born && (
                  <div className={styles.fact}>
                    <dt>Born</dt>
                    <dd>
                      {born}
                      {!died && age != null && <span className={styles.factExtra}>age {age}</span>}
                    </dd>
                  </div>
                )}
                {died && (
                  <div className={styles.fact}>
                    <dt>Died</dt>
                    <dd>
                      {died}
                      {age != null && <span className={styles.factExtra}>aged {age}</span>}
                    </dd>
                  </div>
                )}
                {place && (
                  <div className={`${styles.fact} ${styles.factPlace}`}>
                    <dt>Birthplace</dt>
                    <dd>
                      <svg className={styles.pin} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {place}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {details.biography && <BiographyToggle biography={details.biography} />}
          </div>
        </div>
      </header>

      {knownFor.length > 0 && (
        <section className={styles.section} aria-labelledby="known-for-title">
          <div className={styles.sectionHeader}>
            <h2 id="known-for-title" className={styles.sectionTitle}>
              <span className={styles.sectionIndex}>{nextIndex()}</span> Known For
            </h2>
            <span className={styles.sectionLine} aria-hidden="true" />
          </div>

          <div className={styles.knownFor}>
            {knownFor.map((credit, index) => (
              <div key={credit.key} className={styles.knownForItem}>
                <MovieCard
                  eager={index < 4}
                  id={credit.id}
                  title={credit.title}
                  year={credit.year}
                  // MovieCard strips these exact w500 / w780 prefixes when saving to My List.
                  image={`${TMDB_IMAGE}/w500${credit.poster}`}
                  rating={credit.voteAverage.toFixed(1)}
                  mediaType={credit.mediaType}
                  description={credit.overview}
                  backdrop={credit.backdrop ? `${TMDB_IMAGE}/w780${credit.backdrop}` : undefined}
                />
                {showRoles && credit.role && <p className={styles.knownForRole}>{credit.role}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {groups.length > 0 && <Filmography groups={groups} index={nextIndex()} />}
    </main>
  );
}
