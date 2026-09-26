#!/usr/bin/env bash
#
# Verificación del respaldo de Storage.
#
# POR QUÉ ES UN SCRIPT SEPARADO
#
#   `respaldar-storage.sh` comprueba que lo descargado coincide con lo remoto.
#   Eso confirma la DESCARGA, no la RECUPERACIÓN.
#
#   Lo que hay que poder afirmar el día del incidente es otra cosa: que a
#   partir del archivo cifrado se puede volver a tener las fotos, abiertas y
#   legibles. Esto es lo que lo demuestra.
#
#   El gate del lanzamiento no se cierra al activar el plan Pro. Se cierra
#   cuando una foto clínica recuperada desde este respaldo se abre en pantalla.
#
# Uso:   ./verificar-respaldo-storage.sh ~/backups-dentaldesk/storage/storage_XXX.tar.gz.gpg

set -euo pipefail

ARCHIVO="${1:-}"

if [ -z "$ARCHIVO" ] || [ ! -f "$ARCHIVO" ]; then
  echo "Uso: ./verificar-respaldo-storage.sh <archivo.tar.gz.gpg>"
  echo
  echo "Respaldos disponibles:"
  ls -1t "$HOME/backups-dentaldesk/storage/"*.gpg 2>/dev/null | sed 's/^/  /' || echo "  (ninguno)"
  exit 1
fi

TRABAJO="$(mktemp -d)"
trap 'rm -rf "$TRABAJO"' EXIT   # las fotos en claro no sobreviven al script

echo "──────────────────────────────────────────────"
echo " Verificación de respaldo"
echo " $(basename "$ARCHIVO")"
echo "──────────────────────────────────────────────"

INICIO=$(date +%s)

echo
echo "▸ 1/4  Descifrando…"
gpg --quiet --decrypt "$ARCHIVO" | tar -xzf - -C "$TRABAJO"

echo "▸ 2/4  Inventario recuperado"
TOTAL=$(find "$TRABAJO" -type f | wc -l | tr -d ' ')
echo "       $TOTAL archivos"
[ "$TOTAL" -eq 0 ] && { echo "❌ El respaldo está vacío."; exit 1; }

for d in "$TRABAJO"/*/; do
  [ -d "$d" ] || continue
  printf '       %-20s %s archivos\n' "$(basename "$d")" "$(find "$d" -type f | wc -l | tr -d ' ')"
done

echo
echo "▸ 3/4  Validando que sean imágenes reales"
# `file` lee la cabecera. Un archivo truncado por un cifrado a medias pesa,
# tiene la extensión correcta, y no es una imagen.
MALOS=0
while IFS= read -r f; do
  TIPO=$(file -b --mime-type "$f")
  case "$TIPO" in
    image/*) ;;
    *) echo "       ✗ $(basename "$f") → $TIPO"; MALOS=$((MALOS + 1)) ;;
  esac
done < <(find "$TRABAJO" -type f)

if [ "$MALOS" -gt 0 ]; then
  echo
  echo "❌ $MALOS de $TOTAL archivos no son imágenes válidas."
  echo "   El respaldo NO es confiable."
  exit 1
fi
echo "       $TOTAL/$TOTAL son imágenes válidas"

echo
echo "▸ 4/4  Prueba humana"
MUESTRA=$(find "$TRABAJO" -type f | head -1)
COPIA="$HOME/Desktop/PRUEBA-RESTORE-$(basename "$MUESTRA")"
cp "$MUESTRA" "$COPIA"

FIN=$(date +%s)

echo
echo "──────────────────────────────────────────────"
echo " RTO de Storage: $((FIN - INICIO))s"
echo "──────────────────────────────────────────────"
echo
echo "Se copió una foto al Escritorio:"
echo "  $(basename "$COPIA")"
echo
echo "ABRILA. Si se ve, el respaldo está verificado."
echo
echo "Ese es el paso que cierra el gate — no el pago del plan Pro."
echo
echo "Cuando termines, borrala:"
echo "  rm \"$COPIA\""
echo
echo "Anotá el RTO en OPERACION.md junto con la fecha."
