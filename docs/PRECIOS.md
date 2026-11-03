# Propuesta de precios (valores iniciales, editables en el panel maestro)

Criterios: precios **bajos** para entrar al mercado nicaragüense y latinoamericano, con planes que crecen por número de estudiantes y por funciones. Tipo de cambio de referencia: C$ 36.62 por US$ 1. Los montos en córdobas se redondearon a cifras terminadas en 5 o 9.

> Nota: esta propuesta se basa en criterios de mercado (el costo de unas pocas clases particulares al mes, o de una mensualidad por alumno). **No se hizo un estudio formal de la competencia.** Conviene validarla con 5 a 10 clientes reales antes de fijarla.

## Profesor independiente

| Plan | US$/mes | C$/mes | Estudiantes | Grupos | Extras |
|---|---|---|---|---|---|
| Básico | 4 | 149 | 30 | 4 | Asistencia, notas, tareas, calendario |
| Profesional | 8 | 295 | 120 | 15 | + Informes PDF, exportar CSV |
| Premium | 14 | 515 | 400 | Sin límite | + 1 asistente con su propio código |

## Academias y centros de cursos

| Plan | US$/mes | C$/mes | Estudiantes | Instructores | Admins | Extras |
|---|---|---|---|---|---|---|
| Inicial | 19 | 699 | 150 | 5 | 1 | Finanzas, horarios |
| Profesional | 39 | 1,429 | 500 | 20 | 4 | + Certificados, comunicados |
| Empresarial | 69 | 2,529 | 2,000 | Sin límite | 15 | + Portal de familias, auditoría |

## Colegios

| Plan | US$/mes | C$/mes | Estudiantes | Docentes | Admins | Extras |
|---|---|---|---|---|---|---|
| Esencial | 49 | 1,795 | 400 | 30 | 4 | Notas, boletines, horarios, certificados, comunicados |
| Avanzado | 99 | 3,625 | 1,200 | 80 | 10 | + Colegiaturas, portal de padres, auditoría |
| Institucional | 179 | 6,555 | 5,000 | Sin límite | Sin límite | + Varias sedes |

Referencia: un colegio de 400 estudiantes en el plan Esencial paga unos **C$ 4.50 por estudiante al mes**.

## Decisiones de negocio pendientes (tuyas)

1. **Cobro:** hoy los pagos se registran a mano (transferencia o depósito). El cobro automático con tarjeta necesita elegir pasarela (por ejemplo PayPal, Stripe donde aplique, o una pasarela local) y abrir una cuenta comercial.
2. **Pago anual con descuento** (por ejemplo, 2 meses gratis): la base ya lo soporta (`meses` en el pago), falta definir el descuento.
3. **Días de prueba:** 14 por defecto (`publico.dias_prueba`).
4. **Días de gracia:** 5 por defecto en cada suscripción.
