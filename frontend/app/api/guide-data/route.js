const backendOrigin = process.env.NEXT_PUBLIC_BACKEND_ORIGIN || 'http://127.0.0.1:3000';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const backendUrl = new URL('/api/guide-data', backendOrigin);
  requestUrl.searchParams.forEach((value, key) => {
    backendUrl.searchParams.append(key, value);
  });

  try {
    const response = await fetch(backendUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    headers.delete('content-encoding');
    headers.delete('content-length');

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    return Response.json(
      {
        message: 'Khong tai duoc du lieu guide tu backend.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
