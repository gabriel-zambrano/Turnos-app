# P0-03 — Procedimiento de despliegue a producción

**Fecha:** 12 de agosto de 2026
**Estado:** procedimiento preparado. **Nada ejecutado.**
**Rama:** `p0-03-sentry-secretos` · **Commits:** `eda88e3` + `0331377`

---

## 0. Una recomendación antes de empezar: separar los dos cambios

Pediste rotar `CRON_SECRET` y desplegar. **Recomiendo hacerlo en dos pasos, no en uno.** Tres razones:

**1 · Señal limpia.** Si los recordatorios fallan mañana con los dos cambios juntos, no vas a saber si fue el código o el secreto. Separados, cada falla apunta a una sola causa.

**2 · El despliegue ya corta la hemorragia.** El secreto se exponía porque viajaba en la URL. Apenas se publique el código nuevo, **eso deja de pasar**. La rotación resuelve la exposición *histórica*, que es un problema distinto y menos urgente.

**3 · La rotación no es reversible.** `CRON_SECRET` está marcado *Sensitive* en Vercel: **el valor viejo no se puede recuperar**. Si algo sale mal, no hay vuelta atrás a ese valor — solo hacia adelante con uno nuevo.

Por eso el procedimiento va en dos fases:

```
FASE A · merge + deploy            → corta la exposición. Rollback limpio.
   ↓  verificar 24 h
FASE B · rotar + redeploy          → cierra la exposición histórica.
```

Si preferís hacerlo todo junto, está la **Variante rápida** al final, con sus riesgos.

---

## 1. Ventana horaria

Las tres tareas programadas corren en UTC:

| Tarea | UTC | Argentina |
|---|---|---|
| `/api/cron` (recordatorios) | 11:00 | **08:00** |
| `/api/crm-campanas` | 12:00 | **09:00** |
| `/api/daily-briefing` | 22:00 | **19:00** |

**Mejor momento para desplegar: entre las 09:30 y las 18:00 hora argentina.**

Las dos tareas de la mañana ya corrieron, y quedan ~23 horas hasta la próxima. Si algo sale mal, hay margen de sobra para detectarlo y revertir sin que un paciente se quede sin recordatorio.

**Evitar:** desplegar después de las 18:00 ART. El briefing sale a las 19:00 y no habría margen.

---

## 2. FASE A — Merge y despliegue

### A.0 · Verificaciones previas

```bash
cd ~/Turnos-app
git checkout p0-03-sentry-secretos
git status --short
```

**Debe cumplirse:**
- Los 4 archivos de UI (`bi/page.tsx`, `crm/page.tsx`, `finanzas/page.tsx`, `globals.css`) aparecen con la letra en la **segunda** columna (` M`) — sin commitear.
- Ningún archivo de P0-03 aparece modificado.

```bash
npm test && npx tsc --noEmit && npm run build; echo "===EXIT=$?==="
```

**Esperado:** 468 tests, exit 0 en todo.

**Si algo falla acá, no sigas.**

### A.1 · Anotá el punto de rollback

```bash
git rev-parse main
```

**Guardá ese hash.** Es a donde se vuelve si hay que revertir. Debería ser `a985422`.

También anotá el deployment de producción actual: Vercel → Deployments → el que dice **Production**. Guardá su URL.

### A.2 · Merge

```bash
git checkout main
git pull origin main
git merge --no-ff p0-03-sentry-secretos -m "Merge P0-03: saneo de PII y secretos en Sentry"
```

El `--no-ff` crea un commit de merge explícito. Eso hace el rollback trivial: se revierte ese único commit.

**Verificá que el merge no arrastró nada de UI:**

```bash
git diff --stat a985422 HEAD
```

**Esperado: 12 archivos.** Si aparece `bi/page.tsx`, `crm/page.tsx`, `finanzas/page.tsx` o `globals.css`, **abortá**:

```bash
git reset --hard a985422
```

### A.3 · Publicar

