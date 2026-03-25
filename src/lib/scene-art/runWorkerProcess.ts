import { startSceneArtWorkerLoop, SceneArtWorkerLoopOptions } from "@/lib/scene-art/workerLoop";
import { getSceneArtWorkerId } from "@/lib/scene-art/workerIdentity";

export type RunWorkerProcessOptions = {
  batchSize?: number;
  intervalMs?: number;
  signal?: AbortSignal;
} & Partial<SceneArtWorkerLoopOptions>;

export type RunningWorker = {
  workerId: string;
  stop: () => void;
  done: Promise<void>;
};

export function runWorkerProcess(options: RunWorkerProcessOptions = {}): RunningWorker {
  const workerId = getSceneArtWorkerId();
  const controller = new AbortController();
  const signal = options.signal ?? controller.signal;

  console.info("scene.art.worker.external.started", {
    workerId,
    batchSize: options.batchSize,
    intervalMs: options.intervalMs,
  });

  const done = startSceneArtWorkerLoop({
    ...options,
    signal,
  }).finally(() => {
    console.info("scene.art.worker.external.stopped", {
      workerId,
    });
  });

  return {
    workerId,
    stop: () => controller.abort(),
    done,
  };
}
