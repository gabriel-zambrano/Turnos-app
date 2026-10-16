# DentalDesk · Auditoría pre-lanzamiento

**25/08/2026 · Criterio: piloto gratuito con clínicas reales, antes de pagar Supabase Pro.**

Cada hallazgo lleva evidencia del repositorio o de producción. Lo que no pude verificar está marcado **NO VERIFICADO**.

---

## ⚠️ Correcciones al estado que me pasaste

Tres puntos de tu resumen no coinciden con el estado real. **Importan para el veredicto.**

| Dijiste | Real | Evidencia |
|---|---|---|
| "`logos` migración escrita **pero no aplicada**" | **APLICADA** el 25/08 | `db push` completado · 8 policies verificadas en producción, incluidas `logos_insert/update/delete_tenant` con `{authenticated}` |
| "R-12: **4 funciones**, migración no aplicada" | **APLICADA** · y eran **9**, no 4 | `R-12: 9 función(es) corregida(s)` · `14 SECURITY DEFINER, todas con pg_temp` |
| "No existe `owner`" | **Existe** desde hoy | `UPDATE ... RETURNING` devolvió 1 fila · `a89ed5ae…` = `owner` |

⚠️ **Y hay una deriva documental que causó parte de esta confusión:** el encabezado de `20260822190000_p0_09_storage…sql` **sigue diciendo `NO APLICADO`** aunque está aplicado. Un archivo que miente sobre su propio estado es cómo alguien lo vuelve a aplicar o lo da por pendiente. **Cambio local, sin riesgo.**

---

# A · VEREDICTO

## 🟠 GO CONDICIONADO — para piloto gratuito

**Con dos condiciones que se cumplen sin pagar nada.**

El aislamiento cross-tenant en la capa de datos está probado dinámicamente contra PostgreSQL real. La escalada de privilegios está cerrada. Los tres bugs que rompían producción se corrigieron hoy. Ninguno de los hallazgos abiertos permite que una clínica lea los datos de otra.

**No es GO limpio** porque hay dos cosas sin resolver que sí pueden causar una fuga entre clínicas y una afirmación comercial falsa.

**No es NO-GO** porque las dos se cierran con trabajo local y decisiones, no con dinero.

**La ausencia de backups NO es NO-GO para un piloto gratuito sin datos de terceros.** Lo desarrollo en la sección B-5.

---

# B · Los 5 riesgos que todavía podrían justificar un NO-GO

## 🔴 B-1 · `sync-sheet` exporta datos de todas las clínicas a UNA sola planilla

**El hallazgo más grave, y no estaba en ninguna lista previa.**

`src/app/api/sync-sheet/route.ts` escribe en `process.env.GOOGLE_SHEET_ID` — **una única planilla, sin dimensión de tenant**:

```ts
nombre, email, telefono, tipo_tratamiento, fecha, hora, estado,
record.notas ?? "",     // ← notas internas del profesional
record.id
```

**Dos problemas:**

**Fuga cross-tenant por integración.** Con dos clínicas activas, los turnos y datos de contacto de los pacientes de ambas caen en **la misma planilla de Google**. RLS no interviene: la ruta usa `service_role` y escribe fuera de la base.

**Notas internas exportadas.** El campo `notas` son las anotaciones del profesional. `src/app/api/paciente/[token]/route.ts` lo dice explícitamente: *"NO devolvemos el campo `notas` de las citas: son notas internas del profesional y no deben mostrarse al paciente."* Y acá van a una planilla.

**Estado: NO VERIFICADO si está activo.** Depende de que el Database Webhook esté configurado en Supabase — no puedo consultarlo. **Verificalo antes de sumar la segunda clínica.**

| | |
|---|---|
| **Si el webhook está activo** | 🔴 **NO-GO** hasta desactivarlo o dar planilla por tenant |
| **Si está inactivo** | 🟠 Desactivar la ruta o documentar que no debe habilitarse |

**Cierre local:** deshabilitar la ruta con un flag, o exigir `tenant_id` en el payload y resolver `GOOGLE_SHEET_ID` por clínica.

## 🟠 B-2 · Los PDFs dependen de una sola capa

`/api/consentimientos/pdf/[id]` y `/api/facturacion/pdf/[id]` consultan:

```ts
.from('consentimientos_firmados').select('*').eq('id', params.id).maybeSingle()
```

**Sin ningún filtro por tenant.**

**Hoy están protegidos**, verificado: usan `createClient()` de `@/lib/supabase/server`, que corre con la **anon key + cookies** → rol `authenticated` → **RLS aplica**. Las cuatro tablas tienen policy de SELECT. Un `id` ajeno devuelve `null` y la ruta responde 404.

