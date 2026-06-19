import { NextRequest, NextResponse } from 'next/server';
import { discoverContent } from '@/lib/tmdb';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get('type') === 'tv' ? 'tv' : 'movie';
  const page = Math.max(1, Math.min(500, Number(sp.get('page')) || 1));

  const result = await discoverContent(
    type,
    {
      genre: sp.get('genre') || undefined,
      year: sp.get('year') || undefined,
      country: sp.get('country') || undefined,
      sortBy: sp.get('sortBy') || undefined,
    },
    page
  );

  return NextResponse.json(result);
}
