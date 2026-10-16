# Release Readiness — DentalDesk

**Fecha:** 21/08/2026 · **Diagnóstico. Sin cambios de código, migraciones ni producción.**

---

## 🔴 Corrección al contexto de partida

**B1.6 ya está aplicado en producción.** La ventana cerró el 20/08 con **CASO 1 — AVANZA** según el protocolo congelado, y el `REVOKE` se ejecutó y verificó el mismo día (entrada 011).

Estado real de `anon` hoy, medido:

```
Relaciones que puede leer:       1  (tenants_public, solo SELECT)
Relaciones con escritura:        0
Funciones que puede ejecutar:    0
```

Eso cierra **R-1**, **R-5** y **R-11**. El diagnóstico que sigue parte de ahí.

---

## 1 · Resumen ejecutivo

En cinco días el sistema pasó de **`anon` con acceso completo a 34 tablas** a **`anon` leyendo un solo objeto**. Se cerraron R-1, R-5, R-10, R-11 y R-13, se versionó todo el esquema, y `supabase db push` dejó de ser una ruleta.

**Pero apareció algo que cambia la naturaleza del problema.**

Hasta el 20/08 el diagnóstico era *"hay privilegios mal puestos"* — eso se arregla y queda arreglado. Ahora es *"los privilegios se revierten solos y no sabemos por qué"* (**R-18**). Mientras eso no se explique, **ninguna corrección de privilegios es estable**, y la garantía de todo lo demás queda en suspenso.

Lo segundo: **el sistema nunca operó con roles diferenciados.** Dos usuarios, ambos `admin`. Cuatro políticas RLS atadas a rol nunca se ejercitaron.

## 2 · ¿Está listo para lanzamiento?

# 🟡 CONDICIONADO

**No es NO** porque los fundamentos están sanos y verificados en producción: RLS en las 43 relaciones, aislamiento cross-tenant en cero con tres clínicas históricas, `anon` reducido a un objeto, webhook de MercadoPago que no confía en el body, PII saneada en Sentry.

**No es SÍ** por cinco condiciones. Ninguna requiere rediseñar arquitectura.

## 3 · Top 10 riesgos

> **Actualizado el 22/08 tras la prueba de restore.** El orden cambió: lo que era ⚪ NO VERIFICADO pasó a ser el riesgo N°1 confirmado.

| # | Riesgo | Sev. | Estado |
|---|---|---|---|
| **1** | **NO EXISTEN BACKUPS AUTOMÁTICOS.** *"Free Plan does not include project backups."* Sin PITR. **RPO infinito.** 212 pacientes reales sin red de contención | **Crítica** | 🔴 **CONFIRMADO** · entrada 012 |
| **2** | **R-18 · Los privilegios se revierten solos. Se repitió el 22/08** sobre `bi_citas_por_dia`, después de B1.6 | Crítica | 🔴 Abierto · reincidente |
| **3** | **El sistema nunca operó con roles diferenciados** | Alta | 🔴 Certeza |
| — | ~~RTO sin medir~~ | — | 🟢 **CERRADO · 210 s**, restore íntegro verificado |
| **4** | **IDOR nunca probado en las 36 rutas** | Alta | ⚪ NV |
| **5** | **No existe baja de tenant.** El export **sí existe** (`/api/pacientes/exportar`) pero **omite la historia clínica**: sin odontograma, sin fotos, sin consentimientos, sin pagos | Alta | 🟡 **Corregido 22/08** — ver nota |
| **6** | `CRON_SECRET` sin rotar; posible exposición | Alta | 🔴 Abierto |
| **7** | Sentry histórico con tokens de paciente e IPs sin purgar | Alta | 🔴 Abierto |
| **8** | **R-17 · Toda función nueva nace ejecutable por `anon`** | Media | 🟡 Mitigado por proceso |
| **9** | R-2 · Escalada `admin → owner` | Alta | 🟣 Aceptado → Fase 2 |
| **10** | Borrar un paciente destruye historia clínica sin log ni confirmación | Alta | 🟡 B1.4 parcial |

## 4 · Bloqueantes para lanzamiento

**Cinco. Todos deben cerrarse.**

**B-1 · Explicar R-18.** El 20/08 los ACL de P0-07 y R-10 aparecieron revertidos. Descartado `db push` — el historial no lo muestra. Descartada una cuenta de terceros — los 11 usuarios son roles estándar. **La causa sigue sin identificar.** Queda mirar Logs → Postgres filtrando `GRANT`.

