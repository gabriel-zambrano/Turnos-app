import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button, FormField, Modal, ConfirmDialog, EmptyState, ErrorState, Icon, ICON_NAMES } from './index'
import { indiceFocoAtrapado } from '@/lib/foco'

const h = React.createElement
const html = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('indiceFocoAtrapado', () => {
  it('de la última posición, Tab vuelve a la primera', () => expect(indiceFocoAtrapado(3, 2, false)).toBe(0))
  it('de la primera, Shift+Tab va a la última', () => expect(indiceFocoAtrapado(3, 0, true)).toBe(2))
  it('en el medio deja actuar al navegador', () => expect(indiceFocoAtrapado(3, 1, false)).toBeNull())
  it('con el foco fuera del modal lo trae adentro', () => {
    expect(indiceFocoAtrapado(3, -1, false)).toBe(0)
    expect(indiceFocoAtrapado(3, -1, true)).toBe(2)
  })
  it('sin enfocables no hace nada', () => expect(indiceFocoAtrapado(0, -1, false)).toBeNull())
})

describe('Button', () => {
  it('es type="button" por defecto: no envía formularios por accidente', () => {
    expect(html(h(Button, null, 'Guardar'))).toContain('type="button"')
  })
  it('aplica la variante y el tamaño como clases', () => {
    const out = html(h(Button, { variant: 'primary', size: 'sm' }, 'Cobrar'))
    expect(out).toContain('dd-btn--primary')
    expect(out).toContain('dd-btn--sm')
  })
  it('cargando: deshabilitado, aria-busy y texto de progreso', () => {
    const out = html(h(Button, { loading: true, loadingText: 'Registrando…' }, 'Confirmar cobro'))
    expect(out).toContain('disabled=""')
    expect(out).toContain('aria-busy="true"')
    expect(out).toContain('Registrando…')
    expect(out).not.toContain('Confirmar cobro')
  })
})

describe('FormField', () => {
  it('asocia el label con el control', () => {
    const out = html(h(FormField, { label: 'Monto', children: h('input', { type: 'number' }) }))
    const id = /<input[^>]* id="([^"]+)"/.exec(out)?.[1]
    expect(id).toBeTruthy()
    expect(out).toContain(`for="${id}"`)
  })
  it('con error: aria-invalid, descripción enlazada y sin la ayuda', () => {
    const out = html(h(FormField, { label: 'Monto', hint: 'En pesos', error: 'Poné un monto mayor a cero', id: 'monto', children: h('input') }))
    expect(out).toContain('aria-invalid="true"')
    expect(out).toContain('aria-describedby="monto-error"')
    expect(out).toContain('id="monto-error"')
    expect(out).not.toContain('En pesos')
  })
  it('requerido: aria-required y asterisco oculto al lector de pantalla', () => {
    const out = html(h(FormField, { label: 'Nombre', required: true, children: h('input') }))
    expect(out).toContain('aria-required="true"')
    expect(out).toMatch(/<span aria-hidden="true"[^>]*>\*<\/span>/)
  })
})

describe('Modal', () => {
  it('cerrado no renderiza nada', () => {
    expect(html(h(Modal, { open: false, onClose: () => {}, title: 'X' }))).toBe('')
  })
  it('abierto: rol de diálogo, modal, y título asociado', () => {
    const out = html(h(Modal, { open: true, onClose: () => {}, title: 'Registrar cobro' }, 'contenido'))
    expect(out).toContain('role="dialog"')
    expect(out).toContain('aria-modal="true"')
    const tid = /aria-labelledby="([^"]+)"/.exec(out)?.[1]
    expect(out).toContain(`<h2 id="${tid}"`)
    expect(out).toContain('aria-label="Cerrar"')
  })
  it('no cerrable mientras hay una operación en curso', () => {
    const out = html(h(Modal, { open: true, onClose: () => {}, title: 'Emitiendo', dismissible: false }))
    expect(out).not.toContain('aria-label="Cerrar"')
  })
})

describe('ConfirmDialog', () => {
  it('es un alertdialog con el dato concreto y las dos acciones', () => {
    const out = html(h(ConfirmDialog, {
      open: true, title: 'Emitir factura', confirmLabel: 'Emitir por $ 85.000',
      onConfirm: () => {}, onCancel: () => {},
      children: 'Se emite ante ARCA y no se puede borrar.',
    }))
    expect(out).toContain('role="alertdialog"')
    expect(out).toContain('Emitir por $ 85.000')
    expect(out).toContain('Cancelar')
    expect(out).toContain('dd-btn--danger')
  })
})

describe('EmptyState y ErrorState', () => {
  it('EmptyState muestra título, descripción y acción', () => {
    const out = html(h(EmptyState, { title: 'No hay turnos para hoy', description: 'La agenda está libre.', action: h('a', { href: '/agenda' }, 'Ir a la agenda') }))
    expect(out).toContain('No hay turnos para hoy')
    expect(out).toContain('href="/agenda"')
  })
  it('ErrorState es un alert y separa lo guardado de lo no guardado', () => {
    const out = html(h(ErrorState, {
      title: 'No se pudo emitir la factura.',
      saved: 'El cobro de $ 85.000 está guardado.',
      notSaved: 'La factura no se envió a ARCA.',
      onRetry: () => {},
    }))
    expect(out).toContain('role="alert"')
    expect(out).toContain('El cobro de $ 85.000 está guardado.')
    expect(out).toContain('Reintentar')
  })
})

describe('Icon', () => {
  it('decorativo por defecto', () => {
    expect(html(h(Icon, { name: 'check' }))).toContain('aria-hidden="true"')
  })
  it('con title se anuncia como imagen', () => {
    const out = html(h(Icon, { name: 'trash', title: 'Eliminar' }))
    expect(out).toContain('role="img"')
    expect(out).toContain('aria-label="Eliminar"')
  })
  it('todos los íconos renderizan', () => {
    for (const n of ICON_NAMES) expect(html(h(Icon, { name: n }))).toContain('<svg')
  })
})
