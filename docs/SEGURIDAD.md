# Seguridad

## Aislamiento entre cuentas

- **RLS en todas las tablas.** Las políticas usan funciones `SECURITY DEFINER` con `search_path` fijo: `d360_mi_rol(cuenta)`, `d360_es_gestor`, `d360_es_finanzas`, `d360_docente_de_grupo`, `d360_es_tutor_de`.
- **Referencias cruzadas bloqueadas.** El disparador `d360_misma_cuenta` impide que una fila de tu cuenta apunte a un estudiante, grupo o evaluación de otra, aunque alguien conozca el ID.
- **`cuenta_id` inmutable.** Ninguna fila se puede «mover» de cuenta.

## Roles

| Rol | Puede |
|---|---|
| propietario, director | Todo en su cuenta, incluidos usuarios y datos de la cuenta |
| subdirector, coordinador, administrativo | Estructura académica, expedientes, usuarios (excepto directivos) |
| finanzas | Matrículas, cobros y pagos |
| docente | Ver la cuenta; pasar lista, evaluar y calificar **solo en sus grupos** |
| tutor (padre o madre) | Solo sus hijos: notas, asistencia, cobros y comunicados dirigidos a él |

## Secretos

- La clave `service_role` **solo** existe dentro de la Edge Function. El navegador usa la clave *publishable*.
- `miembros_secretos`, `secretos_servidor` y `acceso_intentos` tienen RLS sin políticas: no se pueden leer por la API.
- Los códigos personales se guardan como HMAC-SHA256 con un *pepper* aleatorio del servidor. Se muestran una sola vez al crearlos.
- Las funciones internas y las de los disparadores no se pueden ejecutar desde la API (`revoke execute`). Ninguna función `d360_*` es invocable sin sesión.

## Suscripción y permisos

- Si el plan venció y pasaron los días de gracia, las políticas de escritura fallan (solo lectura).
- Con la cuenta suspendida, el acceso con código se rechaza.

## Auditoría

Quedan registrados en `auditoria`:

- accesos con código, exitosos y fallidos (con IP);
- cuentas creadas;
- usuarios creados o editados, y códigos regenerados;
- pagos y cobros (alta, cambio, anulación);
- calificaciones modificadas o borradas;
- estudiantes borrados;
- certificados y matrículas;
- cambios de suscripción, planes, promociones y parámetros.

## Pruebas automatizadas (`supabase/tests/rls_test.sql`)

1. Una cuenta no ve los datos de otra.
2. Una cuenta no puede insertar en otra.
3. Las referencias cruzadas se rechazan.
4. Nadie puede canjear códigos fuera del servidor.
5. Los secretos no son legibles.
6. El panel maestro está protegido.
7. Los precios no se pueden alterar desde una cuenta.
8. Un docente no asignado no puede evaluar.
9. Un docente no puede crear expedientes.
10. Un docente asignado sí puede evaluar.
11. El límite de estudiantes del plan se respeta.
12. El promedio ponderado es correcto (80 × 60 % + 50 × 40 % = 68).
13. Una cuenta vencida queda en solo lectura.
14. El canje correcto funciona.
15. El bloqueo se activa tras 5 intentos, incluso si después se usa el código correcto.
16. El bloqueo expira correctamente.

## Recomendaciones pendientes (configuración en Supabase, no en código)

- Activar **Leaked Password Protection** (Authentication → Policies).
- Definir `D360_ORIGENES` en la Edge Function con el dominio de producción.
- Revisar en Authentication → URL Configuration que solo esté permitido tu dominio.
