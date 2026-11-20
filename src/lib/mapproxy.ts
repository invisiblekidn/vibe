// Карта и поиск адреса для гостя идут через наш сайт, а не напрямую в OpenStreetMap:
// у части гостей во Вьетнаме сервера OSM не открываются, а наш сайт открывается.
// Правила OSM соблюдаем: свой User-Agent и Referer, кэш у гостя на 7 дней, только район доставки (не «прокси для всех»).

/** Район, для которого отдаём плитки и ищем адреса: Нячанг с запасом. */
export const AREA = { south: 11.9, north: 12.6, west: 108.9, east: 109.5 };
/** Меньше этого масштаба карта не уменьшается (на сайте тот же minZoom). */
export const MIN_ZOOM = 11;
export const MAX_ZOOM = 19;

const lngToX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Плитка {z}/{x}/{y} лежит в районе доставки и в допустимом масштабе. */
export function tileAllowed(z: number, x: number, y: number): boolean {
  if (![z, x, y].every(Number.isInteger) || z < MIN_ZOOM || z > MAX_ZOOM) return false;
  // Одна плитка запаса по краям, чтобы карта у границы района не была рваной.
  const x0 = lngToX(AREA.west, z) - 1;
  const x1 = lngToX(AREA.east, z) + 1;
  const y0 = latToY(AREA.north, z) - 1;
  const y1 = latToY(AREA.south, z) + 1;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

export const osmHeaders = (site: string) => ({
  'User-Agent': `VIBE-restaurant-site/1.0 (+${site})`,
  Referer: `${site}/`,
});

const WEEK = 7 * 24 * 3600;

export async function fetchTile(site: string, z: number, x: number, y: number): Promise<Response> {
  if (!tileAllowed(z, x, y)) return new Response('out of area', { status: 404 });
  const r = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
    headers: osmHeaders(site),
    cf: { cacheTtl: WEEK, cacheEverything: true },
  } as RequestInit);
  if (!r.ok) return new Response('tile error', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  return new Response(r.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': `public, max-age=${WEEK}`,
    },
  });
}

export type Found = { lat: number; lng: number; name: string } | null;

/** Поиск адреса (только по нажатию кнопки гостем). Ищем только в районе Нячанга. */
export async function geocode(site: string, q: string, lang: string): Promise<Found> {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.search = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'vn',
    viewbox: `${AREA.west},${AREA.north},${AREA.east},${AREA.south}`,
    bounded: '1',
    'accept-language': lang,
    q,
  }).toString();
  const r = await fetch(u.toString(), { headers: osmHeaders(site), cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit);
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const list = (await r.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
  if (!list.length) return null;
  return {
    lat: Number(list[0].lat),
    lng: Number(list[0].lon),
    name: String(list[0].display_name || '').split(',').slice(0, 3).join(',').trim(),
  };
}
