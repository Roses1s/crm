import type { BlobVariant } from "./blob-cache";

/** Максимальное число одновременно скачиваемых вложений. */
export const MAX_CONCURRENT_ATTACHMENT_DOWNLOADS = 3;

const CANCELLED = new Error("Загрузка вложения отменена");

type Job = {
  key: string;
  generation: number;
  promise: Promise<Blob>;
  load: (signal: AbortSignal) => Promise<Blob>;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
  controller: AbortController;
  settled: boolean;
  holdsSlot: boolean;
};

const queue: Job[] = [];
const activeJobs = new Set<Job>();
const pending = new Map<string, Promise<Blob>>();
let active = 0;
let generation = 0;

function settle(job: Job, result: { error: unknown } | { blob: Blob }): void {
  if (job.settled) return;
  job.settled = true;
  if (pending.get(job.key) === job.promise) pending.delete(job.key);
  if ("error" in result) job.reject(result.error);
  else job.resolve(result.blob);
}

function releaseSlot(job: Job): void {
  if (!job.holdsSlot) return;
  job.holdsSlot = false;
  active -= 1;
}

function startQueuedJobs(): void {
  while (active < MAX_CONCURRENT_ATTACHMENT_DOWNLOADS && queue.length > 0) {
    const job = queue.shift();
    if (!job || job.settled) continue;
    if (job.generation !== generation) {
      settle(job, { error: CANCELLED });
      continue;
    }

    active += 1;
    job.holdsSlot = true;
    activeJobs.add(job);

    void Promise.resolve()
      .then(() => (job.settled ? undefined : job.load(job.controller.signal)))
      .then(
        (blob) => {
          if (blob === undefined || job.settled) return;
          if (job.generation === generation) settle(job, { blob });
          else settle(job, { error: CANCELLED });
        },
        (error: unknown) => settle(job, { error }),
      )
      .finally(() => {
        releaseSlot(job);
        activeJobs.delete(job);
        if (pending.get(job.key) === job.promise) pending.delete(job.key);
        startQueuedJobs();
      });
  }
}

/** Добавляет запрос в общую очередь и объединяет загрузки одного варианта файла. */
export function enqueueAttachmentLoad(
  id: number,
  load: (signal: AbortSignal) => Promise<Blob>,
  variant: BlobVariant = "original",
): Promise<Blob> {
  const key = `${variant}:${id}`;
  const existing = pending.get(key);
  if (existing) return existing;

  let resolve!: (blob: Blob) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Blob>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  const job: Job = {
    key,
    generation,
    promise,
    load,
    resolve,
    reject,
    controller: new AbortController(),
    settled: false,
    holdsSlot: false,
  };

  pending.set(key, promise);
  queue.push(job);
  startQueuedJobs();
  return promise;
}

/** Отменяет очередь и текущие запросы на выходе из учётной записи. */
export function clearAttachmentLoadQueue(): void {
  generation += 1;
  for (const job of queue.splice(0)) settle(job, { error: CANCELLED });
  for (const job of activeJobs) {
    job.controller.abort();
    settle(job, { error: CANCELLED });
    releaseSlot(job);
  }
  pending.clear();
  startQueuedJobs();
}
