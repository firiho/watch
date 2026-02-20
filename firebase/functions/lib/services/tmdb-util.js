"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tmdbFetch = tmdbFetch;
exports.checkMovieHD = checkMovieHD;
exports.checkTVUpdate = checkTVUpdate;
async function tmdbFetch(endpoint, apiKey) {
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
async function checkMovieHD(id, apiKey) {
    const data = await tmdbFetch(`/movie/${id}?append_to_response=release_dates`, apiKey);
    const releaseDates = data.release_dates?.results?.find((r) => r.iso_3166_1 === 'US')?.release_dates || [];
    return releaseDates.some((rd) => rd.type >= 4);
}
async function checkTVUpdate(id, lastSeason, lastEpisode, apiKey) {
    const data = await tmdbFetch(`/tv/${id}`, apiKey);
    if (!data.last_episode_to_air)
        return null;
    const currentSeason = data.last_episode_to_air.season_number;
    const currentEpisode = data.last_episode_to_air.episode_number;
    const hasUpdate = currentSeason > lastSeason || (currentSeason === lastSeason && currentEpisode > lastEpisode);
    if (hasUpdate) {
        return { season: currentSeason, episode: currentEpisode };
    }
    return null;
}
//# sourceMappingURL=tmdb-util.js.map