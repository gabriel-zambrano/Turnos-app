# Historial de migraciones

Esta carpeta es la **única fuente de verdad del esquema**. Reconstruir la base
desde acá tiene que dar exactamente lo que hay en producción.

## Cómo está armado

- `20260722120000_remote_schema.sql` — **baseline**: volcado del esquema de
  producción al 22/07/2026 (23 tablas). Contiene todo lo que hicieron los
  `supabase_migration_*.sql` sueltos que quedaron en la raíz del repo.
- El resto son los cambios posteriores al baseline, en orden cronológico.

Los archivos `supabase_migration_*.sql` que siguen en la raíz son **históricos**:
ya están dentro del baseline. Se conservan porque la documentación los menciona,
pero **no hay que correrlos** contra una base nueva — el baseline ya los incluye.

## Agregar un cambio

```bash
npx supabase migration new <nombre_descriptivo>
# editar el .sql que se creó acá
npx supabase db push        # lo aplica a la base linkeada
git add supabase/ && git commit -m "db: <qué cambió>"
```

Nunca más pegar SQL suelto en el editor de Supabase: si el cambio no está en
esta carpeta, la base deja de ser reproducible.

## Si una migración ya se aplicó a mano

Cuando el SQL se corrió pegándolo en el dashboard, el CLI no lo sabe y va a
querer aplicarlo de nuevo. Se le avisa así, con el timestamp del archivo:

```bash
npx supabase migration repair --status applied <TIMESTAMP>
```

Las siete migraciones entre `20260723180351` y `20260727160536` están en ese
caso: se aplicaron a mano en producción antes de quedar versionadas acá.
