# DentalDesk · Release Checklist

**22/08/2026 · Estado: READY FOR PAID ACTIVATION — con 3 bloqueantes**

Todo lo afirmado acá está verificado contra el código de hoy, no contra documentación previa. Lo no verificable está marcado.

---

## 1 · Estado actual

| | Verificación | Resultado |
|---|---|---|
| 🟢 | `npx tsc --noEmit` | **0 errores** |
| 🟢 | Suite | **552 tests · 26 archivos · todos verdes** |
| 🟢 | `next build` | **Limpio. 50/50 páginas** |
| 🟢 | Migraciones | 27 archivos · historial sincronizado |
| 🟢 | RLS | **23/23 tablas del baseline con RLS activo** |
| 🟢 | `anon` contenido | B1.6 aplicado · esquema `storage` **pendiente** |
| 🟢 | B1.2 / B1.3 | Aplicados y privilegios verificados |
| 🟢 | B1.4 | Falso éxito del borrado corregido |
| 🟢 | G-1 / G-2 / G-4 / **G-5** | Guardas estáticas en verde |
| 🟢 | MercadoPago | HMAC-SHA256 + `timingSafeEqual` ✓ |
| 🟢 | Secretos | `.env.local` y `.env.sentry-build-plugin` fuera de git |
| 🟢 | Fidelización | Apagada por flag, datos intactos |
| 🟡 | Storage | Diagnosticado · migración escrita, **sin probar** |
| 🟡 | DO-6 | Diseñado y auditado, **no implementado** |
| 🟡 | IDOR dinámico | Estático sin agujeros · dinámico no existe |
| 🟡 | R-12 · `search_path` | **8 funciones `SECURITY DEFINER` sin `search_path`** |
| 🔴 | R-18 | **Mecanismo identificado y neutralizado. Disparador desconocido** |
| 🔴 | Backups / PITR | **No existen. RPO infinito** |
| 🔴 | `owner` en producción | **No hay ninguno.** 2 usuarios, ambos `admin` |

---

## 2 · Bloqueantes

### 🔴 B-1 · No existen backups automáticos

212 pacientes reales. Sin PITR, sin snapshots. **Si la base se corrompe, no hay a dónde volver.**

Único mitigante actual: dump manual verificado, **RTO 154s**. No es un backup: es un ejercicio.

**Bloqueado por dinero.** Ver §5 y §6.

### 🔴 B-2 · No hay ningún `owner`

Verificado: los 2 usuarios de producción son ambos `admin`. Bajo DO-6, migrar tal cual deja la clínica **sin propietario**, y con DO-6.2 nadie podrá crear uno.

**Bloqueado por acceso a producción** + decisión del owner. Ver §11.

### 🔴 B-3 · R-18 · disparador no identificado

El **mecanismo** se encontró y se desactivó hoy (§9). Lo que sigue sin saberse es **qué invocación** lo disparó el 20/08 y el 22/08. Mientras no se sepa, no hay certeza de que no exista una segunda vía.

**Bloqueado por acceso a producción** — Logs → Postgres. Ver §9.

---

## 3 · Pendientes gratuitos — se cierran sin pagar ni tocar producción

| | Tarea | Esfuerzo | Estado |
|---|---|---|---|
| G-a | ~~Neutralizar los GRANT a `anon` del baseline~~ | — | ✅ **Hecho hoy** |
| G-b | ~~Guarda G-5 contra la reintroducción~~ | — | ✅ **Hecho hoy** |
| G-c | Probar la migración de Storage con `db reset` | 10 min | ⬜ Necesita Docker |
| G-d | **R-12** · `SET search_path` en 8 funciones `SECURITY DEFINER` | 1 h | ⬜ Migración nueva |
| G-e | Validar el rol en `/api/equipo/invitar` (cierra R-2 sin DO-6 completo) | 30 min | ⬜ Requiere autorización |
| G-f | Corregir la guarda del "último responsable" en `equipo/miembros` | 20 min | ⬜ Requiere autorización |
| G-g | Quitar "SVG" del texto de subida de logo | 2 min | ⬜ Requiere autorización |
| G-h | Suite IDOR dinámica sobre las rutas API | 3 h | ⬜ |
| G-i | Tests de roles DO-6 preparados (rojos hasta implementar) | 2 h | ⬜ Depende de §11 |
| G-j | Commit de todo el trabajo local | 10 min | ⬜ **Requiere tu autorización** |

**G-d es el de mejor relación riesgo/tiempo de los que quedan.** Ver §3.1.

