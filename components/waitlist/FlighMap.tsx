"use client";
import { useEffect, useRef } from "react";

interface City {
  name: string;
  x: number;
  y: number;
}
interface Particle {
  from: number;
  to: number;
  t: number;
  speed: number;
}

const ROUTES: [number, number][] = [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5]];

function getCities(w: number, h: number): City[] {
  return [
    { name: "Washington D.C.", x: w * 0.18, y: h * 0.38 },
    { name: "Toronto",         x: w * 0.20, y: h * 0.33 },
    { name: "London",          x: w * 0.42, y: h * 0.28 },
    { name: "Dubai",           x: w * 0.60, y: h * 0.45 },
    { name: "Guangzhou",       x: w * 0.78, y: h * 0.42 },
    { name: "Addis Ababa",     x: w * 0.57, y: h * 0.56 },
  ];
}

function getControlPoint(a: City, b: City) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return { x: mx - dy * 0.25, y: my - Math.abs(dx) * 0.22 - dist * 0.08 };
}

function bezierPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  cp: { x: number; y: number },
  t: number
) {
  return {
    x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * cp.x + t * t * p1.x,
    y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * cp.y + t * t * p1.y,
  };
}

export default function FlightMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const particles: Particle[] = [];

    function initParticles() {
      particles.length = 0;
      ROUTES.forEach(([from, to]) => {
        for (let i = 0; i < 2; i++) {
          particles.push({
            from, to,
            t: Math.random(),
            speed: 0.0008 + Math.random() * 0.0006,
          });
        }
      });
    }

    function resize() {
      canvas!.width  = canvas!.offsetWidth;
      canvas!.height = canvas!.offsetHeight;
      initParticles();
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // emerald-700 = #047857
    const PRIMARY      = "#047857";
    const PRIMARY_GLOW = "rgba(4,120,87,";

    let raf: number;
    function draw() {
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const ctx = canvasEl.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      const cities = getCities(canvasEl.width, canvasEl.height);

      // Arcs
      ROUTES.forEach(([fi, ti]) => {
        const from = cities[fi], to = cities[ti];
        const cp = getControlPoint(from, to);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cp.x, cp.y, to.x, to.y);
        ctx.strokeStyle = "rgba(4,120,87,0.15)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // City dots
      cities.forEach((city, i) => {
        const isAddis = i === 5;
        const radius  = isAddis ? 7 : 4.5;
        const color   = isAddis ? PRIMARY : "rgba(55,65,81,0.5)";

        if (isAddis) {
          ctx.beginPath();
          ctx.arc(city.x, city.y, radius + 6, 0, Math.PI * 2);
          ctx.fillStyle = PRIMARY_GLOW + "0.08)";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(city.x, city.y, radius + 3, 0, Math.PI * 2);
          ctx.fillStyle = PRIMARY_GLOW + "0.18)";
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(city.x, city.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.font        = isAddis ? "600 11px Inter" : "400 9px Inter";
        ctx.fillStyle   = isAddis ? PRIMARY_GLOW + "0.9)" : "rgba(107,114,128,0.7)";
        ctx.textAlign   = "center";
        ctx.fillText(city.name, city.x, city.y + (isAddis ? -14 : -10));
      });

      // Particles
      particles.forEach((p) => {
        p.t += p.speed;
        if (p.t > 1) p.t = 0;
        const from = cities[p.from], to = cities[p.to];
        const cp   = getControlPoint(from, to);
        const pos  = bezierPoint(from, to, cp, p.t);
        const alpha = Math.sin(p.t * Math.PI);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = PRIMARY_GLOW + alpha * 0.9 + ")";
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full opacity-40"
    />
  );
}
