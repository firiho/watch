export interface ContentItem {
  id: number;
  title: string;
  year: string;
  releaseDate?: string;
  rating: string;
  image: string;
  backdrop?: string;
  description?: string;
  quality?: string;
  mediaType: 'movie' | 'tv';
  genres?: Genre[];
  runtime?: number;
  status?: string;
  tagline?: string;
  originalTitle?: string;
  originalLanguage?: string;
  spokenLanguages?: string[];
  productionCountries?: string[];
  homepage?: string;
  imdbId?: string;
  voteCount?: number;
  popularity?: number;
  budget?: number;
  revenue?: number;
  seasons?: Season[];
  providers?: WatchProvider[];
  providerLink?: string;
  cast?: CastMember[];
  directors?: PersonSummary[];
  productionStudios?: string[];
  creators?: string[];
  networks?: string[];
  isHD?: boolean;
  releaseHistory?: Array<{
    type: number;
    label: string;
    date: string;
  }>;
  lastEpisode?: {
    season: number;
    episode: number;
    name: string;
  };
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export interface PersonSummary {
  id: number;
  name: string;
}

export interface Season {
  id: number;
  name: string;
  overview: string;
  poster_path: string;
  season_number: number;
  episode_count: number;
  air_date: string;
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  still_path: string;
  episode_number: number;
  air_date: string;
  runtime: number;
}

const TMDB_API_TOKEN = process.env.TMDB_API_TOKEN;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

function getReleaseHistoryFromUSReleaseDates(releaseDates: any[] = []) {
  const targetTypes = [3, 4];
  const history = targetTypes
    .map((type) => {
      const matches = releaseDates
        .filter((rd: any) => rd.type === type && rd.release_date)
        .sort((a: any, b: any) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime());

      if (!matches.length) return null;

      return {
        type,
        label: type === 4 ? 'HD' : 'Theaters',
        date: matches[0].release_date,
      };
    })
    .filter(Boolean) as Array<{ type: number; label: string; date: string }>;

  return history;
}

async function tmdbFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${TMDB_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      accept: 'application/json',
      Authorization: `Bearer ${TMDB_API_TOKEN}`,
    },
    next: { revalidate: 3600 }, // Cache for 1 hour
  });

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.statusText}`);
  }

  return response.json();
}

export async function getPersonDetails(id: string | number) {
  try {
    const data = await tmdbFetch(`/person/${id}?language=en-US`);
    return data;
  } catch (error) {
    console.error(`Error fetching details for person ${id}:`, error);
    return null;
  }
}

export async function getPersonCombinedCredits(id: string | number) {
  try {
    const data = await tmdbFetch(`/person/${id}/combined_credits?language=en-US`);
    return data;
  } catch (error) {
    console.error(`Error fetching credits for person ${id}:`, error);
    return null;
  }
}

function isReleased(dateStr?: string): boolean {
  if (!dateStr) return false;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return parsed <= today;
}

export async function getTrendingMovies(): Promise<ContentItem[]> {
  try {
    const data = await tmdbFetch('/trending/movie/week?language=en-US');
    return data.results
      .filter((movie: any) => isReleased(movie.release_date))
      .map((movie: any) => ({
        id: movie.id,
        title: movie.title,
        year: movie.release_date ? movie.release_date.split('-')[0] : 'N/A',
        releaseDate: movie.release_date || undefined,
        rating: movie.vote_average.toFixed(1),
        image: `${IMAGE_BASE_URL}${movie.poster_path}`,
        backdrop: `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`,
        description: movie.overview,
        mediaType: 'movie',
      }));
  } catch (error) {
    console.error('Error fetching trending movies:', error);
    return [];
  }
}

export async function getTrendingTVShows(): Promise<ContentItem[]> {
  try {
    const data = await tmdbFetch('/trending/tv/day?language=en-US');
    return data.results
      .filter((tv: any) => isReleased(tv.first_air_date))
      .map((tv: any) => ({
        id: tv.id,
        title: tv.name,
        year: tv.first_air_date ? tv.first_air_date.split('-')[0] : 'N/A',
        releaseDate: tv.first_air_date || undefined,
        rating: tv.vote_average.toFixed(1),
        image: `${IMAGE_BASE_URL}${tv.poster_path}`,
        backdrop: `https://image.tmdb.org/t/p/w780${tv.backdrop_path}`,
        description: tv.overview,
        mediaType: 'tv',
      }));
  } catch (error) {
    console.error('Error fetching popular TV shows:', error);
    return [];
  }
}

