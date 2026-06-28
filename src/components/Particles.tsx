'use client'

/* Magic UI — Particles (canvas), diport mandiri tanpa dependency (MIT).
 * Sumber pola: magicui.design/docs/components/particles. Disesuaikan:
 * - menghormati prefers-reduced-motion (gambar 1 frame statis, tanpa RAF)
 * - pointer-events diatur via CSS kelas pemanggil (.auth-panel__particles) */

import { useEffect, useRef, useState } from 'react'

interface MousePosition {
  x: number
  y: number
}

function useMousePosition(): MousePosition {
  const [mousePosition, setMousePosition] = useState<MousePosition>({ x: 0, y: 0 })
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePosition({ x: event.clientX, y: event.clientY })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])
  return mousePosition
}

type ParticlesProps = {
  className?: string
  quantity?: number
  staticity?: number
  ease?: number
  size?: number
  refresh?: boolean
  color?: string
  vx?: number
  vy?: number
}

function hexToRgb(hex: string): number[] {
  hex = hex.replace('#', '')
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  const int = parseInt(hex, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

type Circle = {
  x: number
  y: number
  translateX: number
  translateY: number
  size: number
  alpha: number
  targetAlpha: number
  dx: number
  dy: number
  magnetism: number
}

export function Particles({
  className = '',
  quantity = 100,
  staticity = 50,
  ease = 50,
  size = 0.4,
  refresh = false,
  color = '#ffffff',
  vx = 0,
  vy = 0,
}: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const context = useRef<CanvasRenderingContext2D | null>(null)
  const circles = useRef<Circle[]>([])
  const mousePosition = useMousePosition()
  const mouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const canvasSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1
  const rafID = useRef<number | null>(null)
  const resizeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rgb = hexToRgb(color)

  useEffect(() => {
    if (canvasRef.current) context.current = canvasRef.current.getContext('2d')
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    initCanvas()
    if (reduce) drawStaticFrame()
    else animate()

    const handleResize = () => {
      if (resizeTimeout.current) clearTimeout(resizeTimeout.current)
      resizeTimeout.current = setTimeout(() => {
        initCanvas()
        if (reduce) drawStaticFrame()
      }, 200)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      if (rafID.current != null) cancelAnimationFrame(rafID.current)
      if (resizeTimeout.current) clearTimeout(resizeTimeout.current)
      window.removeEventListener('resize', handleResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, quantity])

  useEffect(() => {
    onMouseMove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mousePosition.x, mousePosition.y])

  useEffect(() => {
    initCanvas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  function initCanvas() {
    resizeCanvas()
    drawParticles()
  }

  function onMouseMove() {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const { w, h } = canvasSize.current
    const x = mousePosition.x - rect.left - w / 2
    const y = mousePosition.y - rect.top - h / 2
    if (x < w / 2 && x > -w / 2 && y < h / 2 && y > -h / 2) {
      mouse.current.x = x
      mouse.current.y = y
    }
  }

  function resizeCanvas() {
    if (!containerRef.current || !canvasRef.current || !context.current) return
    canvasSize.current.w = containerRef.current.offsetWidth
    canvasSize.current.h = containerRef.current.offsetHeight
    canvasRef.current.width = canvasSize.current.w * dpr
    canvasRef.current.height = canvasSize.current.h * dpr
    canvasRef.current.style.width = `${canvasSize.current.w}px`
    canvasRef.current.style.height = `${canvasSize.current.h}px`
    context.current.setTransform(dpr, 0, 0, dpr, 0, 0)
    circles.current = []
  }

  function circleParams(): Circle {
    const x = Math.floor(Math.random() * canvasSize.current.w)
    const y = Math.floor(Math.random() * canvasSize.current.h)
    const pSize = Math.floor(Math.random() * 2) + size
    const targetAlpha = parseFloat((Math.random() * 0.6 + 0.1).toFixed(1))
    const dx = (Math.random() - 0.5) * 0.1
    const dy = (Math.random() - 0.5) * 0.1
    const magnetism = 0.1 + Math.random() * 4
    return { x, y, translateX: 0, translateY: 0, size: pSize, alpha: 0, targetAlpha, dx, dy, magnetism }
  }

  function drawCircle(circle: Circle, update = false) {
    if (!context.current) return
    const { x, y, translateX, translateY, size: s, alpha } = circle
    context.current.translate(translateX, translateY)
    context.current.beginPath()
    context.current.arc(x, y, s, 0, 2 * Math.PI)
    context.current.fillStyle = `rgba(${rgb.join(', ')}, ${alpha})`
    context.current.fill()
    context.current.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (!update) circles.current.push(circle)
  }

  function clearContext() {
    context.current?.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h)
  }

  function drawParticles() {
    clearContext()
    for (let i = 0; i < quantity; i++) drawCircle(circleParams())
  }

  function drawStaticFrame() {
    clearContext()
    circles.current.forEach((circle) => {
      circle.alpha = circle.targetAlpha
      drawCircle(circle, true)
    })
  }

  function remap(value: number, a1: number, b1: number, a2: number, b2: number): number {
    const r = ((value - a1) * (b2 - a2)) / (b1 - a1) + a2
    return r > 0 ? r : 0
  }

  function animate() {
    clearContext()
    circles.current.forEach((circle, i) => {
      const edges = [
        circle.x + circle.translateX - circle.size,
        canvasSize.current.w - circle.x - circle.translateX - circle.size,
        circle.y + circle.translateY - circle.size,
        canvasSize.current.h - circle.y - circle.translateY - circle.size,
      ]
      const closest = edges.reduce((a, b) => Math.min(a, b))
      const remapped = parseFloat(remap(closest, 0, 20, 0, 1).toFixed(2))
      if (remapped > 1) {
        circle.alpha += 0.02
        if (circle.alpha > circle.targetAlpha) circle.alpha = circle.targetAlpha
      } else {
        circle.alpha = circle.targetAlpha * remapped
      }
      circle.x += circle.dx + vx
      circle.y += circle.dy + vy
      circle.translateX += (mouse.current.x / (staticity / circle.magnetism) - circle.translateX) / ease
      circle.translateY += (mouse.current.y / (staticity / circle.magnetism) - circle.translateY) / ease
      drawCircle(circle, true)
      if (
        circle.x < -circle.size ||
        circle.x > canvasSize.current.w + circle.size ||
        circle.y < -circle.size ||
        circle.y > canvasSize.current.h + circle.size
      ) {
        circles.current.splice(i, 1)
        drawCircle(circleParams())
      }
    })
    rafID.current = window.requestAnimationFrame(animate)
  }

  return (
    <div ref={containerRef} className={className} aria-hidden="true">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
