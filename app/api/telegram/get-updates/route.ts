import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = String(body?.token || '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Missing Telegram bot token.' }, { status: 400 });
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
      method: 'GET',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok || json?.ok === false) {
      return NextResponse.json(
        { error: json?.description || 'Telegram getUpdates failed.' },
        { status: 400 }
      );
    }

    const updates = Array.isArray(json?.result) ? json.result : [];
    const latestWithChat = [...updates].reverse().find((u: any) => u?.message?.chat?.id != null);

    return NextResponse.json({
      ok: true,
      chatId: latestWithChat ? String(latestWithChat.message.chat.id) : null,
      chatTitle:
        latestWithChat?.message?.chat?.title ||
        latestWithChat?.message?.chat?.username ||
        latestWithChat?.message?.chat?.first_name ||
        null,
      updatesCount: updates.length,
    });
  } catch (error) {
    console.error('Telegram get-updates proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch Telegram updates.' }, { status: 500 });
  }
}
