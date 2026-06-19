import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/server/verify-firebase-token';

export async function POST(request: NextRequest) {
  try {
    const uid = await verifyFirebaseToken(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await request.json();
    const token = String(body?.token || '').trim();
    const chatId = String(body?.chatId || '').trim();
    const message = String(body?.message || '').trim();

    if (!token || !chatId || !message) {
      return NextResponse.json({ error: 'Missing token, chatId, or message.' }, { status: 400 });
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok || json?.ok === false) {
      return NextResponse.json(
        { error: json?.description || 'Telegram sendMessage failed.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram send-message proxy error:', error);
    return NextResponse.json({ error: 'Failed to send Telegram message.' }, { status: 500 });
  }
}
