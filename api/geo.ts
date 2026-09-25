// GET /api/geo: where the visitor is, going by the geolocation headers
// Vercel adds to every request (from the visitor's IP address). JM/OS uses
// it to show the visitor's own weather, light and time without asking for
// the browser's location. Nothing is stored.
//
// Responds 204 when the headers are missing (local builds, unknown IPs).

export function GET(request: Request) {
  const header = (name: string) => {
    const value = request.headers.get(`x-vercel-ip-${name}`);
    // City names are URI-encoded ("S%C3%A3o%20Paulo").
    return value ? decodeURIComponent(value) : null;
  };

  const latitude = Number(header('latitude'));
  const longitude = Number(header('longitude'));
  const noStore = { 'cache-control': 'private, no-store' };
  if (!header('latitude') || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return new Response(null, { status: 204, headers: noStore });
  }

  return Response.json(
    {
      city: header('city'),
      region: header('country-region'),
      country: header('country'),
      latitude,
      longitude,
      timeZone: header('timezone')
    },
    { headers: noStore }
  );
}