export async function getFeaturedContent(): Promise<ContentItem[]> {
  try {
    const data = await tmdbFetch('/trending/all/day?language=en-US');
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    return data.results
      .filter((item: any) => {
        if (item.media_type !== 'movie' && item.media_type !== 'tv') return false;
        if (!item.backdrop_path) return false;

        const releaseDate = item.release_date || item.first_air_date;
        if (!releaseDate) return false;

        const parsedDate = new Date(releaseDate);
        if (Number.isNaN(parsedDate.getTime())) return false;

        return parsedDate <= today;
      })
      .slice(0, 5)
      .map((item: any) => ({
        id: item.id,
        title: item.title || item.name,
        year: (item.release_date || item.first_air_date)?.split('-')[0] || 'N/A',
        releaseDate: item.release_date || item.first_air_date || undefined,
        rating: item.vote_average.toFixed(1),
        image: `https://image.tmdb.org/t/p/original${item.backdrop_path}`,
        description: item.overview,
        mediaType: item.media_type as 'movie' | 'tv',
      }));
  } catch (error) {
    console.error('Error fetching featured content:', error);
    return [];
  }
}

export interface WatchProvider {
  id: number;
  name: string;
  logo: string;
}

export async function getWatchProviders(id: number, type: 'movie' | 'tv'): Promise<{ providers: WatchProvider[], isHD?: boolean, lastEpisode?: { season: number, episode: number, name: string } }> {
  try {
    const endpoint = type === 'movie' 
      ? `/movie/${id}?append_to_response=watch/providers,release_dates`
      : `/tv/${id}?append_to_response=watch/providers`;
    
    const data = await tmdbFetch(endpoint);
    
    // Handle different response structures
    const providersData = type === 'movie' ? data['watch/providers']?.results?.US : data['watch/providers']?.results?.US;
    const flatrate = providersData?.flatrate || [];
    
    const providers = flatrate.slice(0, 3).map((provider: any) => ({
      id: provider.provider_id,
      name: provider.provider_name,
      logo: `https://image.tmdb.org/t/p/original${provider.logo_path}`,
    }));

    let isHD;
    if (type === 'movie' && data.release_dates) {
      const releaseDates = data.release_dates.results?.find((r: any) => r.iso_3166_1 === 'US')?.release_dates || [];
      isHD = releaseDates.some((rd: any) => rd.type >= 4);
    }

    let lastEpisode;
    if (type === 'tv' && data.last_episode_to_air) {
      lastEpisode = {
        season: data.last_episode_to_air.season_number,
        episode: data.last_episode_to_air.episode_number,
        name: data.last_episode_to_air.name,
      };
    }

    return { providers, isHD, lastEpisode };
  } catch (error) {
    console.error(`Error fetching watch providers for ${type} ${id}:`, error);
    return { providers: [], isHD: false };
  }
}

export interface Genre {
  id: number;
  name: string;
}

export async function getGenres(type: 'movie' | 'tv'): Promise<Genre[]> {
  try {
    const data = await tmdbFetch(`/genre/${type}/list?language=en-US`);
    return data.genres;
  } catch (error) {
    console.error(`Error fetching genres for ${type}:`, error);
    return [];
  }
}

export interface DiscoverFilters {
  genre?: string;
  year?: string;
  sortBy?: string;
}

