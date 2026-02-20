// Utility to select the best trailer/teaser video from TMDB API response
export interface TMDBVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
  name: string;
}

export function selectBestYoutubeTrailer(videos: TMDBVideo[]): TMDBVideo | null {
  if (!videos || !videos.length) return null;
  // Only YouTube
  const youTubeVideos = videos.filter(v => v.site === 'YouTube');
  // Priority order
  const priorities = [
    (v: TMDBVideo) => v.type === 'Trailer' && v.official,
    (v: TMDBVideo) => v.type === 'Trailer',
    (v: TMDBVideo) => v.type === 'Teaser' && v.official,
    (v: TMDBVideo) => v.type === 'Teaser',
    (v: TMDBVideo) => true,
  ];
  for (const match of priorities) {
    const found = youTubeVideos.find(match);
    if (found) return found;
  }
  return null;
}
