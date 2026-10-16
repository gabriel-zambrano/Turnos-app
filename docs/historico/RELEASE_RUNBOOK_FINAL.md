# DentalDesk · Runbook final de release

**25/08/2026** · Objetivo: que el día que pagues Supabase Pro solo tengas que ejecutar esto y decidir GO.

---

## ⚠️ Corrección al estado de partida

Tres puntos del estado que pediste tomar como verdad **contradicen la evidencia de producción de hoy**. No puedo auditar sobre premisas falsas: el runbook te haría repetir trabajo ya hecho.

| Premisa | Realidad | Evidencia |
|---|---|---|
| "`logos`: migración escrita, todavía sin aplicar" | **APLICADA** | `db push` → `Finished`. Consulta a `pg_policies` en producción: **8 policies**, incluidas `logos_insert/update/delete_tenant` con `{authenticated}` |
| "R-12: migración escrita, todavía sin aplicar" | **APLICADA**, y eran **9** funciones, no 4 | `R-12: 9 función(es) corregida(s)` · `R-12 OK: 14 funciones SECURITY DEFINER, todas con pg_temp` |
| "No existe ningún `owner`" | **Existe** | `UPDATE … RETURNING` → 1 fila · `a89ed5ae-28e6-48c1-9e8f-51e8c058733b` = `owner` |

**`CRON_SECRET`:** confirmaste que el valor quedó bien. El endpoint devuelve **401 sin credencial**, verificado — está protegido y falla cerrado.

⚠️ **Causa probable de la confusión, y es un hallazgo:** el encabezado de `20260822190000_p0_09_storage_logos_y_privilegios.sql` **sigue diciendo `NO APLICADO`**. El archivo miente sobre su propio estado. Corregirlo es local y sin riesgo.

---

# 1 · Clasificación de todo lo pendiente

## A · BLOQUEA LANZAMIENTO

### ~~A-1 · `sync-sheet`~~ · ✅ **RESUELTO el 25/08**

| | |
|---|---|
| **Riesgo** | Todas las clínicas escriben en **una sola planilla** de Google |
| **Evidencia** | `src/app/api/sync-sheet/route.ts` L75-92: `spreadsheetId: process.env.GOOGLE_SHEET_ID` — constante, sin dimensión de tenant. Exporta `nombre, email, telefono` y **`record.notas`** |
| **Agravante** | `notas` son las anotaciones internas del profesional. `api/paciente/[token]/route.ts` L104 lo dice: *"NO devolvemos el campo `notas`… no deben mostrarse al paciente"* |
| **Impacto** | Fuga cross-tenant **fuera del alcance de RLS**: usa `service_role` y escribe en un tercero |
| **Mitigación** | **NO VERIFICADO si está activo** — depende del Database Webhook en Supabase, que no puedo consultar |
| **Cierre objetivo** | ✅ **CUMPLIDO.** `ALTER TABLE citas DISABLE TRIGGER sync_turnos_to_sheets` · verificado `tgenabled = 'D'` |

**El webhook ESTABA activo** — se confirmó por SQL, no por suposición. Se desactivó el 25/08 tras verificar con el owner que la planilla no se usaba: era de la etapa de armado de la base.

⚠️ **Queda un pendiente que desactivar no resuelve:** la planilla sigue existiendo con la PII ya escrita —212 pacientes y notas clínicas—. **Borrarla o revisar con quién está compartida.** Ver `OPERACION.md` §7.

### A-2 · Backups — bloquea el primer cliente ajeno, no el piloto propio

| | |
|---|---|
| **Riesgo** | RPO infinito. 212 pacientes reales sin recuperación |
| **Evidencia** | *"Free Plan does not include project backups."* Sin PITR |
| **Impacto** | Pérdida irreversible de historia clínica |
| **Mitigación parcial** | `./probar-restore.sh` — RTO 154 s medido. **NO es un backup:** requiere que alguien se acuerde de correrlo |
| **Cierre objetivo** | **Sección 3 completa, con el paso 6 en verde.** Activar Pro no alcanza: hay que haber restaurado y comparado los 6 conteos |