### 3.1 · R-12 · Seis funciones con `search_path` **sin `pg_temp`**

⚠️ **Corrección de este documento.** Una versión anterior decía *"8 funciones sin `search_path`"*. **Era falso, y la causa fue mía:** mi detector buscaba `SET search_path` y el dump escribe `SET "search_path"` con comillas. Las funciones sí lo declaran.

Lo real, verificado sobre el texto crudo y tomando **la última definición** de cada función:

```
crear_tenant · fn_aprobar_asistencia · fn_registrar_inasistencia
get_tenant_admin_email · get_user_email · sync_turno_to_cita
```

Las seis declaran `SET "search_path" TO 'public'` — **sin `pg_temp`**.

`fn_ajustar_puntos_manual` y `fn_canjear_premio` **ya están corregidas**: la migración `20260822130000` las recreó con `'public', 'pg_temp'`. `tiene_rol` también.

**Por qué importa que falte `pg_temp`.** Cuando `pg_temp` no está declarado explícitamente, PostgreSQL lo busca de forma **implícita y primero** para nombres de relación. Un usuario con privilegio `TEMP` —que `anon` y `authenticated` tienen por defecto— puede crear `pg_temp.pacientes` y una función `SECURITY DEFINER` resolvería contra esa tabla en lugar de la real, ejecutándose con los privilegios del dueño.

**La corrección invierte eso:** declarar `pg_temp` **al final** lo mueve de implícito-primero a explícito-último. No cambia la resolución de ningún objeto legítimo, porque `public` se busca antes.

---

## 4 · Pendientes que requieren producción

| | Tarea | Por qué no se puede local |
|---|---|---|
| P-1 | **Conteos de producción** para validar el restore | Los datos solo están ahí |
| P-2 | **R-18** · Logs → Postgres | Los logs no se replican |
| P-3 | Aplicar la migración de Storage | Modifica producción |
| P-4 | Promover un `admin` a `owner` | Datos de producción |
| P-5 | Rotar `CRON_SECRET` + redeploy | Variables de entorno |
| P-6 | Purgar Sentry histórico | Servicio externo |
| P-7 | Las 3 verificaciones manuales | Requieren la app corriendo |
| P-8 | Ejercitar los 4 roles en staging | Necesita usuarios reales |

---

## 5 · Pendientes que requieren dinero

**Solo uno: Supabase Pro — 25 USD/mes.**

Desbloquea: backups diarios automáticos · PITR · retención de 7 días · logs con más retención (ayuda a §9).

**No hace falta nada más.** Vercel Hobby alcanza para el piloto; los 3 crons de `vercel.json` entran en el plan gratuito.

---

## 6 · Comandos exactos al activar Backups Pro / PITR

### 6.1 · Activar

```
Dashboard → Settings → Billing → Upgrade to Pro
Dashboard → Settings → Database → Point-in-Time Recovery → Enable
```

Anotar la ventana de retención que ofrezca.

### 6.2 · Verificar que el backup automático existe

```
Dashboard → Database → Backups
```

Debe listar al menos un backup diario. **Un backup que no aparece en esa pantalla no existe.**

### 6.3 · Probar el restore

```bash
cd ~/Turnos-app
open -a Docker
# esperar a que el ícono deje de animarse
./probar-restore.sh
```

El script ahora usa `ON_ERROR_STOP=1`: si un solo `INSERT` falla, **aborta y avisa** en vez de imprimir conteos verdes sobre un restore parcial.

Al terminar:

```bash
npx supabase stop
rm -f ~/backups-dentaldesk/prod_*.sql
```

⚠️ El dump contiene PII real de 212 pacientes.

---

## 7 · Comandos para validar el restore

El script imprime los conteos de la base restaurada. Hay que compararlos contra producción.

**Última corrida (22/08) — base restaurada:**

```
citas 623 · facturas 5 · historial_puntos 256 · pacientes 212 · pagos 31 · tenant_users 2
```

⚠️ **`pg_dump` avisa de FKs circulares en `facturas`.** Hoy pasa con 5 filas por orden favorable de inserción. Con más facturas puede fallar. Con `ON_ERROR_STOP=1` al menos te vas a enterar.

---

## 8 · Conteos de producción necesarios

**SQL Editor → "No limit":**

```sql
SELECT 'pacientes' AS tabla, count(*) FROM pacientes
UNION ALL SELECT 'citas',            count(*) FROM citas
UNION ALL SELECT 'facturas',         count(*) FROM facturas
UNION ALL SELECT 'pagos',            count(*) FROM pagos
UNION ALL SELECT 'historial_puntos', count(*) FROM historial_puntos
UNION ALL SELECT 'tenant_users',     count(*) FROM tenant_users
ORDER BY 1;
```

