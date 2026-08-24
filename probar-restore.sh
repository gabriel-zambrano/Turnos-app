#!/usr/bin/env bash
#
# Prueba de restore completa, con medición de RTO.
#
# Un backup que nunca se restauró no es un backup. Esto lo restaura de verdad
# y cronometra cuánto tarda: ese número ES el RTO.
#
# Uso:   ./probar-restore.sh
#
# ⚠️  El dump contiene datos reales de pacientes: nombres, teléfonos, emails.
#     Se guarda en ~/backups-dentaldesk. Borralo cuando termines o movelo a
#     un volumen cifrado. NO lo dejes en Descargas ni lo subas a ningún lado.
#
# No toca producción: solo lee de ella (pg_dump) y escribe en la base local.

set -euo pipefail

DIR_BACKUP="$HOME/backups-dentaldesk"
SELLO="$(date +%Y%m%d_%H%M%S)"
ARCHIVO="$DIR_BACKUP/prod_${SELLO}.sql"
LOCAL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

mkdir -p "$DIR_BACKUP"
chmod 700 "$DIR_BACKUP"

echo "──────────────────────────────────────────────"
echo " Prueba de restore — $SELLO"
echo "──────────────────────────────────────────────"

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker no está corriendo."
  echo "   Abrí Docker Desktop, esperá a que el ícono deje de animarse, y reintentá:"
  echo "     open -a Docker"
  exit 1
fi

INICIO=$(date +%s)

echo
echo "▸ 1/4  Dump de producción (solo datos)…"
npx supabase db dump --linked --data-only -f "$ARCHIVO"
chmod 600 "$ARCHIVO"
echo "       $(wc -l < "$ARCHIVO") líneas · $(du -h "$ARCHIVO" | cut -f1)"

echo
echo "▸ 2/4  Levantando Postgres local…"
npx supabase start >/dev/null

echo
echo "▸ 3/4  Reconstruyendo el esquema desde las migraciones…"
npx supabase db reset >/dev/null

echo
echo "▸ 4/4  Restaurando los datos…"
# `ON_ERROR_STOP=1` no es opcional.
#
# Sin él, psql sigue adelante ante un error y termina con código 0: el script
# imprimía el RTO y los conteos como si el restore hubiera sido íntegro, aunque
# hubieran fallado la mitad de los INSERT. Un verificador que puede reportar
# éxito sobre un restore parcial es peor que no tener ninguno.
#
# El riesgo es concreto acá: pg_dump avisa de FKs circulares en `facturas`. Hoy
# hay 5 filas y entra por orden favorable; con más facturas puede romperse, y
# entonces queremos que EXPLOTE, no que informe verde.
if ! psql "$LOCAL" -v ON_ERROR_STOP=1 -q -f "$ARCHIVO" > /tmp/restore_out.log 2>&1; then
  echo
  echo "❌ EL RESTORE FALLÓ. El backup NO es confiable."
  echo "   Últimas líneas del error:"
  tail -20 /tmp/restore_out.log | sed 's/^/     /'
  exit 1
fi

FIN=$(date +%s)
RTO=$((FIN - INICIO))

echo
echo "──────────────────────────────────────────────"
echo " RTO medido: ${RTO}s  ($((RTO / 60))m $((RTO % 60))s)"
echo "──────────────────────────────────────────────"
echo
echo "Conteos en la base RESTAURADA:"
psql "$LOCAL" -t -A -F' | ' -c "
  SELECT 'pacientes',        count(*) FROM pacientes
  UNION ALL SELECT 'citas',            count(*) FROM citas
  UNION ALL SELECT 'facturas',         count(*) FROM facturas
  UNION ALL SELECT 'pagos',            count(*) FROM pagos
  UNION ALL SELECT 'historial_puntos', count(*) FROM historial_puntos
  UNION ALL SELECT 'tenant_users',     count(*) FROM tenant_users
  ORDER BY 1;"

echo
echo "Compará esos números con producción. Si coinciden, el restore es íntegro."
echo
echo "Al terminar:"
echo "  npx supabase stop"
echo "  rm -f $ARCHIVO"