```bash
git push origin main
```

Vercel construye y despliega producción automáticamente. **2-4 minutos.**

Seguilo en Vercel → Deployments. Esperá el estado **Ready**.

### A.4 · Verificación inmediata — los 4 endpoints

```bash
BASE="https://turnos.walterbenegas.com.ar"

echo "── /api/cron ──"
curl -s -o /dev/null -w "  sin credenciales:   %{http_code}\n" "$BASE/api/cron"
curl -s -o /dev/null -w "  ?token= (viejo):    %{http_code}\n" "$BASE/api/cron?token=loquesea"
curl -s -o /dev/null -w "  header incorrecto:  %{http_code}\n" -H "Authorization: Bearer incorrecto" "$BASE/api/cron"

echo "── /api/crm-campanas ──"
curl -s -o /dev/null -w "  sin credenciales:   %{http_code}\n" "$BASE/api/crm-campanas"
curl -s -o /dev/null -w "  ?token= (viejo):    %{http_code}\n" "$BASE/api/crm-campanas?token=loquesea"

echo "── /api/daily-briefing ──"
curl -s -o /dev/null -w "  sin credenciales:   %{http_code}\n" "$BASE/api/daily-briefing"

echo "── /api/send-recordatorios ──"
curl -s -o /dev/null -X POST -w "  sin credenciales:   %{http_code}\n" "$BASE/api/send-recordatorios"
curl -s -o /dev/null -X POST -w "  ?token= (viejo):    %{http_code}\n" "$BASE/api/send-recordatorios?token=loquesea"
```

**Esperado: `401` en todos.**

El renglón `?token= (viejo)` es **la prueba de que P0-03 cumplió su objetivo**: esa vía ya no existe.

> ### ⚠️ NO probar con el header correcto
>
> Un `curl` con `Authorization: Bearer <CRON_SECRET>` real **ejecutaría el envío de recordatorios a pacientes reales**, o mandaría el briefing, o dispararía las campañas de WhatsApp.
>
> **La verificación positiva es la corrida del cron de mañana**, no un curl de hoy.

### A.5 · Verificación funcional

Con sesión iniciada, abrí:

- ☐ `/dashboard`
- ☐ `/agenda`
- ☐ `/finanzas`
- ☐ `/pacientes`

En ventana de incógnito:

- ☐ `/reserva/<slug>` — debe cargar el branding de la clínica

**El botón de recordatorios del dashboard debe seguir funcionando.** Ese camino usa sesión, no `CRON_SECRET`, y P0-03 no lo tocó. Es tu red de seguridad: si el cron fallara mañana, podés mandarlos a mano desde ahí.

### A.6 · Verificar Sentry

Provocá un error y confirmá el saneo en producción:

1. Abrí `https://turnos.walterbenegas.com.ar/paciente/00000000-0000-4000-8000-000000000001`
2. Console → `Promise.reject(new TypeError('Load failed'))`
3. Sentry → filtrar por `environment: production` y el release nuevo

**Esperado:** `url` con `[redacted]`, sin `user`, sin IP, y `transaction: /paciente/:token`.

Es la misma verificación que pasó en preview, ahora contra producción.

### 🔙 Rollback de la Fase A

**Opción 1 — la más rápida (segundos):**

Vercel → Deployments → buscá el deployment de producción anterior → **⋯ → Promote to Production**.

Vuelve al código anterior sin tocar git. `CRON_SECRET` no cambió, así que los crons siguen funcionando igual.

**Opción 2 — revertir en git:**

```bash
cd ~/Turnos-app
git checkout main
git revert -m 1 HEAD          # revierte el commit de merge
git push origin main
```

**Ninguna de las dos toca datos.** P0-03 no modifica base de datos ni esquema: el rollback es completo.

---

## 3. Verificación del día siguiente

**Cuándo:** después de las **08:30 ART** (11:00 UTC + margen).

### 3.1 · ¿Corrió el cron?

