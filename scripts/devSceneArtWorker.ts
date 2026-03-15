const target =
  process.env.SCENE_ART_DEV_URL ??
  "http://localhost:3001/api/dev/process-scene-art";

const intervalMs = Number(process.env.SCENE_ART_WORKER_INTERVAL ?? 5000);

async function pingWorker() {
  try {
    const response = await fetch(target, { method: "POST" });
    const json = await response.json();
    console.log("scene art worker result", json);
  } catch (error) {
    console.error("scene art worker error", error);
  }
}

console.log("dev scene art worker starting", {
  target,
  intervalMs,
});

void pingWorker();
setInterval(() => {
  void pingWorker();
}, intervalMs);
