-- =====================================================================
-- DOCENCIA360 · 05 · Planes iniciales, configuración y tareas programadas
-- Los precios y límites se editan desde el Panel Maestro; estos son
-- solo los valores de arranque (ver docs/PRECIOS.md).
-- =====================================================================
insert into public.planes(id, modalidad, nombre, orden, resumen, precio_usd, precio_nio,
  max_estudiantes, max_docentes, max_grupos, max_admins, almacenamiento_mb, funciones) values
('prof_basico','profesor','Básico',1,'Para empezar con tus primeras clases particulares',
  4, 149, 30, 0, 4, 0, 200,
  '{"tareas":true,"calendario":true,"reportes_pdf":false,"exportar":false,"asistentes":false}'),
('prof_profesional','profesor','Profesional',2,'Para tutores con varios grupos y reportes',
  8, 295, 120, 0, 15, 0, 1024,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"asistentes":false}'),
('prof_premium','profesor','Premium',3,'Sin límite de grupos y con un asistente',
  14, 515, 400, 1, null, 0, 3072,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"asistentes":true}'),

('acad_inicial','academia','Inicial',1,'Academias pequeñas que empiezan a ordenarse',
  19, 699, 150, 5, 12, 1, 2048,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"finanzas":true,"certificados":false,"comunicados":false,"portal_familias":false,"horarios":true}'),
('acad_profesional','academia','Profesional',2,'Cobros, certificados y comunicación con alumnos',
  39, 1429, 500, 20, 60, 4, 10240,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"finanzas":true,"certificados":true,"comunicados":true,"portal_familias":false,"horarios":true}'),
('acad_empresarial','academia','Empresarial',3,'Varias áreas, muchos instructores y portal de familias',
  69, 2529, 2000, null, null, 15, 51200,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"finanzas":true,"certificados":true,"comunicados":true,"portal_familias":true,"horarios":true,"auditoria":true}'),

('col_esencial','colegio','Esencial',1,'Lo académico del colegio: notas, asistencia y boletines',
  49, 1795, 400, 30, null, 4, 10240,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"boletines":true,"horarios":true,"finanzas":false,"certificados":true,"comunicados":true,"portal_familias":false}'),
('col_avanzado','colegio','Avanzado',2,'Suma cobros de colegiatura y el portal de padres',
  99, 3625, 1200, 80, null, 10, 51200,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"boletines":true,"horarios":true,"finanzas":true,"certificados":true,"comunicados":true,"portal_familias":true,"auditoria":true}'),
('col_institucional','colegio','Institucional',3,'Instituciones grandes, varias sedes y sin límites de personal',
  179, 6555, 5000, null, null, null, 204800,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"boletines":true,"horarios":true,"finanzas":true,"certificados":true,"comunicados":true,"portal_familias":true,"auditoria":true,"sedes":true}');

insert into public.config_global(clave, valor, descripcion) values
('publico.dias_prueba', '14', 'Días de prueba gratis para cuentas nuevas'),
('publico.tipo_cambio', '36.62', 'Córdobas por dólar (referencial)'),
('publico.contacto_whatsapp', '""', 'Número de WhatsApp de ventas, con código de país'),
('publico.inactividad_minutos', '60', 'Minutos sin actividad antes de cerrar la sesión'),
('dias_gracia_defecto', '5', 'Días de gracia tras el vencimiento antes de suspender');

-- Tarea diaria (06:05 UTC = 00:05 en Nicaragua)
create extension if not exists pg_cron;
select cron.schedule('d360-tareas-diarias', '5 6 * * *', $$select public.d360_tareas_diarias()$$);