Vercel → Deployments → Functions → filtrar `/api/cron`.

- ☐ Ejecutado a las 11:00 UTC
- ☐ Status **200** (no 401, no 500)
- ☐ `user-agent`: `vercel-cron/1.0`

### 3.2 · ¿Salieron los recordatorios?

```sql
SELECT count(*) AS enviados,
       count(*) FILTER (WHERE estado_envio = 'enviado')  AS ok,
       count(*) FILTER (WHERE estado_envio = 'fallido')  AS fallidos,
       min(creado_en) AS primero,
       max(creado_en) AS ultimo
FROM recordatorios_log
WHERE tipo_mensaje = 'email'
  AND creado_en > now() - interval '1 day';
```

**Esperado:** filas con `primero` alrededor de las **11:00 UTC**.

Línea base de los últimos días: 5, 6, 2, 7, 8, 13, 3, 10, 4. Un número en ese rango es normal; **cero no lo es.**

### 3.3 · ¿Y las otras dos tareas?

```sql
-- Campañas CRM (12:00 UTC)
SELECT tipo, count(*) FROM crm_envios
WHERE creado_en > now() - interval '1 day' GROUP BY tipo;
```

**Sin ruido esperable:** si WhatsApp no está configurado, `/api/crm-campanas` responde 200 con `{ok:false, motivo:'WhatsApp no configurado'}` y no envía nada. Eso es correcto.

El briefing (22:00 UTC) se verifica en la casilla del odontólogo.

### 🔙 Si algo falló

| Síntoma | Causa probable | Acción |
|---|---|---|
| `/api/cron` da **401** | El header no coincide con la variable | Rollback (§Rollback Fase A). Revisar antes de reintentar |
| `/api/cron` da **500** | `CRON_SECRET` no está disponible en runtime | Verificar en Vercel → Environment Variables |
| Status 200 pero 0 recordatorios | No había turnos para hoy | Cruzar contra `citas`. Puede ser correcto |
| No se ejecutó | Problema del cron de Vercel | Revisar Settings → Cron Jobs |

**Mientras tanto**, el botón del dashboard sigue funcionando para no dejar pacientes sin avisar.

---

## 4. FASE B — Rotación de `CRON_SECRET`

**Solo después de que la Fase A haya pasado la verificación del día siguiente.**

### B.0 · Antes de empezar, dos cosas

**1 · Es irreversible.** La variable está marcada *Sensitive*: el valor viejo no se puede leer ni recuperar. Una vez rotado, se sigue hacia adelante.

**2 · El orden es crítico.** Vercel Cron lee la variable de entorno **en cada ejecución**. Las funciones ya desplegadas mantienen el valor con el que se construyeron. Si rotás y no redesplegás, el cron manda el valor nuevo contra una función que espera el viejo → **401**.

**Rotar y redesplegar van seguidos, en la misma sesión.**

### B.1 · Generar

```bash
openssl rand -hex 32
```

Copialo. **No lo pegues en ningún chat, ticket ni archivo.**

### B.2 · Cargarlo en Vercel

Vercel → turnos-app → Settings → Environment Variables → `CRON_SECRET` → **Edit**

- Pegá el valor nuevo
- Environment: **Production** (donde ya estaba)
- Save

### B.3 · Redesplegar inmediatamente

```bash
cd ~/Turnos-app
git commit --allow-empty -m "chore: redeploy tras rotación de CRON_SECRET"
git push origin main
```

Un commit vacío fuerza un build nuevo que toma el valor rotado. Es más limpio que "Redeploy" desde el panel, porque queda registrado en el historial por qué se hizo.

**Esperá el estado Ready.**

### B.4 · Verificar

```bash
BASE="https://turnos.walterbenegas.com.ar"
curl -s -o /dev/null -w "sin credenciales: %{http_code}\n" "$BASE/api/cron"
```

**Esperado: 401.** Confirma que la ruta sigue protegida.

