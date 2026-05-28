import React from 'react'
import Link from 'next/link'

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a122c', color: '#f8fafc', fontFamily: 'Outfit, Inter, sans-serif', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap');
        
        .nav-link {
          color: #94a3b8;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: color 0.2s;
        }
        .nav-link:hover {
          color: #38bdf8;
        }
        
        .btn-nav-register {
          background: #0284c7;
          color: #fff;
          padding: 8px 20px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
          transition: background 0.2s;
        }
        .btn-nav-register:hover {
          background: #0369a1;
        }
        
        .hero-gradient {
          background: radial-gradient(circle at top, rgba(56, 189, 248, 0.15), transparent 60%);
        }
        
        .btn-gradient {
          background: linear-gradient(135deg, #0284c7, #0369a1);
          color: #fff;
          padding: 12px 28px;
          border-radius: 12px;
          text-decoration: none;
          font-weight: 600;
          font-size: 15px;
          box-shadow: 0 4px 20px rgba(2, 132, 199, 0.3);
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .btn-gradient:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(2, 132, 199, 0.45);
        }

        .btn-outline {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #f8fafc;
          padding: 12px 28px;
          border-radius: 12px;
          text-decoration: none;
          font-weight: 600;
          font-size: 15px;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
        }
        .btn-outline:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
        }
        
        .feature-card {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          padding: 32px;
          transition: all 0.3s;
          backdrop-filter: blur(10px);
        }
        .feature-card:hover {
          transform: translateY(-6px);
          border-color: rgba(56, 189, 248, 0.2);
          box-shadow: 0 10px 30px rgba(2, 132, 199, 0.1);
        }
        
        .price-card {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 24px;
          padding: 40px 32px;
          position: relative;
          transition: all 0.3s;
        }
        .price-card.pro {
          border-color: rgba(56, 189, 248, 0.3);
          background: radial-gradient(circle at top right, rgba(2, 132, 199, 0.1), rgba(15, 23, 42, 0.6));
          box-shadow: 0 8px 32px rgba(2, 132, 199, 0.08);
        }

        .legal-link {
          color: #64748b;
          font-size: 13px;
          text-decoration: none;
          transition: color 0.2s;
        }
        .legal-link:hover {
          color: #fff;
        }
        
        @media (max-width: 768px) {
          .mobile-stack {
            flex-direction: column;
            gap: 16px;
          }
          .mobile-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Navigation */}
      <header style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10, 18, 44, 0.8)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🦷</span>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', background: 'linear-gradient(90deg, #38bdf8, #0ea5e9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>DentalDesk</span>
          </div>

          <nav className="mobile-stack" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <a href="#features" className="nav-link">Características</a>
            <a href="#pricing" className="nav-link">Planes y Precios</a>
            <Link href="/login" className="nav-link">Iniciar Sesión</Link>
            <Link href="/registro" className="btn-nav-register">
              Registrarse
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-gradient" style={{ padding: '80px 24px 100px', position: 'relative' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '6px 16px', borderRadius: 30, fontSize: 13, fontWeight: 600, color: '#38bdf8', marginBottom: 24 }}>
            <span>🚀</span> ¡Nuevo! Módulo de Analítica & Suscripciones Pro habilitado
          </div>
          
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-1.5px', color: '#fff', marginBottom: 24 }}>
            Llevá tu clínica dental al <br />
            <span style={{ background: 'linear-gradient(90deg, #38bdf8, #0ea5e9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Siguiente Nivel</span>
          </h1>
          
          <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: '#94a3b8', lineHeight: 1.6, maxWidth: 680, margin: '0 auto 40px' }}>
            La plataforma SaaS multi-inquilino definitiva para odontólogos independientes y clínicas boutique. Organizá tu agenda, gestioná fichas clínicas y analizá tus ingresos de forma simple.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }} className="mobile-stack">
            <Link href="/registro" className="btn-gradient">
              Probar 14 Días Gratis <span>→</span>
            </Link>
            <Link href="/login" className="btn-outline">
              Ingresar al Panel
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" style={{ padding: '80px 24px', background: '#070d22' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.8px', marginBottom: 12 }}>Diseñado para optimizar tu jornada</h2>
            <p style={{ color: '#94a3b8', fontSize: 16 }}>Todo lo que necesitas para administrar tu consultorio sin complicaciones</p>
          </div>

          <div className="mobile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            <div className="feature-card">
              <div style={{ fontSize: 32, marginBottom: 16 }}>📅</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Calendario Drag & Drop</h3>
              <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                Arrastrá y soltá citas para reprogramarlas al instante. Interfaz ultra-rápida y soporte nativo para sobreturnos y bloqueos de sillón.
              </p>
            </div>

            <div className="feature-card">
              <div style={{ fontSize: 32, marginBottom: 16 }}>📊</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Módulo de BI & Analítica</h3>
              <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                Analizá la rentabilidad de cada tratamiento, visualizá tus ingresos netos y monitoreá las tasas de no-shows con gráficos interactivos.
              </p>
            </div>

            <div className="feature-card">
              <div style={{ fontSize: 32, marginBottom: 16 }}>👤</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Portal del Paciente</h3>
              <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                Permite a tus pacientes confirmar o cancelar sus citas mediante un enlace seguro personalizado con tu propio logo e identidad de colores.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.8px', marginBottom: 12 }}>Planes simples y transparentes</h2>
            <p style={{ color: '#94a3b8', fontSize: 16 }}>Comenzá hoy mismo, cancelá cuando quieras</p>
          </div>

          <div className="mobile-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, maxWidth: 800, margin: '0 auto' }}>
            {/* Starter Plan */}
            <div className="price-card">
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Plan Starter</h3>
              <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4, marginBottom: 24 }}>Ideal para profesionales independientes</p>
              
              <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 24 }}>Gratis <span style={{ fontSize: 14, fontWeight: 400, color: '#94a3b8' }}>/ por siempre</span></div>
              
              <ul style={{ paddingLeft: 20, margin: '0 0 40px', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, color: '#cbd5e1' }}>
                <li>Gestión de turnos & agenda</li>
                <li>Base de datos de pacientes</li>
                <li>Fichas clínicas básicas</li>
                <li>Portal del Paciente estático</li>
              </ul>
              
              <Link href="/registro" style={{ display: 'block', textAlign: 'center', padding: '12px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 14, border: '1px solid rgba(255,255,255,0.1)' }}>
                Comenzar Gratis
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="price-card pro">
              <span style={{ position: 'absolute', top: -12, right: 20, background: '#0284c7', color: '#fff', fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recomendado</span>
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Plan Pro ⭐</h3>
              <p style={{ color: '#0ea5e9', fontSize: 13, marginTop: 4, marginBottom: 24 }}>Potenciá tu clínica dental</p>
              
              <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 24 }}>$3.500 ARS <span style={{ fontSize: 14, fontWeight: 400, color: '#94a3b8' }}>/ mes</span></div>
              
              <ul style={{ paddingLeft: 20, margin: '0 0 40px', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, color: '#cbd5e1' }}>
                <li><strong>Todo en el Plan Starter +</strong></li>
                <li><strong>Módulo de BI & Analítica de Negocio</strong></li>
                <li><strong>Rentabilidad por tratamiento</strong></li>
                <li><strong>Exportación de reportes a CSV</strong></li>
                <li>Branding personalizado ilimitado</li>
                <li><strong>14 días de prueba gratis</strong></li>
              </ul>
              
              <Link href="/registro" style={{ display: 'block', textAlign: 'center', padding: '12px', borderRadius: 10, background: '#0284c7', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14, boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)' }}>
                Iniciar Trial Gratis
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section style={{ padding: '80px 24px', background: '#070d22', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>¿Listo para modernizar tu consultorio?</h2>
          <p style={{ color: '#94a3b8', fontSize: 15, marginBottom: 32 }}>Registrate en menos de 2 minutos y obtené acceso completo a todas las funcionalidades.</p>
          <Link href="/registro" className="btn-gradient" style={{ padding: '14px 36px' }}>
            Crear Mi Cuenta Ahora
          </Link>
        </div>
      </section>

      {/* Legal Footer */}
      <footer style={{ background: '#040817', padding: '40px 24px', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ fontSize: 14, color: '#64748b' }}>
            © {new Date().getFullYear()} DentalDesk. Todos los derechos reservados.
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <Link href="/legal/privacidad" className="legal-link">Política de Privacidad</Link>
            <Link href="/legal/terminos" className="legal-link">Términos y Condiciones</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
