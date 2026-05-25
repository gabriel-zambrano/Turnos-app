export function triggerConfetti() {
  if (typeof window === 'undefined') return
 
  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.inset = '0'
  canvas.style.width = '100vw'
  canvas.style.height = '100vh'
  canvas.style.zIndex = '9999'
  canvas.style.pointerEvents = 'none'
  document.body.appendChild(canvas)
 
  const ctx = canvas.getContext('2d')
  if (!ctx) return
 
  let W = (canvas.width = window.innerWidth)
  let H = (canvas.height = window.innerHeight)
 
  const handleResize = () => {
    W = canvas.width = window.innerWidth
    H = canvas.height = window.innerHeight
  }
  window.addEventListener('resize', handleResize)
 
  const colors = ['#f43f5e', '#3b82f6', '#10b981', '#eab308', '#a855f7', '#ff7849']
  const particles: any[] = []
 
  // Crear partículas saliendo de los laterales inferiores
  for (let i = 0; i < 120; i++) {
    const fromLeft = Math.random() > 0.5
    particles.push({
      x: fromLeft ? 0 : W,
      y: H - 50,
      r: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0,
      vx: (fromLeft ? 1 : -1) * (Math.random() * 10 + 4),
      vy: -(Math.random() * 15 + 10), // Lanzados hacia arriba
      g: 0.35 // Gravedad
    })
  }
 
  let animationFrameId: number
  const start = Date.now()
 
  function draw() {
    ctx!.clearRect(0, 0, W, H)
 
    let active = false
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      
      // Aplicar gravedad y velocidades
      p.vy += p.g
      p.x += p.vx
      p.y += p.vy
      p.tiltAngle += p.tiltAngleIncremental
      p.tilt = Math.sin(p.tiltAngle) * 12
 
      if (p.y < H + 20 && p.x > -20 && p.x < W + 20) {
        active = true
      }
 
      ctx!.beginPath()
      ctx!.lineWidth = p.r
      ctx!.strokeStyle = p.color
      ctx!.moveTo(p.x + p.tilt + p.r / 2, p.y)
      ctx!.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2)
      ctx!.stroke()
    }
 
    if (active && Date.now() - start < 3500) {
      animationFrameId = requestAnimationFrame(draw)
    } else {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      canvas.remove()
    }
  }
 
  draw()
}
