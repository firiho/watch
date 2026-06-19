import { NextRequest, NextResponse } from 'next/server';
import { getGenres } from '@/lib/tmdb';

export async function GET(req: NextRequest) {
  const typeParam = req.nextUrl.searchParams.get('type');
  const type = typeParam === 'tv' ? 'tv' : 'movie';
  try {
    const genres = await getGenres(type);
    return NextResponse.json({ genres });
  } catch {
    return NextResponse.json({ genres: [] }, { status: 500 });
  }
}