**Por qué es 🟠 y no 🟢:**

**La defensa es de una sola capa y el código no lo dice.** Nada en esas rutas señala que la seguridad depende de RLS. Alguien que cambie `createClient()` por `supabaseAdmin` —para "arreglar" un caso borde, como ya pasó en `equipo/miembros`— convierte ambas en IDOR abierto **sin que ningún test falle**.

**Y no está probado dinámicamente.** Los 65 tests de IDOR cubren la capa de datos, no estas rutas.

**Cierre local:** un comentario explícito en cada ruta, y un test que verifique que **no** usan `SERVICE_ROLE_KEY`.

## 🟠 B-3 · Afirmar control de acceso por rol clínico sería falso

**Verificado:** de 47 policies RLS, **43 son de pertenencia al tenant** y solo 4 consultan el rol — `arca_config_write`, `plantillas_write`, `crm_campanas_write`, `tenants_update_own`, todas administrativas.

**Consecuencia concreta:** cualquier usuario de una clínica —sea `owner`, `admin`, `odontologo` o `staff`— ve y edita **exactamente lo mismo** en pacientes, historia clínica, odontograma, fotos, presupuestos y pagos.

**Y DO-6 no lo cambia.** DO-6 restringe quién factura, quién administra el equipo y quién exporta. **No restringe quién ve una historia clínica.**

**Es 🟠 y no 🔴** porque tu decisión de no anunciar `odontologo`/`staff` en el piloto lo neutraliza. **Pasa a 🔴 el día que se anuncien.** Ver sección G.

## 🟠 B-4 · Comparación de secreto sin protección de tiempo, inconsistente con el propio código

`sync-sheet` línea 20:

```ts
if (!process.env.SYNC_SHEET_SECRET || authHeader !== `Bearer ${process.env.SYNC_SHEET_SECRET}`)
```

**`!==` compara byte a byte y corta al primer fallo.** Mientras tanto `src/lib/cron-auth.ts` hace lo correcto para el mismo problema:

```ts
crypto.timingSafeEqual(bufA, bufB)
```

**Riesgo práctico bajo** — el ruido de red domina sobre la diferencia de nanosegundos. **Pero es una inconsistencia con el estándar que el propio proyecto ya estableció**, y el arreglo son tres líneas: importar `comparacionSegura` de `cron-auth.ts`.

## 🟡 B-5 · Sin backups — y por qué NO es NO-GO para un piloto gratuito

**El hecho no se discute: no existen backups automáticos ni PITR. RPO infinito. 212 pacientes reales.**

**Por qué no bloquea un piloto gratuito:**

Los 212 pacientes son **de tu propia clínica**. El riesgo es tuyo, no de un tercero que te pagó. Un piloto gratuito sin datos de clínicas ajenas es un riesgo que **vos podés aceptar por vos mismo**.

**Por qué es NO-GO absoluto en cuanto haya una clínica ajena:**

Cuando una clínica cargue sus pacientes, ya no estás aceptando tu propio riesgo: **estás aceptando el de ellos, sin decírselo.** Perder la historia clínica de un tercero sin posibilidad de recuperación no es deuda técnica, es un daño irreversible a datos de salud que no te pertenecen.

| Escenario | Veredicto |
|---|---|
| Piloto con **tu propia clínica** | 🟡 Riesgo aceptado, tuyo |
| **Cualquier clínica ajena**, aunque no pague | 🔴 **NO-GO sin backups** |

**Mitigación gratuita mientras tanto:** `./probar-restore.sh` semanal, con el dump guardado fuera de la máquina. RTO medido: 154 s. **No es un backup** —hay que acordarse de correrlo— pero convierte "pérdida total" en "pérdida de una semana".

---

# C · Todo lo que puede esperar hasta después del primer piloto

**Verificado como cerrado — no requiere acción:**

🟢 **Aislamiento cross-tenant en la capa de datos.** 65 tests dinámicos, PostgreSQL real, políticas reales cargadas desde la migración, 2 tenants, las 4 operaciones sobre 12 tablas. Incluye el caso sutil: mover una fila propia al tenant ajeno.

🟢 **`anon` contenido.** Verificado en producción tras B1.6: solo `SELECT` sobre `tenants_public` y `USAGE` sobre el esquema.

🟢 **Escalada `admin → owner`.** Cerrada con 14 tests, validación server-side previa a cualquier efecto.

🟢 **`fotos_clinicas`.** Bucket privado, 4 policies con aislamiento por tenant en las 4 operaciones, ahora versionadas.

