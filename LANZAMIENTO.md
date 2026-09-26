# DentalDesk · Runbook de lanzamiento

**26/08/2026** · Este es el documento operativo. Si hay contradicción con cualquier otro `.md` del repo, **manda este**.

Los demás son el registro de cómo llegamos acá. Sirven para entender una decisión vieja, no para operar.

---

# 1 · Estado en una pantalla

| | |
|---|---|
| **Decisión de release** | 🔴 **NO-GO** |
| **Qué bloquea** | Recuperabilidad. Nada más |
| **Seguridad / aislamiento** | 🟢 Verificado dinámicamente |
| **Código** | 686 tests · `tsc` limpio · build limpio · Next 14.2.35 |
| **Producción** | Estable desde el 24/08 |

**Para tu propio consultorio** el riesgo de backups lo asumís vos y podés decidir correrlo.
**Para una clínica ajena** el riesgo no es tuyo. Esa es toda la diferencia.

---

# 2 · Lo que falta

## 🔴 Bloqueante — recuperabilidad

- [ ] **1.** Supabase Pro + PITR · **25 USD/mes** · el único gasto
- [ ] **2.** Restore a proyecto nuevo **desde el backup automático**, no desde un dump manual
- [ ] **3.** `./probar-restore.sh` en verde — ahora compara todas las tablas solo
- [ ] **4.** Decidir qué pasa con `auth.users` (ver §4.3)
- [ ] **5.** `./respaldar-storage.sh`
- [ ] **6.** `./verificar-respaldo-storage.sh` — **abrir la foto recuperada**

**El gate cierra en el 6, no en el 1.** Pagar no recupera nada; recuperar sí.

## 🟠 Antes del primer cliente externo

- [ ] **7.** Borrar `TURNOS-2026` de Drive — requiere `odbenegaswalter@gmail.com` · ver `PURGA_PII_HISTORICA.md`
- [ ] **8.** Purgar Sentry histórico — borrar y recrear el proyecto · ídem
- [x] **9.** ~~Corregir `/legal/privacidad`~~ · hecho 26/08
- [ ] **10.** `npm audit fix` + actualizar `resend`

## 🟠 Producto — lo que le falta al sistema, no a la auditoría

- [ ] **11.** **Completar el export.** Hoy entrega `pacientes`, `citas` y `facturas`. **Faltan `historial_dental`, `paciente_fotos`, `presupuestos`, `consentimientos_firmados`, `pagos` y `tratamientos`** — la mayor parte de la historia clínica. Ver §6.1
- [ ] **12.** **Crear un segundo tenant en producción y usarlo un día entero.** Nunca hubo dos clínicas simultáneas. El aislamiento está probado en la base; el camino operativo no
- [ ] **13.** **Cobrar una suscripción real de punta a punta**, incluido el día 15 del trial
- [ ] **14.** DO-6 · dos decisiones bloqueadas: recuperación del último `owner`, y qué significa `odontologo`

## 🟡 Post-lanzamiento

Autorización clínica por rol · filtro de tenant en los PDFs `[id]` · cerrar R-18 (4 semanas del control N-1 en cero) · borrar la ruta `sync-sheet` y sus credenciales · el `DEFAULT_TENANT_ID` de fallback en `send-recordatorios:92`.

---

# 3 · Comandos

```bash
# Antes de cada release
npm audit                      # sin --force
npm test                       # 686, todos verdes
npx tsc --noEmit
npm run build

# Antes de cada db push
npx supabase db reset          # obligatorio · el 25/08 encontró 3 defectos reales

# Recuperabilidad
./probar-restore.sh                              # base · RTO medido
./respaldar-storage.sh                           # fotos y logos · cifrado
./verificar-respaldo-storage.sh <archivo.gpg>    # el que cierra el gate
```

## 3.1 · npm audit fix

```bash
npm audit fix                  # NUNCA --force: rompe Next
npm install resend@latest      # arrastra svix, que valida firmas de webhook
npm test && npx tsc --noEmit && npm run build
```

**Ninguna vulnerabilidad actual es bloqueante.** La única `critical` es `vitest`, que no se despliega. La de mayor alcance real es `xlsx`, y solo se dispara al abrir un archivo que el propio usuario eligió, en su propio navegador.

---

# 4 · Recuperabilidad — lo que hay que entender antes de confiar

## 4.1 · PITR no cubre Storage

Los backups de Supabase se construyen sobre snapshots físicos del directorio de Postgres más el WAL. **Los archivos viven en S3, fuera de ese alcance.**

**El modo de falla es traicionero.** Un restore devuelve las filas de `paciente_fotos` intactas: la ficha lista sus radiografías y fotos de evolución. **Ninguna imagen carga.** El restore informa éxito sobre una pérdida silenciosa de documentación clínica.

Por eso `respaldar-storage.sh` existe aparte y no es opcional.

## 4.2 · Un backup sin restaurar es una hipótesis

`respaldar-storage.sh` verifica que lo descargado coincida con lo remoto — eso confirma **la descarga**.
`verificar-respaldo-storage.sh` descifra, valida cabeceras de imagen y copia una foto al Escritorio.

**Abrila.** Ese es el único momento en que el respaldo pasa de hipótesis a hecho.