La verificación real es **la corrida del día siguiente** (§3).

### B.5 · Actualizar tu entorno local

```bash
# En ~/Turnos-app/.env.local, actualizá CRON_SECRET con el valor nuevo
```

Solo si corrés los crons en desarrollo.

### 🔙 Rollback de la Fase B

**El valor viejo no se recupera.** Pero el rollback funcional sí existe: generá otro secreto nuevo, cargalo y redesplegá. Lo que importa es que la variable y el despliegue coincidan, no cuál sea el valor.

Si el cron falla después de rotar:

1. Verificá que el último deployment sea **posterior** al cambio de la variable.
2. Si no lo es, forzá un redeploy (B.3).
3. Mientras tanto, el botón del dashboard cubre los recordatorios.

---

## 5. Variante rápida — todo junto

Si preferís una sola publicación en vez de dos:

```
1. Generar el secreto nuevo          (B.1)
2. Cargarlo en Vercel                (B.2)
3. Merge + push                      (A.2, A.3)   ← el build toma el valor nuevo
4. Verificar los 4 endpoints         (A.4)
5. Verificar Sentry                  (A.6)
6. Día siguiente: recordatorios_log  (§3)
```

**Funciona**, porque el despliegue se construye después de cargar la variable, así que ambos quedan con el valor nuevo.

**Lo que perdés:** si mañana los recordatorios no salen, no vas a saber si fue el código o el secreto. Con dos fases, cada falla tiene una sola causa posible.

---

## 6. Resumen de puntos de rollback

| Momento | Cómo se revierte | Coste | ¿Reversible? |
|---|---|---|---|
| Después del merge, antes del push | `git reset --hard a985422` | Instantáneo | Sí |
| Después del push, antes del cron | *Promote to Production* del deployment anterior | Segundos | Sí |
| Después del cron con fallo | Ídem, más envío manual desde el dashboard | Segundos + 1 día de recordatorios | Sí |
| Después de rotar el secreto | Generar otro y redesplegar | Minutos | **Funcionalmente sí; el valor viejo, no** |

**Ningún paso de este procedimiento toca la base de datos.** No hay migraciones, no hay cambios de esquema, no hay datos que restaurar. El rollback siempre es del código, y siempre es completo.

---

## 7. Lo que este procedimiento NO hace

Fuera de alcance, según lo acordado:

- ❌ Purgar los eventos históricos de Sentry
- ❌ Rotar los ≥4 tokens de pacientes expuestos
- ❌ Tocar Supabase — ni datos, ni esquema, ni permisos
- ❌ Aplicar la migración de P0-07 (el `DROP` de las vistas)
- ❌ Commitear los 4 archivos de UI del 07/08

---

## 8. Checklist de ejecución

**Fase A**

- ☐ Ventana horaria correcta (09:30-18:00 ART)
- ☐ `npm test` · `tsc` · `build` en verde
- ☐ Hash de rollback anotado (`a985422`)
- ☐ Deployment de producción actual anotado
- ☐ Merge con `--no-ff`
- ☐ `git diff --stat` = 12 archivos, sin UI
- ☐ Push y estado **Ready**
- ☐ Los 4 endpoints → **401**
- ☐ Pantallas privadas y `/reserva` funcionan
- ☐ Sentry saneado en producción

**Día siguiente**

- ☐ `/api/cron` → 200 a las 11:00 UTC
- ☐ `recordatorios_log` con filas
- ☐ Briefing recibido
- ☐ `crm_envios` sin errores

**Fase B** *(solo si lo anterior pasó)*

- ☐ Secreto nuevo generado
- ☐ Cargado en Vercel (Production)
- ☐ Redeploy inmediato
- ☐ Endpoints → 401
- ☐ `.env.local` actualizado
- ☐ Día siguiente: verificación de §3 otra vez

---

*Procedimiento preparado, no ejecutado. Sin cambios en código, base de datos, variables de entorno ni despliegues.*