🟢 **`logos`.** Aplicado hoy: `{authenticated}` con aislamiento por prefijo de tenant, `USING` explícito en UPDATE, límites de MIME y tamaño.

🟢 **R-12.** 14 funciones `SECURITY DEFINER`, todas con `pg_temp`.

🟢 **MercadoPago.** HMAC-SHA256 con `timingSafeEqual`, re-consulta el estado a la API en vez de confiar en el body.

🟢 **Resend.** Firma `svix` verificada.

🟢 **`horas-ocupadas`.** Exige `tenant_id`, valida formato UUID, filtra por él. Público a propósito — el flujo de reserva lo necesita.

**Deuda real, post-piloto:**

🟡 Las 13 escrituras de `finanzas` que informan éxito sin mirar el resultado · suite IDOR por HTTP sobre las 7 rutas con parámetro en el path · `FORCE RLS` ausente en 43/43 tablas · migrar a Next 15/16 · el export omite la historia clínica · no existe baja de tenant · la Edge Function `enviar-recordatorios` sin versionar · el job 3 de pg_cron que corre y no hace nada · purgar Sentry histórico.

---

# D · Checklist gratuito de lanzamiento

| | Acción | Tiempo | Bloquea |
|---|---|---|---|
| 1 | **Verificar si el Database Webhook de `sync-sheet` está activo** en Supabase | 5 min | **Sí** |
| 2 | Si está activo: **desactivarlo** hasta que tenga planilla por tenant | 5 min | **Sí** |
| 3 | Corregir el encabezado `NO APLICADO` de la migración de Storage | 2 min | No |
| 4 | Comentario + test de "estas rutas dependen de RLS" en los 2 PDFs | 30 min | No |
| 5 | `timingSafeEqual` en `sync-sheet` | 10 min | No |
| 6 | Declarar el acceso de mantenimiento en `/legal/privacidad` | 10 min | **Sí**¹ |
| 7 | Purgar Sentry histórico | 15 min | No² |
| 8 | Documentar el job 3 de pg_cron | 5 min | No |
| 9 | Commitear la documentación pendiente | 2 min | No |
| 10 | Los 12 smoke tests de `RELEASE-CHECKLIST.md` §15 | 15 min | **Sí** |

¹ Bloquea el primer cliente ajeno, no el piloto con tu clínica.
² Bloquea si el piloto incluye clínicas ajenas: los eventos viejos tienen tokens de paciente e IPs.

---

# E · Checklist que requiere Supabase Pro

**El día que tengas los 25 USD, en este orden:**

```
1. Settings → Billing → Upgrade to Pro
2. Settings → Database → Point-in-Time Recovery → Enable
3. Anotar la ventana de retención
4. Database → Backups → confirmar que lista al menos uno
   ⚠️ Si esa pantalla está vacía, NO hay backup. No avanzar.
5. cd ~/Turnos-app && open -a Docker && ./probar-restore.sh
6. Comparar los 6 conteos contra producción:
   SELECT 'pacientes',count(*) FROM pacientes
   UNION ALL SELECT 'citas',count(*) FROM citas
   UNION ALL SELECT 'facturas',count(*) FROM facturas
   UNION ALL SELECT 'pagos',count(*) FROM pagos
   UNION ALL SELECT 'historial_puntos',count(*) FROM historial_puntos
   UNION ALL SELECT 'tenant_users',count(*) FROM tenant_users ORDER BY 1;
   ⚠️ Una sola diferencia invalida el restore.
7. npx supabase stop && rm -f ~/backups-dentaldesk/prod_*.sql
```

**Solo después de que el paso 6 dé idéntico, el sistema puede recibir datos de una clínica ajena.**

⚠️ **Advertencia sobre el paso 5:** `pg_dump` avisa de FKs circulares en `facturas`. Hoy pasa con 5 filas por orden favorable. Con más facturas puede fallar — y el script ahora usa `ON_ERROR_STOP=1`, así que **abortará en vez de reportar verde sobre un restore parcial.**

---

# F · Las 10 pruebas antes de entregar a la primera clínica

Cada una con criterio de fallo explícito.

