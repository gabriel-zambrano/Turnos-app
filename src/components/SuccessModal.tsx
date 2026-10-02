'use client'
import React, { useEffect } from 'react'

export interface SuccessModalProps {
  open: boolean
  onClose: () => void
  badge?: string
  title: string
  description: string
  detail?: string
  detailIcon?: string
  primaryButtonText?: string
  secondaryButtonText?: string
  onSecondaryAction?: () => void
  accentColor?: string
}

export function SuccessModal({
  open,
  onClose,
  badge = 'OPERACIÓN EXITOSA',
  title,
  description,
  detail,
  detailIcon = '🔒',
  primaryButtonText = 'Entendido',
  secondaryButtonText,
  onSecondaryAction,
  accentColor = '#0F4C5C',
}: SuccessModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 25, 47, 0.48)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        animation: 'premiumFadeIn 0.25s ease-out forwards',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#ffffff',
          borderRadius: 26,
          padding: '2.25rem 1.75rem 1.75rem',
          boxShadow: '0 25px 60px -12px rgba(10, 37, 64, 0.25), 0 0 1px rgba(10, 37, 64, 0.1)',
          border: '1px solid rgba(15, 76, 92, 0.12)',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          animation: 'premiumPopIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Soft Ambient Light Glow at top */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 220,
            height: 120,
            background: `radial-gradient(circle, ${accentColor}25 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />

        {/* Animated Checkmark Badge */}
        <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 1.25rem' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: `${accentColor}12`,
              animation: 'premiumPulse 2.4s infinite ease-in-out',
            }}
          />
          <div
            style={{
              position: 'relative',
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${accentColor}18, #E0F2F1)`,
              border: `2px solid ${accentColor}35`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 8px 20px ${accentColor}20`,
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke={accentColor}
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" className="premium-check-path" />
            </svg>
          </div>
        </div>

        {/* Category Pill */}
        {badge && (
          <div
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: accentColor,
              background: `${accentColor}10`,
              padding: '3px 10px',
              borderRadius: 20,
              marginBottom: 10,
              border: `1px solid ${accentColor}18`,
            }}
          >
            {badge}
          </div>
        )}

        {/* Title */}
        <h3
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: '#0A2540',
            letterSpacing: '-0.02em',
            margin: '0 0 8px 0',
            lineHeight: 1.3,
          }}
        >
          {title}
        </h3>

        {/* Description */}
        <p
          style={{
            fontSize: 13.5,
            color: '#475569',
            lineHeight: 1.55,
            margin: '0 0 16px 0',
          }}
        >
          {description}
        </p>

        {/* Security / Audit Callout */}
        {detail && (
          <div
            style={{
              background: 'rgba(10, 37, 64, 0.03)',
              border: '1px solid rgba(10, 37, 64, 0.08)',
              borderRadius: 14,
              padding: '10px 14px',
              fontSize: 12,
              color: '#334155',
              lineHeight: 1.45,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textAlign: 'left',
              marginBottom: 20,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{detailIcon}</span>
            <span>{detail}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: detail ? 0 : 6 }}>
          {secondaryButtonText && (
            <button
              type="button"
              onClick={() => {
                onSecondaryAction?.()
                onClose()
              }}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 12,
                border: '1px solid rgba(10, 37, 64, 0.12)',
                background: 'transparent',
                color: '#475569',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(10, 37, 64, 0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {secondaryButtonText}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1.5,
              padding: '12px 18px',
              borderRadius: 12,
              border: 'none',
              background: `linear-gradient(135deg, ${accentColor}, #0A2540)`,
              color: '#ffffff',
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: `0 4px 16px ${accentColor}30`,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = `0 6px 20px ${accentColor}45`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = `0 4px 16px ${accentColor}30`
            }}
          >
            {primaryButtonText}
          </button>
        </div>

        <style>{`
          @keyframes premiumFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes premiumPopIn {
            0% {
              opacity: 0;
              transform: scale(0.92) translateY(12px);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
          @keyframes premiumPulse {
            0% {
              transform: scale(1);
              opacity: 0.6;
            }
            50% {
              transform: scale(1.15);
              opacity: 0.15;
            }
            100% {
              transform: scale(1);
              opacity: 0.6;
            }
          }
          @keyframes drawPremiumCheck {
            0% {
              stroke-dashoffset: 30;
            }
            100% {
              stroke-dashoffset: 0;
            }
          }
          .premium-check-path {
            stroke-dasharray: 30;
            stroke-dashoffset: 30;
            animation: drawPremiumCheck 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.15s;
          }
        `}</style>
      </div>
    </div>
  )
}