**Distinción que sostiene el veredicto:** con tu clínica, el riesgo es tuyo y podés aceptarlo. **Con datos de un tercero, estás aceptando el riesgo de otro sin decírselo.**

## B · ANTES DEL PRIMER CLIENTE

### B-1 · Los PDFs dependen de una sola capa

**Evidencia:** `api/consentimientos/pdf/[id]` L34 y `api/facturacion/pdf/[id]` L40 hacen `.eq('id', params.id)` **sin filtro de tenant**.

**Verificado que hoy están protegidos:** ambas usan `createClient()` de `@/lib/supabase/server`, que instancia con `NEXT_PUBLIC_SUPABASE_ANON_KEY` + cookies → rol `authenticated` → **RLS aplica**. Las 4 tablas tienen policy de SELECT. `maybeSingle()` + `if (!c) return 404`.

**Riesgo real:** la defensa es de una sola capa y **el código no lo declara**. Un cambio a `supabaseAdmin` —como ya ocurrió en `equipo/miembros/route.ts`— las convierte en IDOR abierto **sin que ningún test falle**.

**Cierre objetivo:** un test que verifique que ninguna de las dos contiene `SERVICE_ROLE_KEY`.

### B-2 · Declarar el acceso de mantenimiento

`studioandbrand@gmail.com` tiene rol `admin` sobre 212 historias clínicas. Decidiste conservarlo. **Sin declararlo en `/legal/privacidad`, una clínica podría descubrirlo por su cuenta.**

**Cierre objetivo:** la política menciona explícitamente el acceso del proveedor para mantenimiento.

### B-3 · Purgar Sentry histórico

Antes de P0-06, `sendDefaultPii: true` y `tracesSampleRate: 1`. Los eventos viejos llevan **tokens de paciente en las URLs e IPs**. Los nuevos están saneados por los tres hooks.

**Cierre objetivo:** cero eventos anteriores a la fecha de P0-06 en el proyecto de Sentry.

### B-4 · Corregir el encabezado `NO APLICADO`

Ya causó una confusión de estado en esta misma auditoría.

## C · DESPUÉS DEL LANZAMIENTO

| | Qué | Por qué puede esperar |
|---|---|---|
| C-1 | Las 13 escrituras de `finanzas` que informan éxito sin mirar el resultado | Molesto, no filtra datos. `load()` refresca después |
| C-2 | Suite IDOR por HTTP · 7 rutas con parámetro en path | La capa de datos tiene 65 tests. El estático no encontró agujeros |
| C-3 | `FORCE RLS` ausente en 43/43 tablas (R-9) | Solo importa si el dueño consulta las tablas, que hoy no ocurre |
| C-4 | Migrar a Next 15/16 | 14.2.35 tiene los CVE de diciembre parcheados |
| C-5 | El export omite la historia clínica | Portabilidad incompleta, no una fuga |
| C-6 | No existe baja de tenant | Necesario cuando alguien se dé de baja |
| C-7 | Edge Function `enviar-recordatorios` sin versionar (R-15) | Funciona. Es riesgo de mantenimiento |
| C-8 | Job 3 de pg_cron, que corre y no hace nada | Verificado: `por_cita = 1.00` durante 9 días. No duplica |
| C-9 | `timingSafeEqual` en `sync-sheet` | Diferencia de nanosegundos bajo ruido de red |
| C-10 | DO-6 multirol | No bloquea si no se anuncian los roles |

## D · FALSOS POSITIVOS — verificados y descartados

| Sospecha | Por qué NO es un problema |
|---|---|
| **`guardas-multitenant` pasaría por vacío** | **Falso.** L83 y L122 usan `expect(archivo).toBeDefined()`: si `FUENTES` estuviera vacío, dos tests fallarían. Mi detector buscaba `toBeGreaterThan` y no vio la otra forma |
| **`/api/sync-sheet` sin autenticación** | **Falso.** L19-22 valida `Bearer ${SYNC_SHEET_SECRET}`. Mi grep buscaba `secret` en minúscula |
| **`anon` con privilegios sobre `storage.objects`** | **No accionable.** El ACL dice `anon=arwdDxtm/supabase_storage_admin`: solo el otorgante puede revocar, y `postgres` no puede asumir ese rol. **Es cómo Supabase entrega todos sus proyectos** |
| **Los 23 SQL sueltos en la raíz** | **Verificados.** Ninguno otorga a `anon` fuera de `tenants_public` |
| **Tests sin assertion** | **Cero.** Barrido sobre los 29 archivos |
| **RLS probado con mocks** | **Falso.** `idor-dinamico`, `tenant-isolation`, `fidelizacion-roles` y `vistas-bi` usan **PGlite: PostgreSQL real** |