**Criterio:** los 6 números deben coincidir **exactamente** con §7. Una sola diferencia invalida el restore.

---

## 9 · R-18 · Procedimiento de investigación

### 9.1 · Lo que ya se sabe — hallazgo del 22/08

**El mecanismo estaba en el repositorio.**

`supabase/migrations/20260722120000_remote_schema.sql` contenía **30 sentencias `GRANT ... ON TABLE ... TO "anon"`** sobre 30 tablas: `pacientes`, `historial_dental`, `paciente_fotos`, `tenant_users`, `tenants`, las 6 vistas `bi_*` y más. Es exactamente el estado que B1.6 revocó.

Además otorgaba **`ALL` sobre `tenants_public`**, que es literalmente R-10.

El archivo usa `CREATE TABLE IF NOT EXISTS` y `CREATE OR REPLACE VIEW`: **re-ejecutarlo no produce ningún error.** Cualquiera de estos lo re-aplica en silencio:

- `supabase db reset --linked`
- `supabase db push --include-all`
- Reparar el historial con `supabase migration repair`
- Pegar el archivo en el SQL Editor

Las guardas G-1/G-2 **excluían ese archivo a propósito** (`DUMP_INICIAL`), así que nunca lo miraron.

**Acciones tomadas hoy:** 30 GRANT comentados · `tenants_public` acotado a `SELECT` · secuencia de `whatsapp_contactos` comentada · guarda **G-5** creada (5 tests) que falla si vuelven.

### 9.2 · Lo que falta — requiere producción

Saber **qué invocación** lo disparó el 20/08 y el 22/08.

```
Dashboard → Logs → Postgres Logs
Rango: últimos 7 días
Buscar: GRANT
Después:  bi_citas_por_dia
```

`log_statement = 'ddl'` está activo y PostgreSQL clasifica `GRANT` como DDL: **las sentencias están registradas.**

**Lo único que decide es la columna `user_name`:**

| Valor | Conclusión |
|---|---|
| `postgres` | Se re-aplicó el baseline desde el editor o el CLI. **Hipótesis principal — ya neutralizada** |
| `supabase_admin` | La plataforma lo emite. Vía adicional, sigue abierta |
| Otro | Dato nuevo |

**Si no aparece ningún `GRANT`:** el silencio también informa — significa que la reversión no pasó por una sentencia SQL registrada, y hay que replantear.

### 9.3 · Control de detección — correr semanalmente

```sql
SELECT c.relname, c.relkind, array_to_string(c.relacl, E'\n') AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r','v','m')
  AND array_to_string(c.relacl, ',') LIKE '%anon%'
  AND c.relname <> 'tenants_public';
```

**Cero filas = sano.** Cualquier fila = R-18 reincidió.

---

## 10 · Storage · Procedimiento de migración

**Diagnóstico (verificado en producción el 22/08):**

| | Hallazgo | Estado |
|---|---|---|
| ✅ | `fotos_clinicas` es **privada** | Correcto |
| ✅ | Sus 4 policies aíslan por tenant en las 4 operaciones | Correcto |
| ✅ | RLS activo sobre `storage.objects` | Correcto |
| 🔴 | `logos` **sin aislamiento por tenant** | Activo — cualquier clínica borra el logo de otra |
| 🔴 | Ningún bucket limita MIME ni tamaño | Activo — se puede subir SVG con `<script>` a un bucket público |
| 🟡 | Policy `Logos update` **sin `USING`** | Latente |
| 🟡 | `anon` con DELETE/UPDATE/TRUNCATE sobre `storage` | Latente |

**Latente** = `storage` **no** está expuesto en PostgREST. Verificado: HTTP **406** con `Accept-Profile: storage`.

### Procedimiento

```bash
# 1 · Probar en local — OBLIGATORIO
cd ~/Turnos-app && open -a Docker && npx supabase db reset

# 2 · Solo si el reset pasa
npx supabase db push
```

⚠️ **Puede fallar con `must be owner of table objects`.** `storage.objects` pertenece a `supabase_storage_admin`. **No forzar:** usar Dashboard → Storage → Policies, que corre con el rol correcto.

**Verificación posterior — las 5 del pie del archivo.** Las que importan: **ver una foto ya cargada** y **abrir el portal sin sesión**, porque detectan un aislamiento demasiado estricto.

---

## 11 · DO-6 · Decisiones pendientes

