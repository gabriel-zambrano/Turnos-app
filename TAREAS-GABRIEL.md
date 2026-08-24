# Lo que depende de vos

**Estado al 22/08/2026.** Todo lo que sigue requiere acceso a Supabase, a la facturación o a la app corriendo. Nada de esto lo puedo hacer yo.

Ordenado por lo que más te acerca al lanzamiento.

---

## 🔴 1 · Backups — 15 minutos, 25 USD/mes

**El riesgo número uno del proyecto.** 212 pacientes reales, cero red de contención. Hoy, si la base se corrompe o alguien borra algo, no hay a dónde volver.

### Activarlo

1. **Dashboard → Settings → Billing → Upgrade to Pro**
2. **Settings → Database → Point-in-Time Recovery** → activar
3. Anotá la ventana de retención que te ofrece (7 días es lo típico)

### Verificar que sea real

Un backup que nunca se restauró no es un backup:

```bash
cd ~/Turnos-app
open -a Docker          # esperá a que el ícono deje de animarse
./probar-restore.sh
```

Cronometra el RTO y compara conteos contra producción. La última corrida dio **210s** y 6/6 conteos exactos.

⚠️ El dump tiene PII real. Borralo al terminar:

```bash
npx supabase stop && rm -f ~/backups-dentaldesk/prod_*.sql
```

### Qué pasarme

La ventana de retención y si el restore volvió a dar verde.

---

## 🔴 2 · R-18 — los privilegios que se revierten solos

**El bloqueante conceptual.** Dos veces los ACL volvieron atrás sin que nadie los tocara. Mientras no se explique, ninguna corrección de privilegios es estable — y eso invalida la garantía de todo lo demás, no solo de lo que se revirtió.

### Dónde mirar

**Dashboard → Logs → Postgres Logs**

- Rango: **últimos 7 días**
- Buscar: `GRANT`
- Después: `bi_citas_por_dia` (fue el último en revertirse, el 22/08)

`log_statement = 'ddl'` está activo y PostgreSQL clasifica `GRANT` como DDL. **Las sentencias están registradas.** El log tiene la respuesta.

### Qué mirar en cada entrada

La columna **`user_name`**. Es lo único que decide:

| `user_name` | Qué significa |
|---|---|
| `postgres` | Salió del editor SQL o del CLI. Hay una explicación humana y rastreable |
| `supabase_admin` | **Confirma la hipótesis:** algo de la plataforma recrea objetos, y no podemos alterar sus default privileges porque `postgres` no es miembro de ese rol |
| otro | Dato nuevo — pasámelo tal cual |

### Qué pasarme

Las entradas con `GRANT`, con timestamp y `user_name`. **Sin recortar:** si no aparece ninguna, ese silencio también es información y cambia la hipótesis.

---

## 🔴 3 · Storage — la incógnita real

Nunca se auditó. Ahí viven las fotos clínicas: imágenes médicas atadas a una persona identificable. **No sabemos si está bien ni si está mal**, y esos son dos estados distintos.

### Correr

Archivo: **`P0-09_STORAGE_LECTURA.sql`** — 8 consultas, todas `SELECT`, seguras en producción.

SQL Editor → **una por vez** → **"No limit"**.

### Empezá por S-1 y frená ahí

```sql
SELECT id, name, public, file_size_limit, allowed_mime_types, created_at
FROM storage.buckets
ORDER BY name;
```

**Si `fotos_clinicas` tiene `public = true`, las otras siete no importan todavía:** significa que cualquiera con el link descarga fotos clínicas sin sesión y sin pertenecer a la clínica. Eso reordena el tablero entero.

`src/lib/storage.ts` afirma en un comentario que el bucket "ahora es privado". Es una afirmación del repositorio, no evidencia. S-1 la confirma o la desmiente.

### Qué pasarme

S-1 primero, sola. Con eso decido si seguimos con S-2 a S-8 o si hay que parar todo.

---

## 🟡 4 · Tres verificaciones manuales en la app

Cambios que ya están aplicados y **verificados por tipos y tests, pero no por uso real**.

| | Qué hacer | Qué tiene que pasar | Origen |
|---|---|---|---|
| 1 | Marcar asistencia con cobro desde la ficha de un paciente | El pago se registra, la forma de pago y "Facturar" funcionan | Toqué esos textos hoy |
| 2 | Abrir una ficha y el portal con un token real | **Cero rastro de puntos.** La pestaña dice "💰 Cobros y Visitas" | Fidelización apagada |
| 3 | Intentar borrar un paciente de otro tenant | **Avisa que falló.** Antes decía "Paciente eliminado" mintiendo | B1.4 |

La 1 es la más importante: es donde entra la plata.

---

## ⚪ 5 · Cuando lo anterior esté

- Rotar `CRON_SECRET` + redeploy
- Purgar Sentry histórico (tiene tokens de paciente e IPs)
- Commitear todo el trabajo de P0-05, que sigue local

---

## Lo que sigo yo

Storage en cuanto pases S-1 · export de historia clínica · baja de tenant · multirol (DO-6).

## Lo que NO se puede hacer sin backups

El `DROP` definitivo de fidelización. Hoy está oculta con un flag y los datos intactos, que es reversible. Borrar sin poder restaurar no lo es.