---

# 2 · ANTES DE PAGAR — todo lo que se deja listo gratis

**Ninguno toca producción. Unas dos horas.**

| | Acción | Tiempo | Verificación |
|---|---|---|---|
| 1 | ~~Consultar el webhook de `sync-sheet`~~ | — | ✅ **Hecho.** Estaba activo |
| 2 | ~~Desactivarlo~~ | — | ✅ **Hecho.** `tgenabled = 'D'` |
| 3 | Corregir el encabezado `NO APLICADO` | 2 min | `grep -c "NO APLICADO"` = 0 |
| 4 | Test: los PDFs no usan `SERVICE_ROLE_KEY` | 20 min | El test falla si se inyecta `supabaseAdmin` |
| 5 | Declarar el acceso de mantenimiento en privacidad | 10 min | El texto lo menciona |
| 6 | Documentar el job 3 de pg_cron | 5 min | Queda escrito fuera del chat |
| 7 | Commitear la documentación pendiente | 2 min | `git status` limpio |
| 8 | `npm audit` y anotar el estado | 5 min | Registro de la línea de base |
| 9 | Correr `npx supabase db reset` una vez más | 10 min | Llega a `Finished` |
| 10 | Guardar el snapshot de rollback fuera del repo | 5 min | El archivo existe en `~/rollback-dentaldesk/` |

**Los puntos 4 y 9 son los que más valen.** El 9 ya encontró tres errores míos que en producción habrían quedado invisibles.

---

# 3 · EL DÍA QUE PAGUES — secuencia exacta

**No saltear pasos. El 6 es la frontera.**

### Paso 1 · Activar Pro

```
Dashboard → Settings → Billing → Upgrade to Pro
```

### Paso 2 · Activar PITR

```
Dashboard → Settings → Database → Point-in-Time Recovery → Enable
```

Anotar la ventana de retención que ofrezca.

### Paso 3 · Verificar que EXISTE un backup

```
Dashboard → Database → Backups
```

⚠️ **Si esa pantalla está vacía, NO hay backup.** No avanzar. Un plan pago sin backup listado no protege nada.

### Paso 4 · Registrar el RPO real

```sql
SELECT now() AS ahora_utc;
```

Comparar contra el timestamp del backup más reciente. **Esa diferencia es tu RPO máximo.** Anotarla — es el dato que le vas a poder decir a una clínica.

### Paso 5 · Restore de prueba con RTO medido

```bash
cd ~/Turnos-app
open -a Docker
./probar-restore.sh
```

El script cronometra el RTO y usa `ON_ERROR_STOP=1`: **si un solo `INSERT` falla, aborta** en vez de reportar verde sobre un restore parcial.

⚠️ `pg_dump` avisa de FKs circulares en `facturas`. Hoy pasa con 5 filas por orden favorable; con más puede fallar. Si aborta, **ese es el hallazgo** — no un problema del script.

### Paso 6 · Comparar los conteos — LA FRONTERA

En **producción**:

```sql
SELECT 'pacientes' AS tabla, count(*) FROM pacientes
UNION ALL SELECT 'citas',            count(*) FROM citas
UNION ALL SELECT 'facturas',         count(*) FROM facturas
UNION ALL SELECT 'pagos',            count(*) FROM pagos
UNION ALL SELECT 'historial_puntos', count(*) FROM historial_puntos
UNION ALL SELECT 'tenant_users',     count(*) FROM tenant_users
ORDER BY 1;
```

Contra lo que imprimió el script.

⚠️ **Una sola diferencia invalida el restore.** No hay margen: si los números no son idénticos, el backup no está probado.