*Un sistema donde los privilegios se revierten sin explicación no puede recibir dinero de clientes.* No por la severidad puntual —R-10 está cerrado otra vez— sino porque **invalida la garantía de todo lo demás**.

**B-2 · Backups con RPO y RTO.** El runbook documenta un restore probado el 22/07, y eso vale. Pero fue **manual y único**, sobre un baseline de 23 tablas cuando hoy hay 36. **Criterio: restore completo sobre el esquema actual, con RTO medido.**

**B-3 · Operar con los 4 roles.** Crear un `odontologo` y un `staff` reales y ejercitar los flujos. Cuatro políticas RLS empiezan a denegar cosas que nadie probó. **Ese día no puede ser el día del primer cliente.**

**B-4 · Probar IDOR.** Con sesión del tenant A, intentar operar sobre IDs del tenant B en cada ruta que reciba identificadores. Hoy están en verde **por ausencia de prueba**.

**B-5 · Baja de tenant y export.** Cancelar la suscripción solo corta el cobro. No hay purga, retención ni forma de que una clínica se lleve lo suyo. Con historias clínicas y consentimientos firmados de por medio, es un problema legal antes que técnico.

## 5 · Importantes antes del lanzamiento

| | |
|---|---|
| Rotar `CRON_SECRET` + redeploy | Cierra además la duda de P0-03 sobre si viajaba a Sentry |
| Purgar Sentry histórico y rotar los ≥4 tokens de paciente filtrados | Fuga en reposo |
| **B1.2 + B1.3** | Hoy cualquier miembro ajusta puntos sin límite ni justificación |
| **B1.4** con el arreglo del falso éxito | Un control que deniega en silencio es peor que no tenerlo |
| **B1.7** guardas G-1/G-2/G-3 | Convierte R-17 de riesgo en proceso |
| **Control de detección de R-18** | Correr N-1 a diario. **No previene, detecta** |

## 6 · Post-lanzamiento

Modelo multirol · jerarquía `admin→owner` · `FORCE RLS` (R-9) · `search_path` de 9 funciones (R-12) · rate limiting compartido · soft delete + limpieza de Storage · índices por `tenant_id` · conciliación con MercadoPago · R-8 · R-15 · Vault para el secreto del jobid 3.

## 7 · Matriz multi-tenant

| Control | Estado | Evidencia | Riesgo | Acción | Bloquea |
|---|---|---|---|---|---|
| RLS en tablas tenant-scoped | 🟢 | 43/43 · N-1 | — | — | No |
| **FORCE RLS** | 🔴 | `false` en 43/43 · R-9 | El dueño ignora sus políticas | Fase 2 | No |
| `tenant_id NOT NULL` | 🟢 | Verificado en las principales | — | — | No |
| Políticas por operación | 🟡 | 1-3 por tabla, `FOR ALL` | Sin distinción por rol | Fase 2 | No |
| **Aislamiento entre tenants** | 🟢 | **U-01/02/03 = 0** con 3 clínicas | — | — | No |
| `service_role` solo backend | 🟢 | Verificado en repo | — | — | No |
| SECURITY DEFINER | 🟡 | 13 funciones, 4 cerradas | Saltean RLS por diseño | B1.2/B1.3 | No |
| **`search_path`** | 🔴 | 9 de 13 sin `pg_temp` · R-12 | `anon` tiene TEMP | Fase 2 | No |
| EXECUTE privileges | 🟢 | **0 funciones para `anon`** | — | — | No |
| **`anon` privileges** | 🟢 | **1 objeto, solo SELECT** | — | — | No |
| `authenticated` privileges | 🟡 | 36 tablas | RLS es el único control | DO-1 → Fase 2 | No |
| **Default privileges** | 🟡 | `anon` fuera · **R-17 en funciones** | Función nueva nace expuesta | B1.7 G-2 | No |
| Vistas | 🟢 | `bi_*` cerradas, `tenants_public` solo SELECT | — | — | No |
| **Storage policies** | ⚪ | **NO VERIFICADO** | Desconocido | Verificar | **Sí** |
| **API authorization** | ⚪ | 36 rutas mapeadas, **IDOR sin probar** | Cross-tenant posible | **B-4** | **Sí** |
| Tenant resolution | 🟢 | `custom_domain` verificado | — | — | No |
| **Roles** | 🔴 | 2 usuarios, ambos `admin` | **Nunca ejercitado** | **B-3** | **Sí** |
| **Multirol** | 🔴 | No implementado | — | Fase 2 | No |
| **Escalada admin→owner** | 🟣 | R-2, sin explotar | Aceptado | Fase 2 | No |
| **Eliminación de pacientes** | 🟡 | Falso éxito confirmado | Creencia falsa sobre datos clínicos | **B1.4** | No |
| **Eliminación de tenants** | 🔴 | **No existe** | Legal y contractual | **B-5** | **Sí** |
| FK CASCADE / NO ACTION | 🟢 | Mapa completo | `consentimientos` retiene PII | Fase 3 | No |
| Triggers | 🟡 | 5 activos, uno roto (R-8) | Sin fuga, verificado | P0-08 | No |
| Cron | 🟡 | jobid 4 eliminado; queda 1 | Secreto en claro | Vault | No |
| Edge Functions | 🔴 | `enviar-recordatorios` sin versionar · R-15 | Código invisible | F1-3 | No |
| **Secretos** | 🔴 | `CRON_SECRET` sin rotar | Posible exposición | **Importante** | No |
| **Sentry / PII** | 🟡 | Nuevos saneados; **históricos no** | Fuga en reposo | **Importante** | No |
| **Backups** | ⚪ | Restore único del 22/07 sobre 23 tablas | **Pérdida total** | **B-2** | **Sí** |
| Migraciones | 🟢 | `db diff` limpio, historial sincronizado | — | — | No |
| Rollback | 🟢 | Documentado por entrada | — | — | No |
| Tests | 🟡 | **494 verdes** | PGlite no prueba privilegios | Integración SQL | No |
| **Build** | ⚪ | **NO VERIFICADO** — timeout en sandbox | Deploy podría fallar | Correr local | **Sí** |
| Observabilidad | 🟡 | Sentry activo | Sin alertas de reversión | Control N-1 diario | No |

