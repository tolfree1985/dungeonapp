import { startSceneArtWorkerLoop, SceneArtWorkerLoopOptions } from "@/lib/scene-art/workerLoop";
import { getSceneArtWorkerId } from "@/lib/scene-art/workerIdentity";
import { getSceneArtWorkerRuntimeConfig } from "@/lib/scene-art/workerRuntimeConfig";

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
  const runtimeConfig = getSceneArtWorkerRuntimeConfig();
  const workerId = getSceneArtWorkerId();
  const controller = new AbortController();
  const signal = options.signal ?? controller.signal;
  let stopReason: "stopped" | "aborted" = "stopped";

  console.info("scene.art.worker.external.started", {
    workerId,
    batchSize: options.batchSize,
    intervalMs: options.intervalMs,
  });

  const handleSignal = (reason: typeof stopReason) => () => {
    stopReason = reason;
    controller.abort();
  };

  const listeners: Array<() => void> = [];
  const register = (signalName: NodeJS.Signals, reason: typeof stopReason) => {
    const listener = handleSignal(reason);
    process.on(signalName, listener);
    listeners.push(() => process.off(signalName, listener));
  };

  register("SIGINT", "aborted");
  register("SIGTERM", "aborted");

  const done = startSceneArtWorkerLoop({
    ...options,
    batchSize: options.batchSize ?? runtimeConfig.batchSize,
    intervalMs: options.intervalMs ?? runtimeConfig.intervalMs,
    signal,
  }).finally(() => {
    listeners.forEach((dispose) => dispose());
    console.info("scene.art.worker.external.stopped", {
      workerId,
      reason: stopReason,
    });
  });

  return {
    workerId,
    stop: () => controller.abort(),
    done,
  };
}

async function main(): Promise<void> {
  console.log("[scene-art-worker] process starting");
  const worker = runWorkerProcess();
  await worker.done;
}

main().catch((error) => {
  console.error("[scene-art-worker] fatal", error);
  process.exit(1);
});
