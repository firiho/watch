/**
 * Shapes TMDB combined credits for the person page.
 *
 * TMDB returns one entry per role, so a talk show someone visited five times
 * shows up five times, and its huge, volatile `popularity` floats it above the
 * films the person is actually known for (Brad Pitt's old "Known For" opened
 * with The Daily Show and three copies of SNL). Here credits are bucketed
 * (acting / appearances as self / each crew department), merged per title,
 * and "Known For" is ranked by audience size weighted by how substantial the
 * role was.
 */

export type MediaType = 'movie' | 'tv';

/** The subset of a TMDB combined-credits entry this page reads. */
export interface TmdbCredit {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  character?: string;
  job?: string;
  department?: string;
  release_date?: string;
  first_air_date?: string;
  first_credit_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  episode_count?: number;
  order?: number;
  credit_id?: string;
}

export interface PersonCredit {
  key: string;
  id: number;
  mediaType: MediaType;
  title: string;
  /** YYYY-MM-DD (or YYYY) used for sorting; null when TMDB has no date. */
  date: string | null;
  year: string;
  role: string;
  poster: string | null;
  backdrop: string | null;
  overview: string;
  voteAverage: number;
  voteCount: number;
  episodes: number;
  order: number | null;
}

/** A compact row for the client-side filmography list (unique per group by mediaType + id). */
export interface FilmographyRow {
  id: number;
  mediaType: MediaType;
  title: string;
  year: string;
  role: string;
  poster: string | null;
  episodes: number;
}

export interface FilmographyGroup {
  id: string;
  label: string;
  rows: FilmographyRow[];
}

const TALK_NEWS_REALITY = new Set([10767, 10763, 10764]);
const DOCUMENTARY = 99;
const SELF_ROLE = /\b(self|himself|herself|themselves|themself)\b/i;
const ARCHIVE_ONLY = /^\(?archive footage\)?$/i;
/** A "self" credit with this many episodes is a host or a regular, not a guest spot. */
const REGULAR_EPISODES = 20;

const DEPARTMENT_LABELS: Record<string, string> = {
  Acting: 'Acting',
  Directing: 'Directing',
  Writing: 'Writing',
  Production: 'Production',
  Sound: 'Music & Sound',
  Camera: 'Camera',
  Editing: 'Editing',
  Art: 'Art',
  'Costume & Make-Up': 'Costume & Make-Up',
  'Visual Effects': 'Visual Effects',
  Lighting: 'Lighting',
  Creator: 'Creator',
  Crew: 'Crew',
};

function mediaTypeOf(credit: TmdbCredit): MediaType | null {
  if (credit.media_type === 'movie' || credit.media_type === 'tv') return credit.media_type;
  if (credit.title) return 'movie';
  if (credit.name) return 'tv';
  return null;
}

function isSelfAppearance(credit: TmdbCredit): boolean {
  const role = credit.character?.trim() ?? '';
  const genres = credit.genre_ids ?? [];
  const looksLikeSelf =
    SELF_ROLE.test(role) ||
    ARCHIVE_ONLY.test(role) ||
    genres.some((genre) => TALK_NEWS_REALITY.has(genre)) ||
    (!role && genres.includes(DOCUMENTARY));
  if (!looksLikeSelf) return false;
  // Hosting your own show for years is what you're known for, not an appearance.
  return (credit.episode_count ?? 0) < REGULAR_EPISODES;
}

function creditDate(credit: TmdbCredit, type: MediaType): string | null {
  const raw =
    type === 'tv'
      ? credit.first_credit_air_date || credit.first_air_date
      : credit.release_date;
  return raw && raw.trim() ? raw.trim() : null;
}

/** Merges per-role entries into one entry per title, keeping every distinct role. */
function mergeByTitle(credits: TmdbCredit[], roleOf: (credit: TmdbCredit) => string | undefined): PersonCredit[] {
  const merged = new Map<string, PersonCredit & { roles: string[] }>();

  for (const credit of credits) {
    const type = mediaTypeOf(credit);
    if (!type || !credit.id) continue;
    const key = `${type}-${credit.id}`;
    const role = roleOf(credit)?.trim();
    const date = creditDate(credit, type);
    const existing = merged.get(key);

    if (existing) {
      if (role && !existing.roles.includes(role)) existing.roles.push(role);
      existing.episodes += credit.episode_count ?? 0;
      if (credit.order != null) existing.order = existing.order == null ? credit.order : Math.min(existing.order, credit.order);
      // Earliest appearance wins for the year column.
      if (date && (!existing.date || date < existing.date)) existing.date = date;
      continue;
    }

    merged.set(key, {
      key,
      id: credit.id,
      mediaType: type,
      title: credit.title || credit.name || 'Untitled',
      date,
      year: '',
      role: '',
      roles: role ? [role] : [],
      poster: credit.poster_path || null,
      backdrop: credit.backdrop_path || null,
      overview: credit.overview || '',
      voteAverage: credit.vote_average || 0,
      voteCount: credit.vote_count || 0,
      episodes: credit.episode_count ?? 0,
      order: credit.order ?? null,
    });
  }

  return Array.from(merged.values()).map(({ roles, ...credit }) => ({
    ...credit,
    year: credit.date ? credit.date.slice(0, 4) : '',
    role: roles.join(', '),
  }));
}

