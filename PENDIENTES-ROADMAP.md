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
