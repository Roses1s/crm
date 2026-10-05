import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Корневой предохранитель ошибок.
 *
 * Если во время отрисовки любого экрана возникнет исключение, React без такого
 * предохранителя показывает пустой белый экран. Здесь мы перехватываем ошибку и
 * показываем понятное сообщение с кнопкой перезагрузки — пользователь не остаётся
 * один на один с белым экраном, а ошибку видно в консоли браузера.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Пишем в консоль браузера — так ошибку можно посмотреть при обращении в поддержку.
    console.error("Необработанная ошибка интерфейса:", error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-odoo-bg p-6 text-odoo-text">
        <div className="w-full max-w-md rounded-lg border border-odoo-border bg-odoo-surface p-8 text-center shadow-lg">
          <h1 className="text-lg font-semibold text-odoo-text">Что-то пошло не так</h1>
          <p className="mt-3 text-[13px] leading-relaxed text-odoo-text-muted">
            Произошла непредвиденная ошибка при отображении страницы. Попробуйте обновить страницу.
            Если ошибка повторяется — сообщите в поддержку.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-odoo-primary px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-odoo-primary-hover"
          >
            Обновить страницу
          </button>
        </div>
      </div>
    );
  }
}
