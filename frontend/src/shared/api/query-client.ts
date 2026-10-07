import { QueryCache, QueryClient } from "@tanstack/react-query";

import { clearAttachmentLoadQueue } from "@/shared/lib/attachment-load-queue";
import { clearBlobCache } from "@/shared/lib/blob-cache";

/**
 * Единый QueryClient приложения.
 *
 * Он вынесен из React-компонента, чтобы граница сессии могла синхронно удалить
 * все пользовательские данные до показа экрана входа или новой учётной записи.
 */
export const queryClient = new QueryClient({
  // Единая точка логирования ошибок запросов: любую неуспешную загрузку данных
  // видно в консоли браузера, а не только в том месте, где она случилась.
  queryCache: new QueryCache({
    onError: (error) => {
      console.error("Ошибка запроса к серверу:", error);
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/**
 * Удаляет данные прежней учётной записи и отменяет их позднюю запись в кеш.
 *
 * Query keys намеренно не содержат пользователя, поэтому без полного сброса
 * второй сотрудник в той же вкладке видел бы ещё «свежие» данные первого.
 */
export function clearSessionCache(): void {
  // cancelQueries помечает выполняющиеся запросы отменёнными: даже если fetch,
  // не получивший AbortSignal, завершится позже, TanStack Query не вернёт его
  // результат в активный кеш новой сессии.
  void queryClient.cancelQueries();
  // clear очищает одновременно QueryCache и MutationCache.
  queryClient.clear();
  // Сначала прекращаем текущие/ожидающие загрузки, затем очищаем кеш вложений.
  // Иначе поздний ответ прежней учётной записи мог бы попасть в новую сессию.
  clearAttachmentLoadQueue();
  clearBlobCache();
}
