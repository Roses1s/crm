// Цвета этапов независимы от поверхности: они остаются различимыми в обеих темах.
export const STAGE_COLORS: Record<string, string> = {
  slate: "#9A9AA0",
  purple: "#6B3E66",
  blue: "#47BBDC",
  green: "#46B86A",
  red: "#E85765",
  orange: "#E58A37",
  yellow: "#FFC107",
};

export function stageColor(c: string) {
  return STAGE_COLORS[c] || STAGE_COLORS.purple;
}
