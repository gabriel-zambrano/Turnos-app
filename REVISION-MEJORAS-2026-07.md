# Revisión de las mejoras propuestas — verificadas contra el código (27/07/2026)

Retomo dos hilos que habían quedado inconclusos: la **auditoría de 26 mejoras**
del SaaS y el **spec del módulo de fidelización**. Cada punto está verificado
contra el repo real, no contra lo que decían los documentos.

**Marcador: 22 hechos · 2 parciales · 2 abiertos.**

> **Actualización 27/07 — Tandas 1 a 4 aplicadas.** Puntos unificados contra el
> ledger, búsqueda por teléfono, precios reales por plan, feature flags
> derivados del plan, `/precios` pública, agendamiento online del paciente, PWA,
> skeleton loaders, README y arranque del refactor del dashboard.
> Typecheck 0 errores, 179 tests en verde.
>
> El `next build` completo no se pudo correr en el entorno de trabajo (se corta
> por memoria), así que **el primer build real es el de Vercel al pushear**.
>
> ⚠️ **Inconsistencia a resolver:** los Términos y Condiciones dicen que Starter
> es un *plan gratuito*, pero la grilla lo cobra a $16.900. Hay que decidir cuál
> vale y corregir el otro antes de publicar precios.

---

## A. Auditoría de 26 mejoras — estado real

### 🔴 Bloqueadores

| # | Mejora | Estado | Evidencia |
|---|---|---|---|
| 1 | MercadoPago Subscriptions | ✅ Hecho | El checkout cobra el precio del plan elegido (`precioDelPlan`) y el plan viaja al webhook en `external_reference` como `"<tenantId>\|<plan>"`. |
| 2 | Feature flags atados al plan | ✅ Hecho | `featuresDelPlan` / `featureHabilitada` en `planes.ts`. Las columnas `feature_*` pasaron a ser **concesiones manuales que solo suman**, para no revocarle nada a una clínica que ya lo usaba. |
| 3 | Términos y Privacidad con contenido real | ✅ Hecho | 68 y 96 líneas de contenido, ya no placeholders. |
| 4 | Landing pública en `/` | ❌ Abierto | `src/app/page.tsx` son 5 líneas: `redirect('/dashboard')`. La landing de Naxad vive en otro repo. |

### 🟡 Seguridad — cerrada por completo

| # | Mejora | Estado |
|---|---|---|
| 5 | Auth en `/api/recordatorios` y `/api/confirmar-turno` | ✅ Hecho — ambos con `getUser()` y 401 |
| 6 | `equipo/invitar` con `getUser()` | ✅ Hecho |
| 7 | `supabaseAdmin` fuera del middleware | ✅ Hecho |
| 8 | Admin verificado server-side | ✅ Hecho — `lib/admin.ts` con service-role + `/api/admin/me` |
| 9 | Rate limiting en `/api/registro` | ✅ Hecho — 5 intentos / 15 min por IP |

### 🟠 Onboarding

| # | Mejora | Estado | Detalle |
|---|---|---|---|
| 10 | Email de bienvenida post-registro | ✅ Hecho | `api/registro:143`, no bloqueante |
| 11 | Wizard lleva al dashboard | ✅ Hecho | Corrección: el wizard **sí** hace `signInWithPassword` y va a `/dashboard?welcome=true`. `/login?registered=true` es solo el fallback si el auto-login falla. |
| 12 | Checklist de setup inicial | ❌ Abierto | Sin onboarding guiado. El wizard ya manda `?welcome=true` pero **nadie lee ese parámetro**: el gancho está puesto y sin destino. |
| 13 | `.env.example` | ✅ Hecho | 4.7 KB documentados |

### 🔵 UX / gaps vs competencia

| # | Mejora | Estado | Detalle |
|---|---|---|---|
| 14 | Agendamiento online del paciente | ✅ Hecho | `/reserva/[clinica]` pública + APIs de disponibilidad y alta. El turno entra como `pendiente` para que lo confirme el consultorio. |
| 15 | WhatsApp automático | 🟡 Parcial | Infra + cron + on/off por clínica listos. Falta el setup externo de Meta (número, plantillas, credenciales `WHATSAPP_*`). |
| 16 | Botón "💰 Cobrar" al marcar asistencia | ✅ Hecho | `agenda/page.tsx:1443` |
| 17 | Subida de fotos en la ficha | ✅ Hecho | `pacientes/[id]:695` con Supabase Storage |
| 18 | Ver feedback post-visita | ✅ Hecho | `/seguimiento` con filtro dedicado |
| 19 | Búsqueda por teléfono en Command Palette | ✅ Hecho | Filtra por nombre o teléfono (solo dígitos). |

### ⚙️ Deuda técnica

| # | Mejora | Estado | Detalle |
|---|---|---|---|
| 20 | Refactor del dashboard | 🟡 Parcial | De 1095 → **896 líneas**. Extraídos `HeatmapSemanal`, `AccionesRapidas` y `PreparacionManana`. Quedan por sacar los dos modales y el listado de citas. |
| 21 | Skeleton loaders | ✅ Hecho | `SkeletonBox`, `SkeletonKPIs` y `SkeletonLista` en dashboard, agenda, pacientes y ficha |
| 22 | PWA | ✅ Hecho | Manifest, iconos, service worker y pantalla de offline |
| 23 | README | ✅ Hecho | Setup, arquitectura, migraciones, jobs y deploy |

### 💈 Monetización

