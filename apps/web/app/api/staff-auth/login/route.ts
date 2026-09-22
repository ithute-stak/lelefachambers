import { NextRequest, NextResponse } from "next/server";

const SERVER_API = process.env.SERVER_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://api:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const upstream = await fetch(`${SERVER_API}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ detail: "Staff authentication service is temporarily unavailable." }, { status: 503 });
  }
}