**Dictamen de la auditoría: el diseño NO está listo para implementar.** Dos defectos bloquean.

| | Decisión | Bloquea |
|---|---|---|
| **1** | 🔴 **Vía de recuperación del último owner.** DO-6.2 impide crear `owner` salvo por transferencia, y la transferencia exige ser owner. Si el único owner se pierde, la clínica queda sin dueño **para siempre**. Propuesta: excepción de plataforma vía `admin_users` | **GO** |
| **2** | 🔴 **Cuál de los 2 `admin` pasa a `owner`.** Hoy no hay ninguno; migrar sin resolverlo produce una clínica sin propietario | **M-2b** |
| 3 | ¿`tenant_users_user_id_fkey` también a `RESTRICT`? Hoy es `CASCADE` y quedaría como código muerto | M-2 |
| 4 | ¿Marca de transacción o tabla de transferencias? La marca es un bypass de I-3 | M-4 |
| 5 | ¿`odontologo` puede otorgar `staff`? Con `>` estricto, sí | M-4 |

**Se puede cerrar R-2 sin implementar DO-6 completo:** validar el rol en `/api/equipo/invitar` contra una lista blanca (G-e). 30 minutos, y hoy un `admin` puede invitar a alguien como `owner`.

⚠️ **`odontologo` y `staff` verán exactamente lo mismo que `admin`** en pacientes, historia clínica y fotos: las 43 policies de pertenencia no distinguen rol. DO-6 mejora el control **administrativo**, no el clínico. Decirlo de otro modo ante una clínica sería falso.

---

## 12 · IDOR · Pruebas pendientes

**Estático:** hecho, sin agujeros. Las 8 rutas con verificación de rol comprueban `tenant_users` contra el `tenantId` pedido. `/api/equipo/invitar` **ya valida** que quien invita pertenezca a esa clínica.

**Dinámico:** no existe. Falta probar con requests reales cruzando tenants:

- Token de clínica A pidiendo `/api/pacientes/exportar?tenantId=<B>`
- `/api/paciente/[token]` con un token de otra clínica
- `/api/facturacion/pdf/[id]` con un id ajeno
- `/api/consentimientos/firmar/[token]` reusado
- `/api/equipo/miembros` DELETE sobre un usuario de otra clínica

**Requiere dos tenants con datos** — se puede montar en local con `db reset` + seed. No necesita producción.

---

## 13 · Roles · Pruebas pendientes

**Ninguna se puede correr todavía: DO-6 no está implementado.**

Al implementarlo, los 18 tests obligatorios están en `P0-10_MULTIROL_FINAL.md` §14. Los críticos:

- **T-7** · `tiene_rol` no acepta `p_user_id` — se verifica sobre `pg_proc.proargnames`
- **T-14** · la caché derivada `tenant_users.role` se mantiene sincronizada
- **T-9/T-11** · los 28 tests de `fidelizacion-roles.test.ts` pasan **sin modificarse**

**Y en staging:** un usuario real por rol, recorriendo la matriz de §4 de ese documento a mano.

---

## 14 · Checklist de deploy

```bash
# 1 · Todo verde en local
cd ~/Turnos-app
npx tsc --noEmit                 # 0 errores
npx vitest run                   # 552/552
npx next build                   # 50/50 páginas

# 2 · Migraciones sincronizadas
npx supabase migration list      # sin pendientes inesperadas

# 3 · Commit  ← requiere tu autorización
git add -A && git commit -m "..."

# 4 · Push → Vercel despliega solo
git push origin main
```

**Antes del push, confirmar en Vercel → Settings → Environment Variables:**

