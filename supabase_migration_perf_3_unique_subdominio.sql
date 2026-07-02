-- ── CAMBIO EXTRA: constraint único real en tenants.subdominio_generico ──
-- Contexto: la nueva función "Agregar clínica" valida en la API que el subdominio
-- no esté repetido antes de crear el tenant, pero esa validación es "revisar y
-- después insertar" (check-then-insert): si dos clínicas se crean casi al mismo
-- instante con el mismo subdominio, ambas podrían pasar la validación. La única
-- garantía real es un constraint único en la base de datos. La API ya está
-- preparada para mostrar un mensaje claro si este constraint frena un choque.
--
-- Riesgo: bajo, pero a diferencia de los índices del cambio 1, este si puede
-- fallar al crearse SI ya existen subdominios duplicados o vacíos en la tabla.
-- Por eso: correr primero el chequeo de abajo.

-- ── Paso 1: revisar que no haya subdominios repetidos ya cargados ──
-- Si esto devuelve filas, resolvé esos duplicados a mano (renombrando el
-- subdominio de uno de los dos) ANTES de seguir al paso 2.
SELECT subdominio_generico, COUNT(*)
FROM tenants
WHERE subdominio_generico IS NOT NULL
GROUP BY subdominio_generico
HAVING COUNT(*) > 1;

-- ── Paso 2: si el paso 1 no devolvió filas, correr esto ──
-- El WHERE excluye los NULL a propósito: Postgres nunca considera dos NULL
-- "iguales" en un índice único, así que tenants sin subdominio (los que solo
-- usan dominio propio, "custom_domain") no se ven afectados.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_subdominio_generico
  ON tenants (subdominio_generico)
  WHERE subdominio_generico IS NOT NULL;

-- ── Rollback ──
-- DROP INDEX IF EXISTS uq_tenants_subdominio_generico;
