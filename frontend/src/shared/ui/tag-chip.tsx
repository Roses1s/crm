import type { ReactNode } from "react";

import { useTagPillStyle } from "./tag-styles";

const SIZE_CLS = {
  sm: "px-1.5 py-px text-[10px] leading-[13px]",
  md: "px-2 py-0.5 text-[11px] leading-[16px]",
} as const;

/** Пилюля тега — одинаковая на лидах, клиентах и заявках.
 *  `children` — доп. содержимое после названия (например, крестик удаления). */
export function TagChip({
  name,
  color,
  size = "sm",
  maxWidthClassName = "max-w-[150px]",
  children,
}: {
  name: string;
  color: string;
  size?: keyof typeof SIZE_CLS;
  maxWidthClassName?: string;
  children?: ReactNode;
}) {
  const style = useTagPillStyle(color);
  return (
    <span
      title={name}
      style={style}
      className={`inline-flex max-w-full items-center gap-1 rounded-full font-normal ${SIZE_CLS[size]}`}
    >
      <span className={`truncate ${maxWidthClassName}`}>{name}</span>
      {children}
    </span>
  );
}