`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `CRON_SECRET` *(rotado)* · `MP_WEBHOOK_SECRET` · `ARCA_*` · `SENTRY_*`

---

## 15 · Smoke tests post-deploy

Doce minutos. En este orden, porque van de lo barato a lo caro de revertir:

| | Prueba | Verde si |
|---|---|---|
| 1 | Login | Entra al dashboard |
| 2 | Abrir la agenda | Carga los turnos |
| 3 | Crear un turno de prueba | Aparece en la agenda |
| 4 | Abrir una ficha de paciente | Carga · pestaña **"💰 Cobros y Visitas"** · **sin rastro de puntos** |
| 5 | **Marcar asistencia con cobro** | Registra el pago, respeta forma de pago y "Facturar" |
| 6 | Ver una foto clínica | Se muestra |
| 7 | Subir una foto | Sube y se ve |
| 8 | Portal del paciente con token real | Carga · logo visible · **sin tarjeta de puntos** |
| 9 | Borrar un paciente de prueba | Borra de verdad, o **avisa que falló** |
| 10 | Exportar datos | Descarga el `.xlsx` |
| 11 | Emitir una factura simulada | CAE ficticio, marcada como simulada |
| 12 | Control N-1 de §9.3 | **Cero filas** |

**5, 9 y 12 son las que no se pueden saltear.** La 5 es donde entra la plata; la 9 estrena B1.4; la 12 confirma que el deploy no revirtió privilegios.

---

## 16 · Criterio GO

**Todas, sin excepción:**

1. `tsc` 0 · suite 552/552 · `next build` limpio
2. **Backups Pro + PITR activos**, con al menos un backup en Database → Backups
3. **Restore probado** post-activación, con los 6 conteos **idénticos** a producción
4. **R-18** · logs revisados y disparador identificado, **o** dos semanas del control N-1 en cero tras la neutralización
5. **Migración de Storage** aplicada y sus 5 verificaciones manuales en verde
6. **Existe al menos un `owner`** en cada tenant
7. **R-2 cerrado** — al menos por validación de rol en `invitar` (G-e)
8. `CRON_SECRET` rotado y desplegado
9. Los 12 smoke tests en verde
10. Todo commiteado y con tag

**DO-6 completo NO es criterio de GO** si el piloto son clínicas donde todos son `admin` — pero entonces los 4 roles **no se anuncian como funcionalidad**.

---

## 17 · Criterio NO-GO

**Cualquiera de estas y no se lanza:**

| | Condición |
|---|---|
| 1 | No hay backups automáticos verificados en el Dashboard |
| 2 | El restore post-activación no reprodujo los conteos exactos |
| 3 | El control N-1 devuelve alguna fila |
| 4 | `tsc`, la suite o el build en rojo |
| 5 | Algún tenant sin `owner` |
| 6 | Storage: `fotos_clinicas` figura como `public = true` |
| 7 | Un smoke test crítico (5, 9 o 12) falla |
| 8 | Se implementó DO-6 sin resolver la recuperación del último owner |
| 9 | Hay trabajo sin commitear al momento del deploy |

---

## 18 · Rollback

| Escenario | Acción | Pérdida |
|---|---|---|
| Deploy roto | Vercel → Deployments → **Promote to Production** en el anterior | Ninguna |
| Migración de Storage rompe las subidas | `DROP POLICY` de las 3 `logos_*_tenant` + recrear las originales de `P0-09_STORAGE_LECTURA.sql` (S-3, 22/08) | Ninguna |
| B1.2/B1.3 rompen fidelización | `CREATE OR REPLACE` con los cuerpos de `remote_schema.sql` | Ninguna |
| Fidelización debe volver | `FIDELIZACION_HABILITADA = true` | Ninguna |
| B1.4 molesta | Quitar `.select('id')` y el bloque de cero filas | Ninguna |
| Neutralización del baseline | `git checkout supabase/migrations/20260722120000_remote_schema.sql` | Ninguna |
| **Corrupción de datos** | **PITR** al instante previo | Lo posterior al punto elegido |

**Último renglón:** hoy ese rollback **no existe**. Es la razón por la que B-1 es el bloqueante número uno.

---

## Qué falta para lanzar

```
🟢 Código · tests · build · migraciones · RLS · B1.2/B1.3 · B1.4 · G-1/2/4/5 · docs
🟢 anon contenido en `public`  ·  R-18 mecanismo neutralizado
🟡 Storage — migración escrita, sin probar ni aplicar
🟡 R-12 — 6 funciones sin search_path
🟡 DO-6 — auditado, 2 decisiones bloqueantes
🟡 IDOR dinámico — montable en local
🔴 R-18 — disparador desconocido (necesita Logs)
🔴 Backups / PITR — necesita 25 USD/mes
🔴 Ningún `owner` en producción
🔴 Verificaciones manuales y smoke tests
```

**Camino más corto a GO-LIVE:**

1. Probar y aplicar Storage *(gratis, local + un push)*
2. R-12 en 6 funciones *(gratis)*
3. Validar rol en `invitar` — cierra R-2 *(gratis)*
4. Mirar los logs de R-18 *(gratis, producción)*
5. Promover un `admin` a `owner` *(gratis, producción)*
6. Rotar `CRON_SECRET` *(gratis)*
7. Commit + tag *(gratis)*
8. **Pagar Pro, activar PITR, probar restore** ← único paso con costo
9. Deploy + 12 smoke tests
10. GO
