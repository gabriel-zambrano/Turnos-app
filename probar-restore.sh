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
echo "▸ 5/5  Verificando TODAS las tablas del dump…"
#
# Antes esto listaba 6 tablas a mano y terminaba con "compará estos números
# con producción". Dos problemas.
#
# Uno: 6 de 23. Quedaban afuera `historial_dental`, `presupuestos` y
# `paciente_fotos` — el núcleo clínico. Un restore que perdiera la historia
# clínica entera pasaba en verde.
#
# Dos: delegaba la comparación en el ojo humano, a las once de la noche,
# después de un incidente. Eso no es una verificación.
#
# Ahora se compara sola. El dump declara cuántas filas trae por tabla en sus
# bloques COPY; la base restaurada dice cuántas tiene. Si difieren, falla.
# No hace falta ninguna credencial extra de producción: lo que hay que probar
# es que todo lo que el dump capturó entró, que es donde está el riesgo real.

python3 - "$ARCHIVO" > /tmp/esperado.txt <<'PY'
import sys, re
tabla, n, out = None, 0, []
with open(sys.argv[1], encoding='utf8', errors='ignore') as f:
    for linea in f:
        if tabla is None:
            m = re.match(r'COPY (?:"?public"?\.)?"?(\w+)"?\s*\(', linea)
            if m:
                tabla, n = m.group(1), 0
        elif linea.startswith('\\.'):
            out.append((tabla, n)); tabla = None
        else:
            n += 1
for t, c in sorted(out):
    print(f"{t}|{c}")
PY

ESPERADAS=$(wc -l < /tmp/esperado.txt | tr -d ' ')
echo "       el dump trae datos de $ESPERADAS tablas"

FALLAS=0
printf '\n%-26s %10s %10s\n' "TABLA" "DUMP" "RESTAURADO"
printf '%s\n' "───────────────────────────────────────────────────"

while IFS='|' read -r TABLA ESPERADO; do
  REAL=$(psql "$LOCAL" -t -A -c "SELECT count(*) FROM public.\"$TABLA\";" 2>/dev/null || echo "ERROR")
  if [ "$REAL" = "$ESPERADO" ]; then
    printf '%-26s %10s %10s  ✓\n' "$TABLA" "$ESPERADO" "$REAL"
  else
    printf '%-26s %10s %10s  ✗\n' "$TABLA" "$ESPERADO" "$REAL"
    FALLAS=$((FALLAS + 1))
  fi
done < /tmp/esperado.txt

# Una tabla con RLS que el dump no menciona puede ser legítima (vacía en
# producción) o la señal de que el dump no la capturó. Hay que mirarla.
echo
echo "Tablas con RLS ausentes del dump (vacías en producción, o no capturadas):"
psql "$LOCAL" -t -A -c "
  SELECT c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
  ORDER BY 1;" | while read -r T; do
  grep -q "^$T|" /tmp/esperado.txt || echo "  · $T ($(psql "$LOCAL" -t -A -c "SELECT count(*) FROM public.\"$T\";") filas restauradas)"
done

echo
if [ "$FALLAS" -gt 0 ]; then
  echo "❌ $FALLAS tablas NO coinciden. EL RESTORE NO ES ÍNTEGRO."
  echo "   No lo des por bueno ni anotes el RTO."
  exit 1
fi
echo "✅ Las $ESPERADAS tablas coinciden con el dump."

echo
echo "⚠️  LO QUE ESTA PRUEBA NO CUBRE — leelo antes de quedarte tranquilo:"
echo
echo "   1. auth.users NO está en el dump."
echo "      'supabase db dump' excluye los esquemas gestionados. Un restore"
echo "      devuelve los pacientes y CERO cuentas con las cuales entrar:"
echo "      tenant_users apuntaría a user_id inexistentes."
echo "      → Con Pro, verificá si el backup automático sí los trae."
echo
echo "   2. Los archivos de Storage NO están, y PITR tampoco los va a traer."
echo "      Las fotos clínicas necesitan su propio respaldo:"
echo "        ./respaldar-storage.sh"
echo "        ./verificar-respaldo-storage.sh <archivo.gpg>"
echo
echo "Al terminar:"
echo "  npx supabase stop"
echo "  rm -f $ARCHIVO"