| | Prueba | Falla si |
|---|---|---|
| 1 | **Dos sesiones, dos clínicas.** Con el token de A, pedir `/api/pacientes/exportar?tenantId=<B>` | Devuelve algo que no sea 403 |
| 2 | Con sesión de A, abrir `/api/facturacion/pdf/<id-de-B>` | Devuelve un PDF en vez de 404 |
| 3 | Con sesión de A, abrir `/api/consentimientos/pdf/<id-de-B>` | Devuelve un PDF en vez de 404 |
| 4 | Con sesión de A, abrir el portal `/paciente/<token-de-B>` | Muestra datos |
| 5 | Como `admin` de A, invitar con `role: "owner"` | No devuelve 403 |
| 6 | **Control N-1** en producción | Devuelve alguna fila |
| 7 | Subir una foto a `fotos_clinicas` con prefijo de otro tenant | La subida se acepta |
| 8 | Borrar un paciente de otra clínica desde la UI | Dice "eliminado" en vez de avisar el fallo |
| 9 | **Restore completo** con conteos comparados | Un solo número difiere |
| 10 | **Mirar la planilla de Google** tras un turno en cada clínica | Aparecen turnos de las dos en la misma hoja |

**La 10 es la que cierra B-1** y es la única que no se puede hacer sin dos clínicas reales.

---

# G · Lo que NO debés afirmar comercialmente

**Estas afirmaciones serían falsas hoy.** No es prudencia excesiva: son verificables, y una clínica que compre por ellas tendría razón en reclamar.

🚫 **"Cada rol ve solo lo que le corresponde"** o cualquier variante sobre acceso diferenciado a datos clínicos.
→ **43 de 47 policies son de pertenencia al tenant.** Una secretaria ve la misma historia clínica que el titular.

🚫 **"Tus datos están respaldados"** / "backup automático" / "recuperación ante desastres".
→ **No existen backups.** Hasta el paso E-6, esta afirmación es falsa sin matices.

🚫 **"Nadie fuera de tu clínica accede a los datos"**.
→ **La cuenta de mantenimiento tiene acceso `admin` completo**, por decisión tuya. Es legítimo, pero hay que declararlo.

🚫 **"Cumple con la normativa de datos de salud"** sin nombrar cuál y sin auditoría externa.
→ No hay evaluación de cumplimiento contra la Ley 25.326 ni ninguna otra.

✅ **Lo que sí podés afirmar, con evidencia:**

- *"Los datos de cada clínica están aislados de los de las demás"* — **65 tests dinámicos contra PostgreSQL real**
- *"Las fotos clínicas se almacenan en un bucket privado con aislamiento por clínica"* — verificado en producción
- *"Los accesos administrativos requieren rol de administrador o propietario"* — 8 rutas + 4 policies
- *"Los errores se monitorean con trazas saneadas de datos personales"* — `sendDefaultPii: false` + tres hooks de saneo

---

# H · Cambios mínimos obligatorios antes del primer cliente

**Cuatro. Nada más.**

**1 · Resolver `sync-sheet`.** Verificar si el webhook está activo. Si lo está, desactivarlo o dar planilla por clínica. **Es el único hallazgo nuevo que puede filtrar datos entre clínicas.**

**2 · Activar backups y verificar el restore.** Sección E completa. **Sin esto no se aceptan datos de terceros.**

**3 · Declarar el acceso de mantenimiento** en la política de privacidad. Una línea.

**4 · Purgar Sentry histórico.** Eventos previos a P0-06 con tokens de paciente e IPs.

**Todo lo demás puede esperar.** Incluido DO-6, mientras no se anuncien los roles.

---

# La respuesta a tu pregunta

> *"Si hoy no puedo pagar Supabase Pro, ¿qué dejo 100% preparado y qué hago el día que tenga los 25 USD?"*

## Hoy, gratis — deja el sistema listo

Los 10 puntos de la sección D. **Unas dos horas.** Con eso el código queda en estado de lanzamiento: aislamiento probado, escalada cerrada, Storage completo, secretos rotados, sin afirmaciones falsas.

**Y podés operar tu propia clínica con normalidad.** Es lo que ya estás haciendo.

## El día que tengas los 25 USD — siete pasos

La sección E, en orden, sin saltear el paso 6.

**El paso 6 es la frontera.** No es "activar Pro" lo que habilita recibir datos de terceros: es **haber restaurado un backup y comprobado que los datos volvieron completos.** Un backup no verificado y ninguno se comportan igual el día que hacen falta.

## La línea que separa un estado del otro

**No es técnica: es de a quién le pertenecen los datos.**

Hoy los 212 pacientes son tuyos y el riesgo es tuyo. **El día que una clínica cargue el primer paciente, estás administrando datos de salud de terceros** — y ahí las reglas cambian, aunque no te paguen.

**Piloto técnico** = tu clínica, tu riesgo, sin backups, con todo lo demás cerrado.
**Lanzamiento real** = clínicas ajenas, backups verificados, acceso declarado, Sentry purgado, `sync-sheet` resuelto.

**Entre los dos estados hay 25 dólares y unas dos horas de trabajo.**
