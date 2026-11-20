import { describe, expect, it } from 'vitest';
import { tileAllowed } from '../src/lib/mapproxy';

// Плитка, в которой лежит точка (как считает Leaflet).
const tileOf = (lat: number, lng: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return [z, Math.floor(((lng + 180) / 360) * 2 ** z), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)] as const;
};

describe('карта через наш сайт: только район Нячанга', () => {
  it('ресторан и окрестности на всех масштабах от 11 до 19', () => {
    for (let z = 11; z <= 19; z++) expect(tileAllowed(...tileOf(12.2697605, 109.2015646, z))).toBe(true);
    expect(tileAllowed(...tileOf(12.35, 109.2, 16))).toBe(true); // 10 км к северу
  });
  it('другие города и мелкий масштаб не отдаём', () => {
    expect(tileAllowed(...tileOf(10.7769, 106.7009, 15))).toBe(false); // Хошимин
    expect(tileAllowed(...tileOf(21.0285, 105.8542, 13))).toBe(false); // Ханой
    expect(tileAllowed(...tileOf(12.2697605, 109.2015646, 10))).toBe(false);
    expect(tileAllowed(...tileOf(12.2697605, 109.2015646, 20))).toBe(false);
    expect(tileAllowed(13, NaN, 1)).toBe(false);
  });
});
