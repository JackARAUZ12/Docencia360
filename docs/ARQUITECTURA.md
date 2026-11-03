# Arquitectura de Docencia360

## Principios

1. **Una base, tres productos.** Las tres modalidades comparten tablas (estudiantes, grupos, asistencia, notas…) pero cada una tiene su propio panel, su propia navegación y sus propios módulos. El código común vive en `assets/js/core/`.
2. **El servidor decide.** Permisos, límites de plan, aislamiento entre cuentas, promedios y estados de suscripción se calculan en Postgres. La interfaz solo muestra.
3. **Sin compilación.** Módulos ES nativos y una librería incluida en el proyecto. Barato de alojar y fácil de mantener.

## Modelo de datos (resumen)

```
plataforma_admins ─ dueño(s) del SaaS
planes ─ 9 planes (3 por modalidad): precios C$/US$, límites, funciones (jsonb)
cuentas ─ cada profesor/academia/colegio. modalidad + código de institución
  ├─ suscripciones (1:1) ─ plan, estado, vence, días de gracia
  ├─ pagos_suscripcion ─ historial de pagos del SaaS
  ├─ miembros ─ personas con acceso: propietario, director, coordinador,
  │             administrativo, finanzas, docente, tutor (padre/madre)
  │    └─ miembros_secretos ─ hash HMAC del código personal (inaccesible por API)
  ├─ periodos, niveles, grados, aulas, asignaturas, cursos
  ├─ grupos (grupo o sección) ─ grupo_docentes, grupo_estudiantes, horarios
  ├─ estudiantes ─ observaciones, tutores_estudiantes
  ├─ asistencias, asistencia_docentes
  ├─ evaluaciones (incluye tareas) ─ calificaciones
  ├─ eventos (calendario), comunicados, notificaciones
  ├─ matriculas, cargos, pagos (finanzas de academia/colegio)
  └─ certificados
auditoria ─ registro de operaciones sensibles
```

Todas las tablas de clientes llevan `cuenta_id`, RLS activo y un disparador que impide referenciar filas de otra cuenta.

## Acceso con código

Se reutilizó de Negocio360 **solo el concepto**: el dueño entra con correo y contraseña, y el resto del equipo entra con un código, que se verifica en el servidor y bloquea tras varios intentos. La implementación es nueva y más estricta:

| | Negocio360 | Docencia360 |
|---|---|---|
| Identidad | Todos los perfiles comparten la sesión del dueño | **Cada persona tiene su propio usuario de Auth**: RLS sabe quién es |
| Código | PIN elegido; hash en el navegador para empleados | Código de 6 dígitos **generado por el servidor**; HMAC-SHA256 con *pepper* secreto |
| Entrada | Correo del dueño + PIN | **Código de institución (6) + código personal (6)** |
| Bloqueo | Por cuenta | 5 fallos por IP+institución y 30 por institución → 15 min |

Flujo:

1. El navegador envía `{institucion, codigo}` a la Edge Function `acceso-codigo`.
2. La función llama a `d360_canjear_codigo` (solo `service_role` puede ejecutarla). Esta función valida el formato, aplica el bloqueo, busca el hash y registra el intento en auditoría.
3. Si es el primer acceso del miembro, la función le crea un usuario de Auth interno (`m-<id>@miembros.docencia360.app`, sin contraseña) y lo vincula.
4. La función genera un token de un solo uso (`generateLink` de tipo magiclink; no envía correo). El navegador lo canjea con `verifyOtp` y obtiene una sesión normal de Supabase.
5. `destinoTrasLogin` lleva a la persona al panel de su modalidad.

**Recuperación:** el dueño usa «Olvidé mi contraseña» (correo). Cualquier otra persona pide un código nuevo a la administración (`d360_regenerar_codigo`), lo que invalida el anterior. Si se desactiva a un miembro, pierde acceso a los datos de inmediato: RLS comprueba `activo` en cada consulta.

**Sesión:** se cierra sola tras `publico.inactividad_minutos` sin actividad (60 por defecto), pensando en computadoras compartidas. Si se cierra la sesión en una pestaña, se cierra en todas.

## Suscripciones y planes

