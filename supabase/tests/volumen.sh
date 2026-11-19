#!/usr/bin/env bash
# Prueba de volumen en un Postgres local (base aparte «vol»): genera una academia
# del plan Empresarial al máximo y mide las consultas de cada pantalla por rol.
set -u
cd "$(dirname "$0")/.."
D=/var/tmp/d360pg; PORT=5433
if ! psql -h $D -p $PORT -U postgres -tAc "select 1" >/dev/null 2>&1; then
  rm -f $D/data/postmaster.pid
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log start" >/dev/null; sleep 2
fi
P="psql -h $D -p $PORT -U postgres -q"
$P -c "drop database if exists vol" -c "create database vol" >/dev/null
$P -d vol -f tests/stub_supabase.sql >/dev/null 2>&1
for f in migrations/202611*_[0-9][0-9]_*.sql; do
  case $f in *_00_*) continue;; esac
  if [[ $f == *_05_* ]]; then sed '/plataforma_admins/,$d' $f | $P -d vol -v ON_ERROR_STOP=1 >/dev/null 2>&1 || echo "MIGRACIÓN FALLÓ: $f"
  else sed '/cron.schedule/d' $f | $P -d vol -v ON_ERROR_STOP=1 >/dev/null 2>&1 || echo "MIGRACIÓN FALLÓ: $f"; fi
done
time $P -d vol -f tests/volumen.sql 2>&1 | grep -v "^NOTICE"