## 4.3 · `auth.users` no está en el dump

`supabase db dump` excluye los esquemas gestionados. Un restore hoy devuelve **212 pacientes y cero cuentas con las cuales entrar**: `tenant_users` apuntaría a `user_id` inexistentes.

**Con Pro, verificá si el backup automático sí los trae.** Si no, hace falta un procedimiento de re-invitación **definido antes de necesitarlo**.

---

# 5 · Operación diaria

## 5.1 · Recordatorios

Salen por **Vercel Cron → `/api/cron` → `/api/send-recordatorios`**, entre las **8 y las 9 de la mañana** hora argentina. No a las 8 en punto: los crons del plan Hobby son "best effort" y se observaron a las 11:17 y 11:59 UTC.

⚠️ **El job 3 de pg_cron corre todos los días y no escribe nada. NO LO REPARES.** Invoca una Edge Function que no está en el repo. Si alguien lo "arregla", **cada paciente recibe dos recordatorios**. Detalle en `OPERACION.md` §1.

## 5.2 · Control N-1 · semanal y post-deploy

```sql
SELECT c.relname, array_to_string(c.relacl, E'\n') AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m')
  AND array_to_string(c.relacl, ',') LIKE '%anon%'
  AND c.relname <> 'tenants_public';
```

**Cero filas = sano.** Cualquier fila significa que R-18 reincidió. Anotar cada corrida en `P0-05_BITACORA.md`.

## 5.3 · Cuentas con acceso

| Email | Rol | |
|---|---|---|
| `odbenegaswalter@gmail.com` | **owner** | El titular |
| `studioandbrand@gmail.com` | admin | **Mantenimiento del proveedor** |

La cuenta de mantenimiento **aparece listada en la pantalla de Equipo**. Eso es transparencia deliberada y **no debe ocultarse**: esconder la cuenta de soporte empeora la situación. Declarada en `/legal/privacidad` §6 desde el 26/08.

## 5.4 · Reglas que no se negocian

- `npx supabase db reset` **antes de cada `db push`**
- Una preocupación por migración
- **No regenerar `remote_schema.sql` con `supabase db dump`** — vuelve a traer los 30 `GRANT` a `anon` de R-18
- Snapshot de rollback nuevo antes de cada `db push`

---

# 6 · Lo que no se puede afirmar

🚫 **"Permisos diferenciados por odontólogo / secretaría"** — 43 de 47 policies son de pertenencia. Una secretaria ve la misma historia clínica que el titular.

🚫 **"Backup automático"** — hasta completar §2.6.

🚫 **"Cifrado de extremo a extremo"** — es TLS en tránsito. E2E significa que el servidor no puede leer los datos; el tuyo los lee.

🚫 **"Exportación completa de la historia clínica"** — el export omite odontograma, fotos, consentimientos y pagos.

## Sí se puede afirmar, con evidencia

✅ *"Los datos de cada clínica están aislados de los de las demás"* — 65 tests dinámicos contra PostgreSQL real, cuatro operaciones, dos tenants.
✅ *"Las fotos clínicas se guardan en un repositorio privado con aislamiento por clínica"* — verificado en producción.
✅ *"Los consentimientos registran hash SHA-256 e IP de firma."*
✅ *"Los enlaces de paciente usan identificadores de alta entropía"* — UUID v4.

---

# 7 · Ante un incidente

| Síntoma | Primero |
|---|---|
| 504 / timeouts | Vercel → Logs → ¿`MIDDLEWARE_INVOCATION_TIMEOUT`? · `src/middleware.ts` y el matcher |
| Datos de otra clínica visibles | **Cortar el acceso.** `npm test -- idor-dinamico` · control N-1 |
| `anon` con privilegios | Control N-1 · `~/rollback-dentaldesk/` |
| Pérdida de datos | `./probar-restore.sh` — pero **primero** leé §4, sobre todo qué NO recupera |
| Recordatorios duplicados | ¿Alguien "arregló" el job 3 de pg_cron? Ver §5.1 |

**Rollback:** `~/rollback-dentaldesk/` — **fuera del repo a propósito.** Commiteado, invita a que alguien lo aplique meses después cuando ya no describe nada.

---

# 8 · Qué documento leer

| Necesito | Documento |
|---|---|
| Operar, lanzar, responder a un incidente | **este** |
| Detalle de una decisión operativa | `OPERACION.md` |
| Evidencia del último gate | `RELEASE_GATE_FINAL.md` |
| Purgar Sentry y Drive | `PURGA_PII_HISTORICA.md` |
| Cobros / facturación | `RUNBOOK-COBROS.md` · `RUNBOOK-ARCA.md` |
| Decisiones de multirol pendientes | `DO-6_DECISIONES_PENDIENTES.md` |

**Los otros ~48 `.md` son histórico.**

⚠️ **Y son una fuente activa de error.** Tres veces durante esta auditoría volvieron premisas ya refutadas por evidencia de producción —"no existe owner", "las policies de logos no se aplicaron"— porque siguen escritas como presente en documentos viejos.

**Recomendación: mover todo lo que no está en esta tabla a `docs/historico/`.** Nada se pierde, git lo conserva, y deja de contradecir al presente.