- Precios, límites y funciones se leen de la tabla `planes` y se editan en el panel maestro. No hay precios escritos en el código.
- `d360_validar_limite` se ejecuta en disparadores antes de crear estudiantes o grupos y dentro de `d360_crear_miembro`. La interfaz muestra el mensaje del servidor.
- `d360_tiene_funcion(cuenta, 'finanzas')` protege por RLS las tablas de módulos de pago (finanzas, certificados, comunicados, portal de familias).
- Estados de una suscripción: `prueba` → `activa` → `vencida` (dentro de los días de gracia se puede seguir escribiendo) → `suspendida` (solo lectura; el acceso con código se bloquea).

## Automatizaciones (pg_cron, todos los días a las 00:05 hora de Nicaragua)

`d360_tareas_diarias()`:

- vence y suspende suscripciones;
- avisa 7 y 2 días antes del vencimiento;
- alerta de cobros vencidos (academia y colegio);
- avisa de evaluaciones del día anterior sin calificar;
- marca como completadas las matrículas de grupos finalizados;
- limpia los intentos de acceso viejos.

Calculados al momento, sin procesos manuales: promedios ponderados (`d360_promedios_grupo`), estadísticas de asistencia (`d360_resumen_asistencia`), resumen del panel (`d360_resumen_panel`), saldo de cada cobro y número de recibo correlativo (disparadores).

## Frontend

- `core/sb.js`: cliente único y traducción de errores a mensajes claros.
- `core/sesion.js`: protección de páginas por modalidad, cuenta activa e inactividad.
- `core/ui.js`: `h()` para construir DOM, modales, formularios declarativos, tablas tipo registro, *toasts*, formatos (fecha, C$/US$).
- `profesor/app.js`: estructura (riel lateral en computadora y barra inferior en teléfono), enrutador por hash, caché de datos compartida.
- Cada módulo exporta `render(el, ctx, {partes, params})`.

## Etapa 2: Academias

### Roles y menú
| Rol | Ve |
|---|---|
| propietario, director, subdirector, coordinador, administrativo | Todo el panel; finanzas solo propietario, director y administrativo |
| finanzas | Inicio, estudiantes (lectura), matrículas, finanzas, informes |
| docente (instructor) | Inicio, **sus** grupos, asistencia, evaluaciones, actividades y calendario |

El menú se arma según el rol. Aun así, la seguridad la aplica RLS: si alguien abre una ruta a mano, el servidor no le devuelve ni le deja escribir lo que no le corresponde.

### Flujo de matrícula (`d360_matricular`, una sola transacción)
1. Valida el permiso, la vigencia del plan, el estudiante activo, el grupo abierto y que no haya matrícula duplicada.
2. Crea la matrícula y la inscripción en el grupo. El disparador de cupo impide pasarse del límite.
3. Si el plan incluye finanzas, genera el cobro de matrícula y N mensualidades. Cada mensualidad vence el día de pago elegido, se ajusta a meses cortos y aplica el descuento o la beca.

Las acciones posteriores también son funciones del servidor:
- **Renovar** (`d360_renovar_matricula`) genera mensualidades a continuación de la última.
- **Retirar** (`d360_retirar_matricula`) cierra la matrícula, retira del grupo y anula los cobros futuros sin abonos.

### Finanzas
- Un pago no puede superar el saldo del cobro, y su recibo es correlativo por cuenta.
- Un pago registrado **no se edita**: solo se anula. Al anularlo, el saldo del cobro se recalcula solo.
- Un cobro con abonos no se puede anular, y uno anulado no se reactiva.
- Cada alta, cambio o anulación queda en la auditoría.

### Certificados
- Cada certificado tiene un folio único (`CÓDIGO-AA-XXXXXX`).
- `verificar.html` permite a cualquiera comprobarlo con `d360_verificar_certificado`, que solo muestra los datos mínimos.
- Un certificado anulado aparece como ANULADO.
- La plantilla (textos y firmas) se guarda en `cuentas.config.certificado`.

### Automatización adicional
`d360_recordatorios_cobro()` se ejecuta a diario a las 00:10 (hora de Nicaragua) y avisa a la administración de los cobros que vencen en 3 días.
