import { NextRequest, NextResponse } from 'next/server';
import { getFeaturedByGenres } from '@/lib/tmdb';

export async function GET(req: NextRequest) {
  const genresParam = req.nextUrl.searchParams.get('genres') || '';
  const genreIds = genresParam
    .split(',')
    .map((g) => Number(g.trim()))
    .filter((g) => Number.isInteger(g) && g > 0);

  const results = await getFeaturedByGenres(genreIds);
  return NextResponse.json({ results });
}
