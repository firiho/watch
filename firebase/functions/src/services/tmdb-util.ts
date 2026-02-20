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

export async function checkMovieHD(id: number, apiKey: string): Promise<boolean> {
  const data: TMDBMovieData = await tmdbFetch(`/movie/${id}?append_to_response=release_dates`, apiKey);
  const releaseDates = data.release_dates?.results?.find((r: any) => r.iso_3166_1 === 'US')?.release_dates || [];
  return releaseDates.some((rd: TMDBReleaseDate) => rd.type >= 4);
}

export async function checkTVUpdate(id: number, lastSeason: number, lastEpisode: number, apiKey: string): Promise<{ season: number; episode: number } | null> {
  const data: TMDBTVData = await tmdbFetch(`/tv/${id}`, apiKey);
  if (!data.last_episode_to_air) return null;

  const currentSeason = data.last_episode_to_air.season_number;
  const currentEpisode = data.last_episode_to_air.episode_number;

  const hasUpdate = currentSeason > lastSeason || (currentSeason === lastSeason && currentEpisode > lastEpisode);
  
  if (hasUpdate) {
    return { season: currentSeason, episode: currentEpisode };
  }
  
  return null;
}
