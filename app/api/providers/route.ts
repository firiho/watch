import { NextRequest, NextResponse } from 'next/server';
import { getWatchProviders } from '@/lib/tmdb';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const type = searchParams.get('type') as 'movie' | 'tv';

  if (!id || !type) {
    return NextResponse.json({ error: 'Missing id or type parameter' }, { status: 400 });
  }

  try {
    const data = await getWatchProviders(parseInt(id), type);
    return NextResponse.json(data);
  } catch (error) {
    console.error('API Proxy Error:', error);
    return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 });
  }
}
