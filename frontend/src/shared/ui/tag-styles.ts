import { useTheme } from "@/shared/lib/theme";

/**
 * Тег красится в любой HEX — старой фиксированной палитры больше нет
 * (миграция e9bb285e2875 перевела прежние блок/зелёный/красный… в HEX).
 * Цвет в базе один (`tag.color`), а светлый/тёмный варианты пилюли считаем
 * на лету из HSL той же палитры — так пилюля остаётся читаемой в обеих
 * темах без двух хранимых значений на сервере.
 */
export const DEFAULT_TAG_COLOR = "#7c7bad";

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const match = HEX_RE.exec(hex);
  const value = match ? match[1] : DEFAULT_TAG_COLOR.slice(1);
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const delta = max - min;
  if (delta > 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** Пилюля тега: пастельный фон + насыщенный текст того же тона — в светлой
 *  теме фон светлый/текст тёмный, в тёмной — наоборот (как встроенная
 *  палитра раньше). Насыщенность чуть приглушаем, чтобы яркие HEX не резали
 *  глаз на фоне. */
export function useTagPillStyle(color: string | null | undefined): {
  backgroundColor: string;
  color: string;
} {
  const theme = useTheme();
  const safeColor = color && HEX_RE.test(color) ? color : DEFAULT_TAG_COLOR;
  const hsl = hexToHsl(safeColor);
  const h = hsl.h;
  const s = Math.min(70, Math.max(35, hsl.s));
  if (theme === "dark") {
    return {
      backgroundColor: `hsl(${h}, ${s * 0.55}%, 24%)`,
      color: `hsl(${h}, ${s}%, 78%)`,
    };
  }
  return {
    backgroundColor: `hsl(${h}, ${s * 0.55}%, 91%)`,
    color: `hsl(${h}, ${s}%, 32%)`,
  };
}

export function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value);
}
