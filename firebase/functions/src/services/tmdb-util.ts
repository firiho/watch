export interface TMDBProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface TMDBReleaseDate {
  type: number;
  release_date: string;
}

export interface TMDBMovieData {
  id: number;
  title: string;
  release_dates?: {
    results: Array<{
      iso_3166_1: string;
      release_dates: TMDBReleaseDate[];
    }>;
  };
}

export interface TMDBTVData {
  id: number;
  name: string;
  last_episode_to_air?: {
    season_number: number;
    episode_number: number;
    name: string;
    air_date: string;
  };
}

export async function tmdbFetch(endpoint: string, apiKey: string) {
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `https://api.themoviedb.org/3${endpoint}${separator}api_key=${apiKey}`;
  
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.statusText}`);
  }

  return response.json();
}

// TMDB US release types we care about: 3 = Theatrical, 4 = Digital (HD/streaming).
export const RELEASE_TYPE_THEATRICAL = 3;
export const RELEASE_TYPE_HD = 4;

// Earliest release_date for a given TMDB release type, or null if none exists.
export function earliestReleaseDate(releaseDates: TMDBReleaseDate[], type: number): Date | null {
  const dates = releaseDates
    .filter((rd) => rd.type === type && rd.release_date)
    .map((rd) => new Date(rd.release_date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  return dates[0] ?? null;
}

export interface MovieReleaseDates {
  theatrical: Date | null;
  hd: Date | null;
}

// Fetches the US theatrical (type 3) and HD/digital (type 4) release dates for a movie.
export async function getMovieReleaseDates(id: number, apiKey: string): Promise<MovieReleaseDates> {
  const data: TMDBMovieData = await tmdbFetch(`/movie/${id}?append_to_response=release_dates`, apiKey);
  const releaseDates = data.release_dates?.results?.find((r: any) => r.iso_3166_1 === 'US')?.release_dates || [];
  return {
    theatrical: earliestReleaseDate(releaseDates, RELEASE_TYPE_THEATRICAL),
    hd: earliestReleaseDate(releaseDates, RELEASE_TYPE_HD),
  };
}

// Latest aired episode for a show, or null. Split out from checkTVUpdate so the
// result can be cached per run and shared across users tracking the same show.
export async function getTVLatestEpisode(id: number, apiKey: string): Promise<{ season: number; episode: number } | null> {
  const data: TMDBTVData = await tmdbFetch(`/tv/${id}`, apiKey);
  if (!data.last_episode_to_air) return null;
  return {
    season: data.last_episode_to_air.season_number,
    episode: data.last_episode_to_air.episode_number,
  };
}
