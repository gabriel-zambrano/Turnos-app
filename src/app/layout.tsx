import * as Sentry from '@sentry/nextjs'
import type { Metadata } from 'next'
import { TenantProvider } from '@/components/TenantContext'
import './globals.css'

export function generateMetadata(): Metadata {
  return {
    title: 'DentalDesk',
    description: 'Sistema de gestión de turnos odontológicos',
    other: {
      ...Sentry.getTraceData()
    }
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              const saved = localStorage.getItem('theme');
              if (saved) {
                document.documentElement.setAttribute('data-theme', saved);
              } else {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
              }
            } catch (e) {}
          })();
        ` }} />
      </head>
      <body>
        <canvas id="particles-bg"/>
        <TenantProvider>
          <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
            {children}
          </div>
        </TenantProvider>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            const canvas = document.getElementById('particles-bg');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let W, H, particles = [];
            const COUNT = 80;
            const COLORS = [
              [56,138,221],
              [24,95,165],
              [29,158,117],
              [99,163,230],
              [56,138,221],
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
              this.r = Math.random() * 3.5 + 1.5;
              this.rgb = COLORS[Math.floor(Math.random() * COLORS.length)];
              this.alpha = Math.random() * 0.55 + 0.2;
            };
            Particle.prototype.update = function() {
              const dx = mouse.x - this.x;
              const dy = mouse.y - this.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 150) {
                this.vx -= (dx / dist) * 0.4;
                this.vy -= (dy / dist) * 0.4;
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
              const theme = document.documentElement.getAttribute('data-theme') || 'light';
              const grad = ctx.createLinearGradient(0, 0, W, H);
              if (theme === 'dark') {
                grad.addColorStop(0, '#050a12');
                grad.addColorStop(0.5, '#070e17');
                grad.addColorStop(1, '#0a1524');
              } else {
                grad.addColorStop(0, '#eef4fc');
                grad.addColorStop(0.5, '#f4f7fb');
                grad.addColorStop(1, '#e8f2f9');
              }
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, W, H);
              for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.update();
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                let r = p.rgb[0], g = p.rgb[1], b = p.rgb[2];
                if (theme === 'dark') {
                  if (p.rgb[0] === 24 && p.rgb[1] === 95) { // transform dark blue into soft purple
                    r = 127; g = 119; b = 221;
                  }
                }
                ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + p.alpha + ')';
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