export async function discoverContent(type: 'movie' | 'tv', filters: DiscoverFilters): Promise<ContentItem[]> {
  try {
    const params = new URLSearchParams({
      include_adult: 'false',
      language: 'en-US',
      page: '1',
      sort_by: filters.sortBy || 'popularity.desc',
    });

    if (filters.genre) {
      params.append('with_genres', filters.genre);
    }

    if (filters.year) {
      if (type === 'movie') {
        params.append('primary_release_year', filters.year);
      } else {
        params.append('first_air_date_year', filters.year);
      }
    }

    if (type === 'movie') {
      params.append('include_video', 'false');
    } else {
      params.append('include_null_first_air_dates', 'false');
    }

    const data = await tmdbFetch(`/discover/${type}?${params.toString()}`);
    return data.results.map((item: any) => ({
      id: item.id,
      title: item.title || item.name,
      year: (item.release_date || item.first_air_date)?.split('-')[0] || 'N/A',
      releaseDate: item.release_date || item.first_air_date || undefined,
      rating: item.vote_average.toFixed(1),
      image: `${IMAGE_BASE_URL}${item.poster_path}`,
      backdrop: `https://image.tmdb.org/t/p/w780${item.backdrop_path}`,
      description: item.overview,
      mediaType: type,
    }));
  } catch (error) {
    console.error(`Error discovering ${type}:`, error);
    return [];
  }
}

export async function getMovieDetails(id: number): Promise<ContentItem | null> {
  try {
    const data = await tmdbFetch(`/movie/${id}?language=en-US&append_to_response=watch/providers,credits,release_dates`);
    const providersData = data['watch/providers']?.results?.US;
    const credits = data.credits;
    const releaseDates = data.release_dates?.results?.find((r: any) => r.iso_3166_1 === 'US')?.release_dates || [];
    const isHD = releaseDates.some((rd: any) => rd.type >= 4);
    const releaseHistory = getReleaseHistoryFromUSReleaseDates(releaseDates);
    const directorMap = new Map<number, string>();
    for (const member of credits?.crew || []) {
      if (member?.job === 'Director' && typeof member?.name === 'string' && typeof member?.id === 'number') {
        directorMap.set(member.id, member.name);
      }
    }
    const directors = Array.from(directorMap.entries()).map(([directorId, directorName]) => ({
      id: directorId,
      name: directorName,
    }));
    
    return {
      id: data.id,
      title: data.title,
      year: data.release_date ? data.release_date.split('-')[0] : 'N/A',
      releaseDate: data.release_date || undefined,
      rating: data.vote_average.toFixed(1),
      image: `${IMAGE_BASE_URL}${data.poster_path}`,
      backdrop: `https://image.tmdb.org/t/p/original${data.backdrop_path}`,
      description: data.overview,
      mediaType: 'movie',
      genres: data.genres,
      runtime: data.runtime,
      status: data.status,
      tagline: data.tagline,
      originalTitle: data.original_title,
      originalLanguage: data.original_language,
      spokenLanguages: (data.spoken_languages || [])
        .map((language: any) => language.english_name || language.name)
        .filter(Boolean),
      productionCountries: (data.production_countries || [])
        .map((country: any) => country.name)
        .filter(Boolean),
      homepage: data.homepage || undefined,
      imdbId: data.imdb_id || undefined,
      voteCount: typeof data.vote_count === 'number' ? data.vote_count : undefined,
      popularity: typeof data.popularity === 'number' ? data.popularity : undefined,
      budget: data.budget,
      revenue: data.revenue,
      providerLink: providersData?.link,
      providers: providersData?.flatrate?.map((p: any) => ({
        id: p.provider_id,
        name: p.provider_name,
        logo: `https://image.tmdb.org/t/p/original${p.logo_path}`,
      })),
      cast: credits?.cast?.slice(0, 10).map((c: any) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path ? `https://image.tmdb.org/t/p/w200${c.profile_path}` : null,
      })),
      directors,
      productionStudios: (data.production_companies || [])
        .map((studio: any) => studio.name)
        .filter(Boolean)
        .slice(0, 5),
      isHD,
      releaseHistory,
    };
  } catch (error) {
    console.error(`Error fetching movie details for ${id}:`, error);
    return null;
  }
}

