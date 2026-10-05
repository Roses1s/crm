import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "@/app/ErrorBoundary";

function Boom(): never {
  throw new Error("тестовый сбой");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React печатает пойманную ошибку в консоль — глушим шум в выводе тестов.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("показывает запасной экран вместо белого экрана при ошибке отрисовки", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Что-то пошло не так")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Обновить страницу" })).toBeInTheDocument();
  });

  it("отрисовывает содержимое, когда ошибок нет", () => {
    render(
      <ErrorBoundary>
        <p>Всё хорошо</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Всё хорошо")).toBeInTheDocument();
    expect(screen.queryByText("Что-то пошло не так")).not.toBeInTheDocument();
  });
});