| # | Mejora | Estado |
|---|---|---|
| 24 | Página `/precios` pública | ✅ Hecho — grilla, FAQ y CTA de prueba, leyendo de `planes.ts` |
| 25 | Trial de 14 días automático | ✅ Hecho — `subscription_status: 'trial'` en el alta |
| 26 | Facturación AFIP/ARCA | ✅ Hecho — en producción con validez fiscal |

---

## B. Módulo de fidelización — el spec v2 SÍ se implementó

Contra lo que sugería el hilo abierto, la migración `supabase_migration_sprint_5_fidelizacion.sql`
está escrita completa y el código la consume:

- **Ledger** `historial_puntos` + `config_fidelizacion` + `premios`, las tres con `tenant_id` y RLS.
- **Las 4 RPC**: `fn_aprobar_asistencia`, `fn_registrar_inasistencia` (resetea racha),
  `fn_canjear_premio`, `fn_ajustar_puntos_manual`.
- **Server actions** en `src/app/actions/fidelizacion.ts`, invocadas desde agenda,
  dashboard y ficha del paciente.
- El bug del enum quedó resuelto: `EstadoCita` ya incluye `'completado'` y `'ausente'`.

### Lo que quedó a medias — y es un bug visible para el paciente

**La lógica vieja de puntos nunca se migró en el portal.** Hoy conviven dos cálculos:

| Dónde | Fórmula | Fuente |
|---|---|---|
| Ficha del doctor | `puntos_saldo_cache` | ledger ✅ |
| Portal del paciente | `puntos + (asistencias × 100)` | columna legacy ❌ |

`paciente/[token]/page.tsx:611` calcula el saldo a mano, y la API
`api/paciente/[token]/route.ts:38,193` ni siquiera devuelve `puntos_saldo_cache`.

**Consecuencia:** el paciente ve un número de puntos distinto al que ve el
odontólogo en la ficha, y distinto al que se descuenta al canjear un premio.
Es el tipo de inconsistencia que genera un reclamo en el mostrador.

Además, `pacientes/[id]/page.tsx:1535` todavía edita la columna legacy `paciente.puntos`
en el modal de edición, lo que puede desincronizar el ledger.

---

## C. Plan de retome propuesto

**Tanda 1 — ✅ aplicada (commit `24e4a13`)**

1. ~~Unificar el saldo de puntos contra el ledger.~~
2. ~~Búsqueda por teléfono en el Command Palette.~~
3. ~~Auto-login del wizard~~ (ya estaba hecho).

**Tanda 2 — ✅ aplicada**

4. ~~Precios reales por plan en el checkout.~~ Starter $16.900 / Pro $29.900 /
   Business $49.900, con Precio Fundador ($12.900 / $24.900 / $39.900) para las
   primeras 20 clínicas.
5. ~~Feature flags derivados del plan.~~ Recordatorios y WhatsApp desde Pro, BI
   en Business, todo habilitado durante el trial.
6. ~~Página `/precios` pública.~~

**Pendiente para cobrar de verdad:** probar el checkout end-to-end con
credenciales reales de MercadoPago, y resolver la contradicción del Starter
gratis en los Términos.

**Tanda 3 — ✅ aplicada**

7. ~~Agendamiento online del paciente.~~ Página pública `/reserva/[clinica]`, con
   los horarios libres calculados de verdad (un turno de 60 min bloquea los tres
   slots que pisa) y revalidación en el servidor al confirmar, por si el horario
   se ocupó mientras el paciente completaba el formulario. El link para
   compartir aparece en Configuración.

   **Reglas aplicadas** (en `lib/reserva.ts`, con 22 tests): **lunes a viernes
   de 8:00 a 20:00** en slots de 20 min, mínimo 2 horas de anticipación, máximo
   60 días a futuro, 5 pedidos por hora por IP.

   **Blanqueamiento = 80 min** (va con limpieza dental), así que el último
   horario que se ofrece para ese tratamiento es 18:40. Hay que correr
   `supabase_migration_duracion_blanqueamiento.sql` para que la tabla
   `tratamientos` coincida con el valor por defecto del sistema.

   ⚠️ El horario está fijo para toda la plataforma. Cuando entre una clínica que
   atienda sábados o en turnos partidos, hay que pasarlo a configuración por
   tenant (tabla `horarios_atencion`).

**Tanda 4 — ✅ aplicada**

8. ~~Skeleton loaders~~ (`SkeletonBox` / `SkeletonKPIs` / `SkeletonLista`, con
   respeto por `prefers-reduced-motion`).
9. ~~PWA~~: manifest, iconos, service worker y pantalla de offline. El SW
   **no cachea `/api/`, `/paciente/` ni `/firmar/`**, porque son rutas con datos
   de salud.
10. ~~README~~ con setup, arquitectura, migraciones, jobs y deploy.
11. Refactor del dashboard: **parcial**. De 1095 a 896 líneas, con
    `HeatmapSemanal`, `AccionesRapidas` y `PreparacionManana` extraídos. Faltan
    los dos modales (nuevo paciente, registrar cobro) y el listado de citas.

**Lo que queda abierto de toda la auditoría:** la landing pública en `/` (vive
en otro repo) y el setup externo de Meta para WhatsApp.

---

## D. Pendientes ajenos a estos dos hilos (recordatorio)

- Correr en Supabase: `supabase_migration_recall.sql`,
  `supabase_migration_crm_automatizacion.sql`, `supabase_migration_cuidados.sql`,
  `supabase_migration_duracion_blanqueamiento.sql`.
- 3 decisiones marcadas **PENDIENTE** en `DECISIONES-PRODUCTO.md`: alta de
  clínicas por dos caminos, acceso del operador a datos de pacientes, tokens
  del portal sin expiración.
