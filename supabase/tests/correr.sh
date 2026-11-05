#!/usr/bin/env bash
# Corre las pruebas SQL en un Postgres local (cada archivo en una base limpia).
# Uso: bash supabase/tests/correr.sh   (requiere PostgreSQL 16 instalado)
set -u
cd "$(dirname "$0")/.."
D=/var/tmp/d360pg; PORT=5433
if ! psql -h $D -p $PORT -U postgres -tAc "select 1" >/dev/null 2>&1; then
  [ -d $D/data ] || { mkdir -p $D && chown postgres $D && su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $D/data -A trust >/dev/null"; }
  rm -f $D/data/postmaster.pid
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log start" >/dev/null; sleep 2
fi
P="psql -h $D -p $PORT -U postgres -q"
preparar() {
  $P -c "drop database if exists t" -c "create database t" >/dev/null
  $P -d t -f tests/stub_supabase.sql >/dev/null 2>&1
  for f in migrations/202611*_[0-9][0-9]_*.sql; do
    case $f in *_00_*) continue;; esac                       # limpieza de la versión anterior: solo en producción
    if [[ $f == *_05_* ]]; then sed '/plataforma_admins/,$d' $f | $P -d t -v ON_ERROR_STOP=1 >/dev/null || echo "MIGRACIÓN FALLÓ: $f"
    else sed '/cron.schedule/d' $f | $P -d t -v ON_ERROR_STOP=1 >/dev/null || echo "MIGRACIÓN FALLÓ: $f"; fi
  done
}
total=0; fallos=0
for t in tests/*_test.sql; do
  preparar
  salida=$($P -d t -f $t 2>&1)
  ok=$(grep -c "OK " <<<"$salida"); total=$((total+ok))
  if grep -qE "FALLO|ERROR" <<<"$salida"; then fallos=$((fallos+1)); echo "✗ $t"; grep -E "FALLO|ERROR" <<<"$salida" | head -5
  else echo "✓ $t ($ok comprobaciones)"; fi
done
echo "Total: $total comprobaciones correctas, $fallos archivo(s) con fallos"
