# Pendientes / Roadmap

Ideas y mejoras que surgieron y quedaron para más adelante. Ordenadas por área.

## Portabilidad de datos
- **Exportar consentimientos firmados (PDF) en lote.** Hoy los PDF de
  consentimientos se descargan de a uno desde la ficha del paciente. Falta un
  botón que empaquete todos los consentimientos firmados de un paciente (o del
  consultorio) en un ZIP, para entregar la historia clínica completa. Implica
  generar N PDFs on-the-fly y comprimirlos (ej. librería `jszip`).

## Facturación electrónica
- **Condición de venta**: ya es configurable por factura. (hecho)
- Nada bloqueante pendiente. El certificado de producción vence **22/07/2028**
  (renovar antes con el mismo procedimiento del RUNBOOK-ARCA.md).

## Historia clínica / consentimientos
- **Editar/crear plantillas de consentimiento desde Configuración.** Hoy la
  plantilla por defecto se edita por SQL. Falta ABM de plantillas en la UI.
- Sumar más tipos de consentimiento (extracciones, tratamientos específicos).

## Receta electrónica
- Pausado. Ver `RECETA-ELECTRONICA-PLATAFORMAS.md`. Camino recomendado:
  integrar con **RCTA (Innovamed)** vía su API. Primer paso (no es código):
  escribir a soporte@rcta.me pidiendo documentación de API, precios y
  confirmación de que aplica a odontólogos.

## Importación de pacientes
- Hecho (Excel/CSV con mapeo). Posible mejora futura: importar también turnos
  históricos si algún sistema de origen los trae estructurados.

## CRM (evaluación jul/2026 — diferenciadores vs competencia)
- **Recall clínico automático.** HECHO (v1): intervalo por tratamiento +
  pestaña "Controles" en CRM. Mejora futura: envío automático (no clic 1×1).
- **Envío automatizado / campañas** de cumpleaños, reactivación y recall por
  WhatsApp en lote o programado (apoyarse en send-recordatorios + cron).
- **Segmentación y LTV**: clasificar pacientes (VIP, en riesgo, nuevo sin 2ª
  visita) por facturación y frecuencia.
- **Seguimiento post-tratamiento**: mensaje automático 2-3 días después de
  extracción/cirugía.
- **Embudo de presupuestos**: explotar la tabla `presupuestos` (aceptados vs
  pendientes vs perdidos) y recordar los no cerrados.

## Analítica / BI (evaluación jul/2026)
- **Ocupación de agenda**: % horas ocupadas vs disponibles, huecos muertos.
  (el KPI que más plata mueve; hoy no se mide)
- **Cohortes de retención**: de los nuevos de cada mes, cuántos vuelven a 3/6/12m.
- **Proyección de ingresos (forecast)** con agenda futura + histórico + saldos.
- **Predicción de no-show** por turno según historial (ya se guarda `no_show`).
- **Reporte automático semanal/mensual** por email/WhatsApp (extender daily-briefing).
- **Metas integradas**: traer `meta_mensual` (Finanzas) al BI para ver avance.

## Performance (pendientes tras el diagnóstico de julio)
- **Bundle del importador**: `xlsx` se importa estático en ImportarPacientesModal
  → viaja al bundle cliente de Pacientes (~400 KB). Fix: `dynamic import` al abrir.
- **CRM server-side**: hoy trae todos los pacientes y citas al navegador para
  calcular inactivos/recall. Con volumen alto conviene una vista/RPC server-side.
- **next/image**: adoptar en logos y fotos (hoy `<img>`), sobre todo por móvil.
- **Paginación**: agregar `.limit()`/`.range()` a los `select('*')` de listados.
- **Code-splitting**: cargar recharts (BI) y modales pesados con `next/dynamic`.
