# Estado del proyecto — DentalDesk

Handoff para retomar el trabajo en una sesión nueva. Todo el trabajo está
commiteado. Documentación complementaria en el repo: `RUNBOOK-ARCA.md`,
`PENDIENTES-ROADMAP.md`, `RECETA-ELECTRONICA-PLATAFORMAS.md`.

**Stack:** Next.js 14 (App Router) + Supabase (Postgres + Auth) + Vercel.
Carpeta del proyecto: `Turnos-app`. SaaS multi-tenant de gestión odontológica.

## Etapa actual

**El producto corre sobre el dominio del Dr. Benegas** (`walterbenegas.com.ar`)
mientras se pule con un consultorio real. DentalDesk va a migrar a su propio
dominio y marca; el consultorio queda después como un cliente más.

Consecuencia práctica: hoy "dominio de la plataforma" y "dominio de la clínica"
coinciden, y eso tapa bugs de multi-tenant que solo aparecen con la segunda
clínica. Ante cualquier URL que vea un paciente, va el dominio de **su** clínica
(`urlDeClinica()`), nunca `APP_URL`. Checklist de migración en
`DECISIONES-PRODUCTO.md`, sección 0.

## Hecho y funcionando

- **Facturación electrónica ARCA — EN PRODUCCIÓN** (validez fiscal real).
  CUIT del Dr. Benegas (20366181831), punto de venta **4** (web services),
  vía AfipSDK. Certificado de producción vence **22/07/2028** (renovar antes).
  Incluye: PDF con formato oficial + QR (RG 4892), facturar a consumidor final
  sin DNI, listado de facturas, notas de crédito (anulación), condición de
  venta elegible.
- **Consentimientos informados con firma digital** (presencial en pantalla y
  remota por link/token). Registro inmutable con hash SHA-256 + IP (Ley 26.529).
  PDF del consentimiento firmado.
- **Import/export de pacientes** (Excel/CSV con mapeo de columnas; export
  multi-hoja: pacientes, turnos, facturas).
- **CRM**: recall clínico automático (intervalo de control por tratamiento,
  pestaña "Controles") + automatización de campañas por WhatsApp
  (cumpleaños/recall/reactivación). La infra está lista pero **falta el setup
  de Meta** (número, plantillas aprobadas, credenciales WHATSAPP_*). Por ahora
  el envío es manual 1×1 desde el CRM (links wa.me).
- **BI / Analítica**: pestaña de ocupación de agenda (ocupación general, por día
  y por hora, con insight de la franja más libre).
- **Cuidados posteriores por email**: instructivo por tratamiento (editable en
  Precios) + botón "Enviar cuidados" en la ficha del paciente. Email con branding
  del consultorio (color/logo/dirección automáticos).
- **Performance**: índices, RLS optimizado, cliente Supabase memoizado,
  code-splitting parcial, xlsx dinámico, fuentes con preconnect (no @import),
  middleware sin queries de tenant redundantes, aurora sin animar en móvil.
  PageSpeed móvil: ~94 (login público), ~80 en la web pública (LCP por
  arquitectura client-side; ver más abajo).

## Pendiente de APLICAR (importante)

- Correr en Supabase (SQL Editor) las migraciones que falten:
  `supabase_migration_recall.sql`, `supabase_migration_crm_automatizacion.sql`,
  `supabase_migration_cuidados.sql`. (Las de ARCA y consentimientos ya se corrieron.)
- `git push` de los últimos commits para desplegar en Vercel.

## Pendientes del roadmap (ver PENDIENTES-ROADMAP.md)

- **Receta electrónica**: pausada. Camino recomendado: integrar API de **RCTA
  (Innovamed)**. Primer paso: mail a soporte@rcta.me (ver RECETA-ELECTRONICA-PLATAFORMAS.md).
- **Cuidados posteriores**: envío automático al marcar "asistió" + variante WhatsApp.
- **CRM**: segmentación/LTV, embudo de presupuestos, historial de envíos.
- **BI**: cohortes de retención, forecast de ingresos, predicción de no-show,
  reporte automático semanal, metas integradas.
- **Consentimientos**: ABM de plantillas desde Configuración (hoy por SQL);
  exportar PDFs de consentimientos en lote (ZIP).
- **Performance (opcional, ganancia marginal a 80-94)**: server-render de las
  páginas públicas (login, portal del paciente) para bajar el LCP; paginación
  de listados; CRM server-side; recharts con next/dynamic.

## Preferencias de trabajo

Respuestas concisas y directas, en español (Argentina). Verificar con
typecheck (`npx tsc --noEmit`) y tests (`npx vitest run`) antes de commitear.