## 8 · B1.2 / B1.3 — estado

**🟡 Diseñados y revisados. NO implementados en producción.**

Lo hecho: diff conceptual contra el cuerpo vivo *(md5 idéntico al repo)* · `src/lib/ajuste-puntos.ts` con 18 tests · UI alineada · revisión de pre-migración completa.

**Dos bloqueos técnicos:**

🔴 **Privilegios de `tiene_rol()` sin verificar tras B1.6.** La verificación posterior confirmó *"0 funciones ejecutables por `anon`"* pero **no miró `authenticated`**. Si perdió el `EXECUTE`, B1.2 y B1.3 fallan para todos.

🔴 **El harness PGlite no alcanza.** `pacientes` es `(id, tenant_id, dato)`, sin `puntos_saldo_cache`. Y ningún test carga nunca estas funciones.

## 9 · B1.6 — estado

**🟢 APLICADO Y VERIFICADO.** Ventana cerrada con CASO 1, protocolo congelado respetado sin relajar criterios.

**Con una salvedad honesta:** la ventana cubrió 48 h de **una clínica con dos usuarios**, 20 llamadas anónimas. El criterio V-2 era `> 0` y se cumplió — no lo muevo después de ver el resultado. Pero un consumidor semanal no habría aparecido. **Riesgo residual bajo, no cero.** Rollback: un `GRANT`.

## 10 · Fase 2 — qué falta

Tabla de asociación multirol · migrar 4 políticas RLS y 5 rutas a `tiene_rol()` · jerarquía de invitación (R-2) · `TABLES FROM authenticated` (DO-1) · `FORCE RLS` (R-9) · `search_path` de 9 funciones (R-12) · `plantillas_consentimiento` para odontólogo (DO-8).

## 11 · Deuda técnica no bloqueante

Rate limiting en memoria · sin índices por `tenant_id` · fotos huérfanas en Storage · `consentimientos_firmados` retiene PII tras el borrado · asimetría 19 CASCADE / 12 NO ACTION (R-7) · sin conciliación con MercadoPago · A-4 y las migraciones commiteadas dentro de commits de feature · `agenda/page.tsx` sin commitear.

## 12 · Plan de release en orden

**Semana 1 — Recuperabilidad**
R-18: Logs → Postgres · control de detección N-1 diario · verificar PITR · **restore completo sobre 36 tablas con RTO medido** · rotar `CRON_SECRET` + redeploy · purgar Sentry y rotar tokens · **correr `next build` local**

**Semana 2 — Cerrar P0-05**
Verificar `tiene_rol()` · harness nuevo · 16 tests en rojo · **B1.2 + B1.3** · **B1.4** · **B1.7**

