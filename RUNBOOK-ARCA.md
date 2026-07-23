# Runbook · Facturación electrónica ARCA

Puesta en marcha del módulo de facturación. Tres etapas: la **A** deja todo
funcionando en simulación (hoy mismo, gratis), la **B** conecta con ARCA en
homologación, la **C** activa la emisión real.

---

## ✅ ESTADO: EN PRODUCCIÓN (23/07/2026)

El módulo está operativo y emitiendo comprobantes reales con validez fiscal
para el Dr. Benegas (CUIT 20366181831). CAE verificado por QR contra ARCA.

Configuración vigente en producción:
- **Certificado**: `dentaldesk-prod` (producción, vence 22/07/2028). Misma clave
  privada que homologación. Cargado en Vercel (`ARCA_CERT`, `ARCA_PRIVATE_KEY`).
- **Punto de venta**: `4` — modalidad "Factura Electrónica - Monotributo - Web
  Services" (el 3 es de Comprobantes en Línea y NO sirve para web services).
- **Vercel**: `ARCA_PRODUCTION=true`, `ARCA_CUIT=20366181831`, `ARCA_SDK_TOKEN` cargado.
- **AfipSDK**: plan Free (1 CUIT). Desde la 2ª clínica → Pro (USD 25/mes).

Para sumar una clínica nueva: repetir Etapa C (certificado propio de esa clínica
o delegación) + dar de alta su punto de venta web services + cargar su config
fiscal en la app. Recordar el límite de 1 CUIT del plan Free de AfipSDK.

Pendientes (próxima iteración): condición de venta configurable, notas de
crédito (anulaciones), listado/exportación de facturas emitidas.

---

## Etapa A — Operando en modo simulación (hoy)

**1. Aplicar la migración en Supabase**
En el dashboard de Supabase → SQL Editor, pegar y ejecutar el contenido de
`supabase_migration_arca.sql`. Es idempotente: no importa si la versión
anterior ya se había aplicado (elimina también la tabla obsoleta `arca_tokens`).

Verificación rápida (SQL Editor):
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'facturas' AND column_name IN ('punto_venta', 'simulada');
-- Debe devolver 2 filas
```

**2. Commit y deploy**
```bash
git add -A
git commit -m "feat(facturacion): emisión electrónica ARCA con delegación, simulación marcada y numeración segura"
git push
```
Vercel despliega solo. No hace falta ninguna variable de entorno nueva para
esta etapa (sin credenciales ARCA, el sistema emite en simulación).

**3. Probar el flujo completo**
1. Configuración → tarjeta "Facturación Electrónica (ARCA)": cargar el CUIT
   del Dr. Benegas, condición **Monotributista**, punto de venta (el que tenga
   registrado en ARCA), y guardar.
2. Finanzas → en una cita cobrada o ingreso manual → botón **Facturar 📄**.
3. Confirmar datos del paciente → Emitir. Debe aparecer el badge amarillo
   **"Simulada N°X"** y el aviso de que no tiene validez fiscal.

---

## Etapa B — Conectar con ARCA en homologación (pruebas reales sin validez)

**4. Cuenta en AfipSDK**
- Crear cuenta gratuita en https://app.afipsdk.com (plan Free: 1 CUIT,
  1.000 requests/mes — alcanza para el Dr. Benegas).

**5. Certificado digital de la plataforma**
- Necesitás un CUIT propio de la plataforma (el tuyo) con Clave Fiscal nivel 3.
- Generar el certificado para **homologación** (testing): AfipSDK tiene una
  guía/herramienta en https://afipsdk.com/generar-certificado-digital-arca
- Guardar el `.crt` y la clave privada `.key`.

**6. Variables de entorno en Vercel** (Settings → Environment Variables)
```
ARCA_CUIT=20XXXXXXXXX            # CUIT plataforma, solo dígitos
ARCA_CERT=<contenido del .crt>   # PEM completo, saltos de línea como \n
ARCA_PRIVATE_KEY=<contenido .key>
ARCA_PRODUCTION=false            # ← homologación
NEXT_PUBLIC_ARCA_PLATFORM_CUIT=20-XXXXXXXX-X
```
Redeploy. Desde ahí las emisiones van al ambiente de **testing** de ARCA:
CAE real de homologación, sin validez fiscal (siguen sin marcar "simulada"
solo si preferís; hoy el flag depende solo de que existan credenciales —
en homologación las facturas ya NO se marcan como simuladas, así que probá
con montos chicos y tené presente que son del ambiente de testing).

**7. Probar en homologación**
Repetir el paso 3. Si ARCA rechaza, el error exacto llega al toast
(los más comunes: punto de venta inexistente en ese ambiente, o fechas).

---

## Etapa C — Emisión real

**8. Certificado de producción + delegación**
- Generar certificado de **producción** para el CUIT de la plataforma y
  asociarlo al servicio `wsfe` en ARCA.
- El **Dr. Benegas** (cada clínica) delega desde su Clave Fiscal:
  1. Web de ARCA → "Administrador de Relaciones de Clave Fiscal".
  2. Nueva Relación → servicio **Facturación Electrónica (wsfe)**.
  3. Designar como representante al CUIT de la plataforma.
  (Estos pasos aparecen también en la pantalla de Configuración de la app.)
- Verificar que la clínica tenga el **punto de venta** dado de alta para
  factura electrónica (modo "RECE para aplicativo y web services").

**9. Cambiar a producción en Vercel**
```
ARCA_CERT / ARCA_PRIVATE_KEY = certificado de PRODUCCIÓN
ARCA_PRODUCTION=true
```
Redeploy y emitir una factura real de monto chico como prueba final.
Constatar el CAE en https://afipsdk.com/constatacion-cae o en la web de ARCA.

---

## Pendientes (próxima iteración)
- PDF de la factura con QR (RG 4892) para entregar al paciente
  (AfipSDK ofrece generación de PDF: 100 gratis/mes).
- Notas de crédito (anulaciones).
- Listado/exportación de facturas emitidas (hoy solo badge en Finanzas).
- Cuando haya 2+ clínicas facturando: plan Pro de AfipSDK (USD 25/mes).

## Costos
- ARCA/AFIP: gratis. AfipSDK Free: 1 CUIT y 1k requests/mes, $0.
- Desde la 2ª clínica: AfipSDK Pro USD 25/mes (hasta 10 CUITs).