**Referencia del 25/08:** `citas 623 · facturas 5 · historial_puntos 256 · pacientes 212 · pagos 31 · tenant_users 2`

### Paso 7 · Registrar evidencia y limpiar

Anotar en `P0-05_BITACORA.md`: fecha, RTO medido, RPO, los 6 conteos, y que coincidieron.

```bash
npx supabase stop
rm -f ~/backups-dentaldesk/prod_*.sql
```

⚠️ El dump tiene PII real de 212 pacientes. **Borrarlo.**

---

# 4 · DESPUÉS DE ACTIVAR — verificaciones de producción

| | Check | Verde si |
|---|---|---|
| 1 | Control N-1 de privilegios | **Cero filas** |
| 2 | `SELECT policyname FROM pg_policies WHERE schemaname='storage'` | **8 filas** |
| 3 | `SELECT id, public, file_size_limit FROM storage.buckets` | `fotos_clinicas` privada · límites no nulos |
| 4 | Las 14 `SECURITY DEFINER` con `pg_temp` | 14 de 14 |
| 5 | `SELECT role FROM tenant_users` | Al menos un `owner` |
| 6 | Backups listados en el Dashboard | Al menos uno |
| 7 | Los 12 smoke tests de `RELEASE-CHECKLIST.md` §15 | Todos |

**Control N-1:**

```sql
SELECT c.relname, array_to_string(c.relacl, E'\n') AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m')
  AND array_to_string(c.relacl, ',') LIKE '%anon%'
  AND c.relname <> 'tenants_public';
```

---

# 5 · GO / NO-GO final

**Sin interpretación. Cualquier `NO` es NO-GO.**

```
[ ]  1. npx tsc --noEmit               → 0 errores
[ ]  2. npx vitest run                 → 674+ tests, todos verdes
[ ]  3. npx next build                 → limpio, 50/50 páginas
[ ]  4. Backups listados en el Dashboard de Supabase
[ ]  5. Restore probado y los 6 conteos IDÉNTICOS a producción
[ ]  6. Control N-1                    → cero filas
[ ]  7. 8 policies en el esquema storage
[ ]  8. Al menos un `owner` por tenant
[✓]  9. Webhook de sync-sheet: DESACTIVADO — verificado 25/08
[ ] 10. Acceso de mantenimiento declarado en /legal/privacidad
[ ] 11. Sentry histórico purgado
[ ] 12. Los 12 smoke tests en verde
[ ] 13. Nada sin commitear
[ ] 14. La web no promete permisos diferenciados por rol clínico
```

**14 de 14 = GO.**

---

# 6 · Los seis puntos que pediste revisar

## 6.1 · Backups

**Gratis hoy:** medir RTO (154 s), verificar integridad del restore comparando conteos, probar que el script aborta ante un error.

**Solo con Pro:** backup automático diario · PITR · retención · restauración a un punto en el tiempo · **RPO real** — hoy es infinito por definición.

**El restore manual NO es un backup.** Requiere que una persona se acuerde. La diferencia no es técnica: es que un backup ocurre aunque nadie haga nada.

## 6.2 · R-18 → **MITIGADO**

| Estado | Por qué no |
|---|---|
| **CERRADO** | No. El disparador histórico no es demostrable — la retención de logs del plan Free no llega al 19/08 |
| **ABIERTO** | No. El mecanismo está identificado y desactivado, con guarda que impide la regresión |

**G-5 verificado con prueba negativa.** Inyecté `GRANT ALL ON TABLE "public"."pacientes" TO "anon"` en el baseline:

```
estado actual .............. 0 hallazgos  ✅ limpio
con GRANT inyectado ........ 1 hallazgo   ✅ DETECTA (remote_schema.sql:1953)
```

**Detecta la regresión.** No es un test que pasa por vacío.

**Criterio de cierre:** cuatro semanas consecutivas del control N-1 en cero.

## 6.3 · Storage

**`logos`: aplicada y verificada.** 3 policies con `{authenticated}` y aislamiento por prefijo de tenant, `USING` explícito en UPDATE, límites de 5 MB y tres tipos MIME. **No rompió producción** — las subidas de logo se probaron post-aplicación.