/** Audience size, discounted for one-off guest spots, deep-cast cameos and reused footage. */
function knownForScore(credit: PersonCredit): number {
  let score = credit.voteCount;
  if (/archive footage/i.test(credit.role)) score *= 0.25;
  else if (/uncredited/i.test(credit.role)) score *= 0.5;
  if (credit.mediaType === 'tv') {
    score *= Math.min(1, Math.max(credit.episodes, 1) / 8);
  } else if (credit.order != null) {
    if (credit.order > 12) score *= 0.5;
    else if (credit.order > 5) score *= 0.8;
  }
  return score;
}

/** Newest first; undated (announced / in development) entries lead the list. */
function byDateDesc(a: PersonCredit, b: PersonCredit): number {
  if (!a.date && !b.date) return b.voteCount - a.voteCount;
  if (!a.date) return -1;
  if (!b.date) return 1;
  if (a.date === b.date) return b.voteCount - a.voteCount;
  return a.date < b.date ? 1 : -1;
}

function toRow(credit: PersonCredit): FilmographyRow {
  return {
    id: credit.id,
    mediaType: credit.mediaType,
    title: credit.title,
    year: credit.year,
    role: credit.role,
    poster: credit.poster,
    episodes: credit.episodes,
  };
}

export interface ShapedCredits {
  knownFor: PersonCredit[];
  groups: FilmographyGroup[];
}

export function shapeCredits(
  raw: { cast?: TmdbCredit[]; crew?: TmdbCredit[] } | null | undefined,
  knownForDepartment?: string | null,
  knownForLimit = 12
): ShapedCredits {
  const cast = raw?.cast ?? [];
  const crew = raw?.crew ?? [];

  const acting = mergeByTitle(cast.filter((c) => !isSelfAppearance(c)), (c) => c.character);
  const appearances = mergeByTitle(cast.filter(isSelfAppearance), (c) => c.character);

  const crewByDepartment = new Map<string, TmdbCredit[]>();
  for (const credit of crew) {
    const department = credit.department || 'Crew';
    const list = crewByDepartment.get(department);
    if (list) list.push(credit);
    else crewByDepartment.set(department, [credit]);
  }
  const crewGroups = Array.from(crewByDepartment.entries())
    .map(([department, credits]) => ({ department, credits: mergeByTitle(credits, (c) => c.job) }))
    .sort((a, b) => b.credits.length - a.credits.length);

  const primary = knownForDepartment || 'Acting';
  const primaryIsActing = primary === 'Acting';

  // ---- Known For -----------------------------------------------------------
  const primaryCrew = crewGroups.find((group) => group.department === primary)?.credits ?? [];
  let candidates: PersonCredit[] = primaryIsActing ? acting : primaryCrew;
  if (candidates.filter((c) => c.poster).length < 6) {
    // Thin primary department: widen to everything substantial they did.
    const allCrew = crewGroups.flatMap((group) => group.credits);
    candidates = primaryIsActing ? [...acting, ...allCrew] : [...primaryCrew, ...acting, ...allCrew];
  }
  const seen = new Set<string>();
  const knownFor = candidates
    .filter((credit) => credit.poster)
    .sort((a, b) => knownForScore(b) - knownForScore(a))
    .filter((credit) => {
      if (seen.has(credit.key)) return false;
      seen.add(credit.key);
      return true;
    })
    .slice(0, knownForLimit);

  // ---- Filmography ---------------------------------------------------------
  const groups: FilmographyGroup[] = [];
  const pushGroup = (id: string, label: string, credits: PersonCredit[]) => {
    if (credits.length === 0) return;
    groups.push({ id, label, rows: [...credits].sort(byDateDesc).map(toRow) });
  };

  if (primaryIsActing) pushGroup('acting', 'Acting', acting);
  const primaryGroup = crewGroups.find((group) => group.department === primary);
  if (!primaryIsActing && primaryGroup) {
    pushGroup(primaryGroup.department.toLowerCase(), DEPARTMENT_LABELS[primary] ?? primary, primaryGroup.credits);
  }
  if (!primaryIsActing) pushGroup('acting', 'Acting', acting);
  for (const group of crewGroups) {
    if (group === primaryGroup) continue;
    pushGroup(group.department.toLowerCase().replace(/[^a-z]+/g, '-'), DEPARTMENT_LABELS[group.department] ?? group.department, group.credits);
  }
  pushGroup('appearances', 'Appearances', appearances);

  return { knownFor, groups };
}
