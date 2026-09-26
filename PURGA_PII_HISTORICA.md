# Purga de PII histórica · Sentry + Google Sheets

**26/08/2026** · Dos pendientes 🟠 del release gate. Ninguno cuesta dinero.

Los dos comparten la misma forma: **el sistema ya dejó de generar el problema, pero lo que se generó antes sigue ahí.** No confundir una cosa con la otra.

---

# 1 · Google Sheets

## Estado

**Identificada.** `TURNOS-2026` — [abrir](https://docs.google.com/spreadsheets/d/1nLPqQabBi4qUhSpj2YqTO27VGKns_FYwJH_v2o9BHtk/edit)

```
ID:          1nLPqQabBi4qUhSpj2YqTO27VGKns_FYwJH_v2o9BHtk
Dueño:       odbenegaswalter@gmail.com
Creada:      07/04/2026
Modificada:  17/06/2026
Permisos:    solo el dueño · sin enlace público · sin otros usuarios
```

**Contenido verificado:** `NOMBRE, EMAIL, TELEFONO, TRATAMIENTO, FECHA, HORA, ESTADO, NOTAS, ID`

La columna `NOTAS` tiene anotaciones clínicas: *"Ajuste / Caries"*, *"arreglo de caries"*, *"Quisiera hacer la limpieza de sarro con ultrasonido"*, *"Evitar gaseosas Cola, Vinotinto, cigarrillos"*.

## Dos cosas que salieron mejor de lo esperado

**Los permisos están limpios.** Solo el dueño. Sin enlace público, sin terceros. El escenario que preocupaba —"accesible para quien tenga el link"— no se dio.

**La ventana de exposición es más corta.** El trigger estuvo activo hasta el 25/08, pero **la planilla no se modifica desde el 17/06**. La explicación más probable es que la service account perdió el acceso —no figura en la lista de permisos— y la ruta venía fallando en silencio desde junio.

⚠️ **No está demostrado.** No hay logs de esa ruta que lo confirmen. El dato duro es la fecha de modificación.

## Acción

**Solo la puede hacer `odbenegaswalter@gmail.com`.** La cuenta conectada a estas herramientas es `gabrielle3612@gmail.com`, y un borrado desde ahí devuelve `The caller does not have permission`.

```
1. Entrar a Drive con odbenegaswalter@gmail.com
2. Abrir TURNOS-2026 (link arriba)
3. Archivo → Mover a la papelera
4. Papelera → Vaciar papelera        ← sin esto retiene 30 días
```

**El paso 4 es el que cierra.** El 3 solo la esconde.

## Verificación

Buscar `TURNOS-2026` en Drive desde ambas cuentas. Sin resultados = cerrado.

## No tocar

| Planilla | Qué es | Por qué queda |
|---|---|---|
| `FACTURAS GENERADAS AFIP` | Libro contable manual 2023-2026. Nombres y montos, **sin** notas clínicas ni contactos. En uso | **Retención fiscal** |
| `INCOMPLETO` | Trabajo de RR.HH. sobre Cognizant | Ajeno al consultorio |

---

# 2 · Sentry

## Estado

```
Organización:  andbrand-studio
Proyecto:      javascript-nextjs
DSN:           src/lib/sentry-config.ts:15   (hardcodeado, no es env var)
```

**Eventos nuevos: limpios.** `sendDefaultPii: false` más tres hooks de scrub —`beforeSend`, `beforeSendTransaction`, `beforeBreadcrumb`— fijados por 63 tests.

> El `beforeSendTransaction` no es redundante: **las URLs completas viajan en las trazas**, no solo en los errores. Sin ese hook, los tokens de paciente se irían igual.

**Eventos históricos: sucios.** Los anteriores a P0-06 contienen tokens de paciente en las URLs e IPs.

## Lo que Sentry no permite

**No se puede borrar un evento individual.** Solo la issue entera.

**Y borrar la issue no alcanza:** si el dato viajó como *tag*, sobrevive a la eliminación de la issue y hay que purgarlo aparte en `Project Settings → Tags`.

**`Delete & Discard` es solo del plan Business.**

Por eso, para un dato repartido entre muchas issues, la propia documentación de Sentry recomienda **borrar y recrear el proyecto**.

## Opción A · Borrar y recrear el proyecto ← recomendada

**Es definitiva y acá cuesta muy poco:** el proyecto se llama `javascript-nextjs`, el nombre por defecto. No hay alertas ni integraciones armadas que valga la pena conservar. Lo único que se pierde es el historial de issues de un producto que todavía no lanzó.

```
1. sentry.io → andbrand-studio → Projects → javascript-nextjs
2. Settings → General → al fondo → Remove Project
3. Create Project → Next.js
   Nombrarlo igual (javascript-nextjs) para no tocar next.config.js
4. Copiar el DSN nuevo
```

**Después, en el repo:**

```
5. src/lib/sentry-config.ts línea 15 → pegar el DSN nuevo
6. npm test && npx tsc --noEmit
7. commit + push  →  Vercel redespliega
```

**Si el nombre del proyecto cambia**, actualizar también `next.config.js:15` (`project: "javascript-nextjs"`), o los source maps dejan de subir.

**Sobre el DSN hardcodeado:** está bien así. Los DSN de Sentry son públicos por diseño —van dentro del bundle que se descarga cualquier visitante— y solo permiten *escribir* eventos. No es un secreto filtrado.

## Opción B · Borrar issue por issue

Viable solo si son pocas. En `Issues`, filtrar por `firstSeen:-30d`, abrir cada una y usar el ícono de papelera.

**Después, obligatorio:** `Project Settings → Tags` y purgar los tags que hayan capturado tokens o IPs.

**No garantiza completitud.** Si aparece una issue nueva agrupada con eventos viejos, los viejos vuelven con ella.

## Opción C · Esperar la retención

Los eventos caducan solos. **Verificar el período real** en `Settings → Subscription` — varía según el plan y el tipo de dato.

**Es la única opción que no requiere hacer nada, y la única sin fecha de cierre bajo tu control.** No sirve si querés poder afirmar que los datos ya no están.

## Verificación

Después de A:

```
Issues → sin resultados (proyecto nuevo, vacío)
Provocar un error de prueba en producción
  → llega al proyecto nuevo
  → la URL NO tiene el token de paciente
  → el evento NO tiene IP
```

**El último paso importa:** confirma que el scrub sigue activo después del recambio de DSN.

---

# Después de esto

Quedan en 🟠:

- [ ] Declarar la cuenta de mantenimiento en `/legal/privacidad`
- [ ] Corregir §7 de la política — promete borrado a 30 días sin mecanismo de baja
- [ ] Corregir §4 — menciona WhatsApp, que no envía nada
- [ ] `npm audit fix` + actualizar `resend`

Y en 🔴, solo backups:

- [ ] Supabase Pro + PITR
- [ ] **Backup de Storage** — independiente, PITR no lo cubre
- [ ] Restore verificado sobre las 23 tablas
- [ ] Abrir una foto clínica recuperada
