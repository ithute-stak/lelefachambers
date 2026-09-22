import { NextRequest, NextResponse } from "next/server";

const SERVER_API = process.env.SERVER_API_URL || "http://api:8000";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: Context) {
  try {
    const { path } = await context.params;
    const upstreamUrl = new URL(`${SERVER_API}/api/v1/${path.join("/")}`);
    upstreamUrl.search = request.nextUrl.search;

    const headers = new Headers();
    const authorization = request.headers.get("authorization");
    const contentType = request.headers.get("content-type");
    const accept = request.headers.get("accept");

    if (authorization) headers.set("authorization", authorization);
    if (contentType) headers.set("content-type", contentType);
    if (accept) headers.set("accept", accept);

    const method = request.method.toUpperCase();
    const init: RequestInit = {
      method,
      headers,
      cache: "no-store",
    };

    if (method !== "GET" && method !== "HEAD") {
      init.body = await request.arrayBuffer();
    }

    const upstream = await fetch(upstreamUrl, init);
    const responseHeaders = new Headers();
    const upstreamContentType = upstream.headers.get("content-type");
    const disposition = upstream.headers.get("content-disposition");

    if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);
    if (disposition) responseHeaders.set("content-disposition", disposition);
    responseHeaders.set("cache-control", "no-store");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { detail: "Lelefa Chambers service is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
