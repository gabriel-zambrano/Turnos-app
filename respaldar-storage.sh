#!/usr/bin/env bash
#
# Respaldo de los archivos de Supabase Storage — fotos clínicas y logos.
#
# POR QUÉ EXISTE ESTE SCRIPT APARTE
#
#   Los backups automáticos y el PITR de Supabase NO cubren Storage. Se
#   construyen sobre snapshots físicos del directorio de Postgres más el WAL,
#   y los archivos viven en S3, fuera de ese alcance. La documentación de
#   Supabase lo dice sin rodeos: al restaurar, los metadatos de los buckets
#   aparecen, pero los archivos no están.
#
#   El modo de falla es traicionero. Un restore de la base devuelve las filas
#   de `paciente_fotos` intactas: la ficha del paciente lista sus radiografías
#   y sus fotos de evolución. Ninguna imagen carga. El restore informa éxito
#   sobre una pérdida silenciosa de documentación clínica.
#
#   Pagar el plan Pro no cierra esto. Este script sí.
#
# Uso:   ./respaldar-storage.sh
#
# ⚠️  La salida contiene fotografías clínicas de pacientes identificables.
#     El script produce un tarball CIFRADO y borra el material en claro.
#     No dejes el resultado en Descargas ni lo subas a ningún lado sin cifrar.

set -euo pipefail

DIR_BASE="$HOME/backups-dentaldesk/storage"
SELLO="$(date +%Y%m%d_%H%M%S)"
CRUDO="$DIR_BASE/crudo_$SELLO"
CIFRADO="$DIR_BASE/storage_${SELLO}.tar.gz.gpg"
BUCKETS=("fotos_clinicas" "logos")

echo "──────────────────────────────────────────────"
echo " Respaldo de Storage — $SELLO"
echo "──────────────────────────────────────────────"

if ! command -v gpg >/dev/null 2>&1; then
  echo "❌ Falta gpg. Instalalo con:  brew install gnupg"
  echo "   Sin cifrado no seguimos: la salida son fotos clínicas."
  exit 1
fi

mkdir -p "$CRUDO"
chmod 700 "$DIR_BASE" "$CRUDO"

INICIO=$(date +%s)
declare -a RESUMEN

for BUCKET in "${BUCKETS[@]}"; do
  echo
  echo "▸ Bucket: $BUCKET"

  # Inventario remoto ANTES de bajar nada. Es la única cifra contra la cual
  # comparar: si contáramos solo lo descargado, un fallo parcial se vería
  # idéntico a un backup íntegro.
  REMOTO=$(npx supabase storage ls -r "ss://$BUCKET" --linked --experimental 2>/dev/null \
           | grep -v '/$' | grep -c . || true)
  echo "  remoto:  $REMOTO archivos"

  if [ "$REMOTO" -eq 0 ]; then
    echo "  ⚠️  Bucket vacío o inaccesible. Verificá que estés linkeado:"
    echo "      npx supabase link --project-ref <ref>"
    RESUMEN+=("$BUCKET|0|0|VACIO")
    continue
  fi

  mkdir -p "$CRUDO/$BUCKET"
  npx supabase storage cp -r "ss://$BUCKET" "$CRUDO/$BUCKET" --linked --experimental

  LOCAL=$(find "$CRUDO/$BUCKET" -type f | wc -l | tr -d ' ')
  echo "  local:   $LOCAL archivos"

  if [ "$LOCAL" -ne "$REMOTO" ]; then
    echo
    echo "❌ FALTAN ARCHIVOS: remoto $REMOTO · descargado $LOCAL"
    echo "   El respaldo NO es íntegro. No lo des por bueno."
    exit 1
  fi

  # Un archivo de 0 bytes se descarga sin error y no sirve para nada.
  VACIOS=$(find "$CRUDO/$BUCKET" -type f -size 0 | wc -l | tr -d ' ')
  if [ "$VACIOS" -gt 0 ]; then
    echo "❌ $VACIOS archivos de 0 bytes en $BUCKET."
    find "$CRUDO/$BUCKET" -type f -size 0 | head -5 | sed 's/^/     /'
    exit 1
  fi

  # Que el archivo exista y pese no prueba que sea una imagen válida.
  # `file` lee la cabecera real, no la extensión.
  MUESTRA=$(find "$CRUDO/$BUCKET" -type f | head -1)
  TIPO=$(file -b --mime-type "$MUESTRA")
  echo "  muestra: $(basename "$MUESTRA") → $TIPO"
  case "$TIPO" in
    image/*) : ;;
    *) echo "  ⚠️  La muestra no es una imagen ($TIPO). Revisalo a mano." ;;
  esac

  RESUMEN+=("$BUCKET|$REMOTO|$LOCAL|OK")
done

echo
echo "▸ Empaquetando y cifrando…"
tar -czf - -C "$CRUDO" . | gpg --symmetric --cipher-algo AES256 -o "$CIFRADO"
chmod 600 "$CIFRADO"

# El material en claro no sobrevive al script.
rm -rf "$CRUDO"

FIN=$(date +%s)

echo
echo "──────────────────────────────────────────────"
echo " Listo en $((FIN - INICIO))s"
echo "──────────────────────────────────────────────"
printf '%-18s %8s %8s %s\n' "BUCKET" "REMOTO" "LOCAL" "ESTADO"
for r in "${RESUMEN[@]}"; do
  IFS='|' read -r b rem loc est <<< "$r"
  printf '%-18s %8s %8s %s\n' "$b" "$rem" "$loc" "$est"
done

echo
echo "Archivo cifrado:"
echo "  $CIFRADO  ($(du -h "$CIFRADO" | cut -f1))"
echo
echo "⚠️  ESTE RESPALDO NO ESTÁ VERIFICADO TODAVÍA."
echo
echo "    Un backup que nunca se restauró es una hipótesis. Corré:"
echo "      ./verificar-respaldo-storage.sh \"$CIFRADO\""
echo
echo "Guardalo FUERA de Supabase — disco externo, otro proveedor, o ambos."
echo "Un respaldo que vive en la misma infraestructura que protege no protege."
