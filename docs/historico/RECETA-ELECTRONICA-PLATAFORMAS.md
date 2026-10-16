# Receta electrónica — análisis de plataformas para integrar

Estado: **investigación / pausado.** Este documento resume el camino recomendado
(integrar con una plataforma ya habilitada en ReNaPDiS) y compara las opciones,
para retomar la decisión más adelante.

## Contexto regulatorio (resumen)

- Desde el **1/1/2025** la receta electrónica es la única válida en Argentina
  (Ley 27.553 + Resolución 2214/2025). Incluye a **odontólogos**.
- Para emitir recetas válidas hay que hacerlo desde una plataforma **registrada
  en el ReNaPDiS**. Construir una propia implica trámite TAD, integración con
  REFEPS/RENAPER, repositorio interoperable (HL7 FHIR), biometría/autenticación
  reforzada y CUIR — proyecto de meses con componente legal.
- **Decisión estratégica:** para un SaaS odontológico donde la receta es
  ocasional, conviene **integrarse por API con una plataforma ya habilitada**,
  no registrar plataforma propia.

## Comparativo de plataformas

| Plataforma | Registrada ReNaPDiS | ¿API para terceros? | Encaje con DentalDesk | Notas |
|---|---|---|---|---|
| **RCTA** (Innovamed) | Sí | **Sí, API pública para desarrolladores y sistemas de salud** | ★★★ El mejor candidato | No compite con la gestión de consultorio; ya lo integran terceros (ej. ConsultorioMÓVIL). Contacto: soporte@rcta.me / +54 9 11 2193-5123 |
| **Receto** (Cormos / DrApp) | Sí | No clara para terceros | ★ Bajo | Gratis para médicos, pero es parte del ecosistema **DrApp** (gestión de consultorios), es decir un **competidor** de DentalDesk. Su modelo es que uses DrApp+Receto. |
| **Recetario** (recetario.com.ar) | Sí | A confirmar | ★★ A investigar | No se encontró documentación pública de API; habría que consultarlos. |
| **Farmalink** | N/A (validador) | Es capa de validación/dispensación | — | Actúa **aguas abajo** (valida la receta en la farmacia). No es plataforma de emisión para el profesional; las plataformas se integran *a* Farmalink. |
| **Repositorio OSDE** | Repositorio | **Sí, API HL7 FHIR** | ★★ Complementario | Útil como repositorio interoperable, no como emisor. |

## Recomendación

**RCTA (Innovamed)** es la candidata más alineada: está registrada, ofrece API
para que software de terceros emita recetas, y **no compite** con DentalDesk como
sistema de gestión (a diferencia de Receto/DrApp).

## Primer paso concreto cuando se retome (no es código)

1. Contactar a **RCTA** (soporte@rcta.me) y pedir:
   - Documentación técnica de la API y sandbox de pruebas.
   - Modelo de precios (por receta / abono / revenue-share).
   - Confirmación de que aplica a **odontólogos** y que cubre validación de
     matrícula (REFEPS) e identidad del prescriptor.
   - Cómo se maneja la firma del profesional y la generación de CUIR/QR.
2. En paralelo, pedir lo mismo a **Recetario** para comparar condiciones.
3. Con eso, decidir integración y recién ahí estimar el trabajo de desarrollo
   (previsiblemente: pantalla de prescripción en la ficha del paciente +
   llamada a la API del partner + guardar la receta/QR y mostrarla al paciente).

## Datos técnicos que la integración deberá cubrir (según RG 2214/2025)

- Bloque profesional: nombre, profesión, **REFEPS**, matrícula/jurisdicción, firma.
- Bloque paciente: nombre, DNI/CUIL, fecha de nacimiento, sexo.
- Bloque prescripción: descripción, diagnóstico, fecha de vigencia.
- Bloque medicamento: **IFA** estandarizado, presentación, forma, cantidad.
- Identificadores: **CUIR** + QR/código de barras de trazabilidad.

Fuentes: argentina.gob.ar/salud/digital/renapdis, rcta.me, receto.com.ar, osde.com.ar/interoperabilidad
