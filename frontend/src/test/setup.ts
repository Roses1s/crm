import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// После каждого теста убираем отрисованное дерево: иначе соседние проверки
// находят элементы от предыдущего теста.
afterEach(() => cleanup());
