import { NextRequest, NextResponse } from 'next/server';

const TMDB_API_TOKEN = process.env.TMDB_API_TOKEN;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }

  try {
    const url = `${TMDB_BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=en-US&page=1`;
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${TMDB_API_TOKEN}`,
      },
    });

    if (!response.ok) throw new Error('TMDB API error');

    const data = await response.json();

    // Filter to only movies and tv, map to our format
    const results = data.results
      .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
      .slice(0, 8)
      .map((item: any) => ({
        id: item.id,
        title: item.title || item.name,
        year: (item.release_date || item.first_air_date)?.split('-')[0] || '',
        image: item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : null,
        rating: item.vote_average?.toFixed(1) || '0.0',
        media_type: item.media_type,
        overview: item.overview?.slice(0, 120) || '',
      }));

    return NextResponse.json(results);
  } catch (error) {
    console.error('Search API Error:', error);
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
  }
}
