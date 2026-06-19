// Fetches TMDB videos for a movie or a TV season. The TMDB URL is built entirely
// server-side from validated params so the API token is never attached to a
// caller-controlled URL (avoids SSRF / token exfiltration).
import { NextRequest, NextResponse } from 'next/server';

const TMDB_API_TOKEN = process.env.TMDB_API_TOKEN;

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get('id');
  const type = req.nextUrl.searchParams.get('type');
  const seasonParam = req.nextUrl.searchParams.get('season');

  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  if (type !== 'movie' && type !== 'tv') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  let endpoint: string;
  if (type === 'movie') {
    endpoint = `/movie/${id}/videos?language=en-US`;
  } else {
    const season = Number(seasonParam ?? 1);
    if (!Number.isInteger(season) || season < 0) {
      return NextResponse.json({ error: 'Invalid season' }, { status: 400 });
    }
    endpoint = `/tv/${id}/season/${season}/videos?language=en-US`;
  }

  try {
    const res = await fetch(`https://api.themoviedb.org/3${endpoint}`, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${TMDB_API_TOKEN}`,
      },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch trailer' }, { status: 500 });
  }
}