**Semanas 3-4 — Roles y ciclo de vida**
Multirol · jerarquía R-2 · **operar con los 4 roles en staging** · **suite IDOR** · **completar el export con la historia clínica** · **baja de tenant**

---

### ⚠️ Corrección · 22/08/2026 — el export existe

Este documento afirmaba *"no existe baja de tenant ni export de datos"*. **La mitad era falsa.** `next build` listó `/api/pacientes/exportar`, que estaba desde antes de la auditoría y no aparece en el inventario de rutas.

**Lo que hace bien** — y es de las rutas mejor protegidas del sistema:

```ts
if (!user) → 401
if (!membership) → 403          // verifica tenant_users contra el tenantId pedido
if (role !== 'admin' && role !== 'owner') → 403
```

**Ya implementa la verificación de rol que DO-6 quiere generalizar.** Sirve de patrón para las demás rutas.

**Lo que le falta.** Exporta pacientes, turnos y facturas. **No exporta la historia clínica:** odontograma, fotos clínicas, consentimientos firmados, pagos ni tratamientos. Como instrumento de portabilidad está incompleto — lo que omite es justamente el registro médico.

**Y no cubre el habeas data del paciente.** Es un export para la CLÍNICA. Un paciente que pide su propia historia es otra obligación legal y no tiene ruta.

**La baja de tenant sigue sin existir.** El único `tenants.delete()` del código es un rollback cuando falla el alta, no un offboarding.

**Semanas 5-6 — Piloto**
Storage policies · rate limiting compartido · **2-3 clínicas reales con roles diferenciados** · simulacro de incidente con RTO real

## 13 · Checklist de GO / NO-GO

Los nueve escenarios que pediste, respondidos sin adornos:

| # | Escenario | Hoy | Por qué |
|---|---|---|---|
| **1** | ¿Un tenant puede ver datos de otro? | 🟢 **No, hasta donde se probó** | RLS en 43/43, U-01/02/03 = 0. **Pero IDOR no se probó** — es "no encontré", no "no existe" |
| **2** | ¿Un usuario puede ejecutar una función que no debería? | 🔴 **Sí** | Ninguna función valida rol. Cualquier miembro ajusta puntos sin límite. **B1.2/B1.3 lo cierran** |
| **3** | ¿`anon` puede modificar información? | 🟡 **Hoy no. Ayer sí** | Cero escritura tras B1.6. **Pero R-18 revirtió los privilegios una vez y no sabemos por qué** |
| **4** | ¿Un usuario puede escalar privilegios? | 🔴 **Sí** | Un `admin` puede invitar a alguien como `owner`. R-2, aceptado, sin explotar |
| **5** | ¿Una eliminación produce pérdida inesperada? | 🔴 **Sí** | Borrar un paciente destruye historia clínica, ledger y recordatorios. Sin log, sin confirmación reforzada, deja fotos huérfanas |
| **6** | ¿Una migración puede romper producción? | 🟢 **Ya no** | `db diff` limpio, historial sincronizado. **Ayer sí podía:** una migración versionada tenía `DROP VIEW` de las 6 vistas |
| **7** | ¿Un secreto puede quedar expuesto? | 🔴 **Sí** | `CRON_SECRET` sin rotar. Jobid 3 con clave en claro. Sentry histórico sin purgar |
| **8** | ¿Un flujo crítico puede fallar en silencio? | 🔴 **Sí, y pasó** | R-13: recordatorios por email rotos meses. R-8: trigger devolviendo 401. **Nadie se enteró** |
| **9** | ¿Una clínica nueva queda aislada? | 🟡 **Probablemente** | El alta funciona y RLS aplica. **Nunca se probó de punta a punta con un tenant nuevo y roles diferenciados** |

### El mínimo seguro para salir al mercado

**Cinco cosas. Ni una menos:**

1. **Explicar R-18** — o, si no aparece la causa, el control de detección corriendo a diario con alerta
2. **Restore probado sobre las 36 tablas, con RTO medido**
3. **Operar con los 4 roles en staging**, flujos completos
4. **Suite de IDOR en verde** sobre las rutas que reciben identificadores
5. **Export de datos de una clínica**, aunque la baja sea un procedimiento manual documentado

Con eso, y B1.2/B1.3/B1.4 aplicados, **es defendible cobrarle a la primera clínica.**

**Sin el punto 1, no.** Todo lo demás se apoya en que los privilegios que ponemos se queden puestos.

---

*Diagnóstico de release readiness. Sin cambios de código, sin migraciones, sin producción, sin commit.*
