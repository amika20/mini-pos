import { NextResponse } from 'next/server';

// API Route ฝั่ง Server สำหรับส่งข้อความแจ้งเตือนไป Telegram
// token/chat id เก็บเป็น env var ฝั่ง server เท่านั้น ไม่ใช้ NEXT_PUBLIC_
// เพื่อไม่ให้ token หลุดไปอยู่ใน JS bundle ฝั่ง client
export async function POST(request) {
  try {
    const { text } = await request.json();
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return NextResponse.json({ error: 'Telegram config missing' }, { status: 500 });
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