export async function getTVDetails(id: number): Promise<ContentItem | null> {
  try {
    const data = await tmdbFetch(`/tv/${id}?language=en-US&append_to_response=watch/providers,credits`);
    const providersData = data['watch/providers']?.results?.US;
    const credits = data.credits;

    return {
      id: data.id,
      title: data.name,
      year: data.first_air_date ? data.first_air_date.split('-')[0] : 'N/A',
      releaseDate: data.first_air_date || undefined,
      rating: data.vote_average.toFixed(1),
      image: `${IMAGE_BASE_URL}${data.poster_path}`,
      backdrop: `https://image.tmdb.org/t/p/original${data.backdrop_path}`,
      description: data.overview,
      mediaType: 'tv',
      genres: data.genres,
      status: data.status,
      tagline: data.tagline,
      originalTitle: data.original_name,
      originalLanguage: data.original_language,
      spokenLanguages: (data.spoken_languages || [])
        .map((language: any) => language.english_name || language.name)
        .filter(Boolean),
      productionCountries: (data.production_countries || [])
        .map((country: any) => country.name)
        .filter(Boolean),
      homepage: data.homepage || undefined,
      voteCount: typeof data.vote_count === 'number' ? data.vote_count : undefined,
      popularity: typeof data.popularity === 'number' ? data.popularity : undefined,
      seasons: data.seasons.map((s: any) => ({
        id: s.id,
        name: s.name,
        overview: s.overview,
        poster_path: s.poster_path ? `${IMAGE_BASE_URL}${s.poster_path}` : '',
        season_number: s.season_number,
        episode_count: s.episode_count,
        air_date: s.air_date,
      })),
      providerLink: providersData?.link,
      providers: providersData?.flatrate?.map((p: any) => ({
        id: p.provider_id,
        name: p.provider_name,
        logo: `https://image.tmdb.org/t/p/original${p.logo_path}`,
      })),
      cast: credits?.cast?.slice(0, 10).map((c: any) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path ? `https://image.tmdb.org/t/p/w200${c.profile_path}` : null,
      })),
      creators: (data.created_by || [])
        .map((creator: any) => creator.name)
        .filter(Boolean)
        .slice(0, 5),
      productionStudios: (data.production_companies || [])
        .map((studio: any) => studio.name)
        .filter(Boolean)
        .slice(0, 5),
      networks: (data.networks || [])
        .map((network: any) => network.name)
        .filter(Boolean)
        .slice(0, 5),
      lastEpisode: data.last_episode_to_air ? {
        season: data.last_episode_to_air.season_number,
        episode: data.last_episode_to_air.episode_number,
        name: data.last_episode_to_air.name,
      } : undefined,
    };
  } catch (error) {
    console.error(`Error fetching TV details for ${id}:`, error);
    return null;
  }
}

export async function getTVSeasonDetails(id: number, seasonNumber: number): Promise<Episode[]> {
  try {
    const data = await tmdbFetch(`/tv/${id}/season/${seasonNumber}?language=en-US`);
    return data.episodes.map((e: any) => ({
      id: e.id,
      name: e.name,
      overview: e.overview,
      still_path: e.still_path ? `https://image.tmdb.org/t/p/w300${e.still_path}` : '',
      episode_number: e.episode_number,
      air_date: e.air_date,
      runtime: e.runtime,
    }));
  } catch (error) {
    console.error(`Error fetching TV season ${seasonNumber} for ${id}:`, error);
    return [];
  }
}

export async function searchMulti(query: string): Promise<ContentItem[]> {
  try {
    const data = await tmdbFetch(`/search/multi?query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`);
    return data.results
      .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
      .map((item: any) => ({
        id: item.id,
        title: item.title || item.name,
        year: (item.release_date || item.first_air_date)?.split('-')[0] || 'N/A',
        releaseDate: item.release_date || item.first_air_date || undefined,
        rating: item.vote_average?.toFixed(1) || '0.0',
        image: `${IMAGE_BASE_URL}${item.poster_path}`,
        backdrop: `https://image.tmdb.org/t/p/w780${item.backdrop_path}`,
        description: item.overview,
        mediaType: item.media_type as 'movie' | 'tv',
      }));
  } catch (error) {
    console.error(`Error searching multi for ${query}:`, error);
    return [];
  }
}