**`fotos_clinicas`: correctamente protegida.** Bucket privado, 4 policies aislando por tenant en las 4 operaciones, límite de 10 MB. **Y desde hoy están versionadas** — hasta esta semana existían solo en producción, así que cualquier entorno reconstruido las levantaba sin aislamiento.

**Evidencia que falta:** ninguna. Ambas verificadas contra `pg_policies` de producción.

## 6.4 · R-12 — aplicada

**14 funciones `SECURITY DEFINER` en `public`. Las 14 con `pg_temp`.**

Antes: 5 lo tenían (`fn_aprobar_asistencia`, `fn_registrar_inasistencia`, `fn_ajustar_puntos_manual`, `fn_canjear_premio`, `tiene_rol`). Las otras **9** se corrigieron.

**La migración es segura por diseño:** usa `ALTER FUNCTION`, que cambia solo esa propiedad. **No copia cuerpos** —`emitir_factura_con_detalle` tiene 17 argumentos— y conserva los triggers asociados.

**Se ejecutó junto con Storage sin problemas.** Retrospectivamente convenía separarlas: cuando Storage falló en el `db reset`, bloqueó la verificación de R-12. **Para futuras migraciones: una preocupación por archivo.**

## 6.5 · `CRON_SECRET` y Sentry

**`CRON_SECRET`:** solo viaja en `Authorization: Bearer` —P0-03 lo sacó de la URL—, se compara con `timingSafeEqual`, y **falla cerrado** si no está configurado. **No aparece en ningún job de pg_cron:** el único valor en claro ahí es `sb_publishable_…`, que es pública por diseño.

**Evidencia de exposición actual: ninguna.**

**Sentry:** los eventos nuevos están saneados (`sendDefaultPii: false`, `tracesSampleRate: 0.1`, tres hooks). **Los históricos previos a P0-06 tienen tokens de paciente e IPs.** Es lo único con PII expuesta hoy, y es gratis de resolver.

## 6.6 · DO-6

**Decisiones pendientes: 6.** Bloquean **2**: la recuperación del último `owner` y qué significa `odontologo`.

**Para lanzar sin multirol, el mínimo ya está hecho:** R-2 cerrado con validación de rol en `invitar`, y existe un `owner`.

**Verificado en el código:** no encontré ninguna promesa comercial de permisos diferenciados. Las páginas legales y de precios no lo mencionan. `equipo/page.tsx` muestra etiquetas —"Propietario", "Administrador", "Staff"— pero **eso describe quién es quién, no qué puede ver cada uno.**

⚠️ **Y no debe cambiar:** hoy `odontologo` y `staff` verían **exactamente lo mismo** que un `admin` en historia clínica, odontograma y fotos. 43 de 47 policies son de pertenencia al tenant.

---

# 7 · Tabla final

