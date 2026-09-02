"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Particle = {
  x: number;
  y: number;
  z: number;
  r: number;
};

export function SceneBackground({
  className,
  count = 110,
  mode = "parent",
}: {
  className?: string;
  count?: number;
  mode?: "parent" | "viewport";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const fov = 380;
    const particles: Particle[] = [];

    const resize = () => {
      if (mode === "viewport") {
        width = window.innerWidth;
        height = window.innerHeight;
      } else {
        const parent = canvas.parentElement;
        width = parent?.clientWidth || window.innerWidth;
        height = parent?.clientHeight || window.innerHeight;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const seed = () => {
      particles.length = 0;
      for (let i = 0; i < count; i += 1) {
        particles.push({
          x: (Math.random() - 0.5) * 1100,
          y: (Math.random() - 0.5) * 700,
          z: Math.random() * 900 + 60,
          r: 1.4 + Math.random() * 2.2,
        });
      }
    };

    const project = (p: Particle, camX: number, camY: number) => {
      const scale = fov / (fov + p.z);
      return {
        sx: width / 2 + (p.x + camX) * scale,
        sy: height / 2 + (p.y + camY) * scale,
        scale,
        depth: scale,
      };
    };

    const onMove = (event: PointerEvent) => {
      pointer.tx = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      pointer.ty = (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
    };

    const draw = () => {
      if (!running) return;
      frame = requestAnimationFrame(draw);

      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;

      const camX = pointer.x * 140;
      const camY = pointer.y * 90;
      const spin = reduceMotion ? 0 : 0.45;

      ctx.clearRect(0, 0, width, height);

      const projected = particles.map((p) => {
        if (!reduceMotion) {
          p.z -= spin;
          if (p.z < 30) {
            p.z = 940;
            p.x = (Math.random() - 0.5) * 1100;
            p.y = (Math.random() - 0.5) * 700;
          }
        }
        return { p, ...project(p, camX, camY) };
      });

      ctx.lineWidth = 1;
      for (let i = 0; i < projected.length; i += 1) {
        const a = projected[i];
        for (let j = i + 1; j < projected.length; j += 1) {
          const b = projected[j];
          const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
          if (dist > 140) continue;
          const alpha = (1 - dist / 140) * 0.28 * Math.min(a.depth, b.depth);
          ctx.strokeStyle = `rgba(240, 244, 255, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();
        }
      }

      for (const item of projected) {
        const alpha = 0.35 + item.depth * 0.6;
        const radius = item.p.r * item.scale * 1.6;
        const glow = ctx.createRadialGradient(
          item.sx,
          item.sy,
          0,
          item.sx,
          item.sy,
          radius * 5,
        );
        glow.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        glow.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(item.sx, item.sy, radius * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(alpha + 0.25, 1)})`;
        ctx.beginPath();
        ctx.arc(item.sx, item.sy, Math.max(radius, 1.2), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    resize();
    seed();
    draw();
    const observer =
      mode === "parent" && canvas.parentElement
        ? new ResizeObserver(resize)
        : null;
    observer?.observe(canvas.parentElement as Element);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", resize);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
    };
  }, [count, mode]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(
        "pointer-events-none",
        mode === "viewport"
          ? "fixed inset-0 z-0 h-screen w-screen"
          : "absolute inset-0 h-full w-full",
        className,
      )}
    />
  );
}
