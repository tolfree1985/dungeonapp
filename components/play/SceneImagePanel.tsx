"use client";
import { useEffect, useRef } from "react";

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;

export default function SceneImagePanel({
  sceneImage,
}: {
  sceneImage?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !sceneImage) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image = new Image();
    image.src = sceneImage;
    image.crossOrigin = "anonymous";

    const resizeAndDraw = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, rect.width * dpr);
      const height = Math.max(1, rect.height * dpr);
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.clip();
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    };

    const observer = new ResizeObserver(resizeAndDraw);
    observer.observe(container);

    let rafId: number | null = null;
    const loop = () => {
      resizeAndDraw();
      rafId = requestAnimationFrame(loop);
    };

    if (image.complete) {
      loop();
    } else {
      image.onload = () => {
        resizeAndDraw();
        loop();
      };
    }

    return () => {
      image.onload = null;
      observer.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [sceneImage]);

  if (!sceneImage) return null;

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-2xl border bg-black/40">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-full"
      />
    </div>
  );
}
