import { NextRequest, NextResponse } from 'next/server';
import { getMovieDetails, getTVDetails, getTVSeasonDetails } from '@/lib/tmdb';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const type = searchParams.get('type') as 'movie' | 'tv' | 'season';
  const seasonNumber = searchParams.get('season');

  if (!id || !type) {
    return NextResponse.json({ error: 'Missing id or type parameter' }, { status: 400 });
  }

  try {
    let data;
    if (type === 'movie') {
      data = await getMovieDetails(parseInt(id));
    } else if (type === 'tv') {
      data = await getTVDetails(parseInt(id));
    } else if (type === 'season') {
      if (!seasonNumber) {
        return NextResponse.json({ error: 'Missing season parameter for type season' }, { status: 400 });
      }
      data = await getTVSeasonDetails(parseInt(id), parseInt(seasonNumber));
    }

    if (!data) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Details API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch details' }, { status: 500 });
  }
}