| Riesgo | Estado | Evidencia | Acción | Bloquea |
|---|---|---|---|:-:|
| R-1 `anon` en 34 tablas | 🟢 Cerrado | Verificado en producción tras B1.6 | — | No |
| R-2 escalada `admin→owner` | 🟢 Cerrado | 14 tests · validación previa a efecto | — | No |
| R-10 `anon` escribía `tenants` | 🟢 Cerrado | Migración + G-5.2 | — | No |
| R-11 `REVOKE FROM PUBLIC` | 🟢 Cerrado | Verificado en producción | — | No |
| R-12 `search_path` | 🟢 Cerrado | **14/14 con `pg_temp`** | — | No |
| R-13 job roto | 🟢 Cerrado | Eliminado | — | No |
| P0-07 vistas BI | 🟢 Cerrado | REVOKE aplicado | — | No |
| B1.2 / B1.3 / B1.4 / B1.6 | 🟢 Cerrado | Privilegios verificados | — | No |
| IDOR capa de datos | 🟢 Cerrado | **65 tests · PostgreSQL real** | — | No |
| Storage `fotos_clinicas` | 🟢 Cerrado | Privada · 4 policies · versionadas | — | No |
| Storage `logos` | 🟢 Cerrado | **Aplicada** · 8 policies verificadas | — | No |
| Middleware / React #310 / logo | 🟢 Cerrado | Desplegados y verificados | — | No |
| Next 14.2.35 | 🟢 Cerrado | CVE de diciembre parcheados | — | No |
| `CRON_SECRET` | 🟢 Cerrado | 401 sin credencial · header · timing-safe | — | No |
| `owner` en producción | 🟢 Cerrado | `RETURNING` → 1 fila | — | No |
| **R-18** | 🔵 **Mitigado** | Mecanismo neutralizado · **G-5 probado con inyección** | 4 semanas de N-1 | No |
| **`sync-sheet` cross-tenant** | 🟢 **Cerrado** | Trigger desactivado · `tgenabled = D` verificado | Borrar la planilla histórica | No |
| **Backups / PITR** | 🔴 **Abierto** | Free plan · RPO infinito | Sección 3 | **Sí**² |
| PDFs de una sola capa | 🟠 Frágil | `.eq('id')` sin filtro · RLS lo cubre | Test anti-`supabaseAdmin` | No |
| Acceso de mantenimiento | 🟠 Sin declarar | `admin` sobre 212 historias | Privacidad | **Sí**² |
| Sentry histórico | 🟠 Con PII | Previo a P0-06 | Purgar | **Sí**² |
| Autorización clínica por rol | 🟣 No existe | 43/47 de pertenencia | Fase 2 | No³ |
| DO-6 | 🟠 Congelado | 2 decisiones | Decidir | No³ |
| Deuda C-1 a C-10 | 🟡 Diferida | Documentada | Post-piloto | No |

¹ Solo con una segunda clínica. ² Solo con clínicas ajenas. ³ Salvo que se anuncien los roles.

---

# PARA LANZAR — 10 pasos

1. ~~Verificar el webhook de `sync-sheet`~~ ✅ **hecho — desactivado**
2. **Los puntos gratis restantes** de la sección 2
3. **Pagar Supabase Pro** · 25 USD
4. **Activar PITR** y confirmar que el Dashboard lista un backup
5. **Restore de prueba** con RTO medido
6. **Comparar los 6 conteos** — la frontera
7. **Declarar el acceso de mantenimiento** en privacidad
8. **Purgar Sentry histórico**
9. **Los 12 smoke tests**
10. **La checklist de 14 puntos** — 14 de 14 = GO

---

# PARA HACER HOY SIN PAGAR

Los 10 de la sección 2. **Unas dos horas, ninguno toca producción.**

Con eso el código queda en estado de lanzamiento y **podés seguir operando tu propia clínica con normalidad**.

---

# PARA EL DÍA QUE PAGUES

La sección 3, los siete pasos, sin saltear el 6.

**No es "activar Pro" lo que habilita recibir datos de terceros: es haber restaurado un backup y comprobado que los datos volvieron completos.**

---

# NO TOCAR ANTES DEL LANZAMIENTO

| | Por qué |
|---|---|
| **DO-6** | Toca `tenant_users`, del que dependen **43 policies**. Sin las 2 decisiones, se implementa a medias |
| **`FORCE RLS`** | Cambia el comportamiento de todas las consultas del dueño a la vez |
| **Migrar a Next 15/16** | Salto mayor. 14.2.35 tiene los CVE parcheados |
| **Las 43 policies de pertenencia** | Funcionan y están probadas. Tocarlas es riesgo puro |
| **Las 4 policies de `fotos_clinicas`** | Correctas y recién versionadas |
| **`npm audit fix --force`** | Propone Next 16 y rompe la app |
| **Refactorizar las 13 escrituras de `finanzas`** | Son 9 funciones que manejan dinero. Post-piloto, con calma |
| **Borrar el job 3 de pg_cron** | No hace daño y su comando es el último rastro de una Edge Function sin versionar |
| **Regenerar `remote_schema.sql`** | `supabase db dump` **vuelve a traer los 30 GRANT a `anon`**. G-5.3 lo detecta, pero mejor no provocarlo |

---

**Estado del repositorio al cierre:** `tsc` 0 errores · 674 tests en 29 archivos · `next build` limpio · Next 14.2.35 · producción no modificada en esta auditoría.
