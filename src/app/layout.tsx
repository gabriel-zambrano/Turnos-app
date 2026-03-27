import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DentalDesk — Od. Walter Benegas',
  description: 'Sistema de gestión de turnos odontológicos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ background: 'transparent' }}>
        <canvas id="particles-bg"/>
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', background: 'transparent' }}>
          {children}
        </div>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            const canvas = document.getElementById('particles-bg');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let W, H, particles = [];
            const COUNT = 80;
            const COLORS = [
              'rgba(56,138,221,',
              'rgba(24,95,165,',
              'rgba(29,158,117,',
              'rgba(185,210,240,',
              'rgba(56,138,221,',
              'rgba(99,163,230,',
            ];
            let mouse = { x: -999, y: -999 };

            function resize() {
              W = canvas.width = window.innerWidth;
              H = canvas.height = window.innerHeight;
            }

            function Particle() { this.reset(); }
            Particle.prototype.reset = function() {
              this.x = Math.random() * W;
              this.y = Math.random() * H;
              this.vx = (Math.random() - 0.5) * 0.5;
              this.vy = (Math.random() - 0.5) * 0.5;
              this.r = Math.random() * 3 + 1.5;
              this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
              this.alpha = Math.random() * 0.5 + 0.25;
            };
            Particle.prototype.update = function() {
              const dx = mouse.x - this.x;
              const dy = mouse.y - this.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 150) {
                this.vx -= (dx / dist) * 0.35;
                this.vy -= (dy / dist) * 0.35;
              }
              this.vx *= 0.97;
              this.vy *= 0.97;
              this.x += this.vx;
              this.y += this.vy;
              if (this.x < 0) this.x = W;
              if (this.x > W) this.x = 0;
              if (this.y < 0) this.y = H;
              if (this.y > H) this.y = 0;
            };

            function init() {
              particles = [];
              for (let i = 0; i < COUNT; i++) particles.push(new Particle());
            }

            function draw() {
              ctx.clearRect(0, 0, W, H);
              ctx.fillStyle = '#f4f7fb';
              ctx.fillRect(0, 0, W, H);
              for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.update();
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = p.color + p.alpha + ')';
                ctx.fill();
              }
              requestAnimationFrame(draw);
            }

            window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
            window.addEventListener('mouseleave', () => { mouse.x = -999; mouse.y = -999; });
            window.addEventListener('resize', () => { resize(); init(); });

            resize();
            init();
            draw();
          })();
        ` }}/>
      </body>
    </html>
  )
}
