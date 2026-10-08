import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { foldedStagesStorageKey, useFoldedStages } from "./folded-stages";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("состояние свёрнутых колонок", () => {
  it("разделяет настройки между пользователями и досками", () => {
    const { result, rerender } = renderHook(
      ({ viewerId, boardOwnerId }: { viewerId: number; boardOwnerId: number }) =>
        useFoldedStages(viewerId, boardOwnerId),
      { initialProps: { viewerId: 7, boardOwnerId: 7 } },
    );

    act(() => result.current[1]([11]));
    expect(result.current[0]).toEqual([11]);

    rerender({ viewerId: 7, boardOwnerId: 12 });
    expect(result.current[0]).toEqual([]);
    act(() => result.current[1]([22]));

    rerender({ viewerId: 19, boardOwnerId: 12 });
    expect(result.current[0]).toEqual([]);
    act(() => result.current[1]([33]));

    rerender({ viewerId: 7, boardOwnerId: 7 });
    expect(result.current[0]).toEqual([11]);
    rerender({ viewerId: 7, boardOwnerId: 12 });
    expect(result.current[0]).toEqual([22]);
    rerender({ viewerId: 19, boardOwnerId: 12 });
    expect(result.current[0]).toEqual([33]);
  });

  it("отбрасывает повреждённые данные из хранилища", () => {
    const key = foldedStagesStorageKey(7, 7);
    expect(key).not.toBeNull();
    localStorage.setItem(key!, JSON.stringify([1, "2", -3, 1.5, 4]));

    const { result } = renderHook(() => useFoldedStages(7, 7));

    expect(result.current[0]).toEqual([1, 4]);
    act(() => result.current[1]([5]));
    expect(JSON.parse(localStorage.getItem(key!) ?? "null")).toEqual([5]);
  });

  it("не падает, если браузер запрещает доступ к хранилищу", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Доступ запрещён");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Хранилище заполнено");
    });

    const { result } = renderHook(() => useFoldedStages(7, 7));

    expect(result.current[0]).toEqual([]);
    act(() => result.current[1]([5]));
    expect(result.current[0]).toEqual([5]);
  });

  it("не создаёт ключ без подтверждённого пользователя и владельца доски", () => {
    expect(foldedStagesStorageKey(null, 7)).toBeNull();
    expect(foldedStagesStorageKey(7, null)).toBeNull();
    expect(foldedStagesStorageKey(0, 7)).toBeNull();
    expect(foldedStagesStorageKey(7, Number.NaN)).toBeNull();
  });
});
