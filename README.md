# Finanzas

App de escritorio local (Electron + React + SQLite) para llevar cuentas de débito, tarjetas de crédito,
movimientos, categorías y compras a meses sin intereses. Los datos se quedan en tu equipo.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Abre la app en modo desarrollo con recarga en caliente |
| `npm test` | Pruebas de la lógica pura (dinero, fechas, MSI) |
| `npm run test:db` | Pruebas contra SQLite real, usando el Node de Electron |
| `npm run typecheck` | Revisión de tipos |
| `npm run dist` | Genera el instalador `.dmg` en `dist/` |

Después de `npm install`, `better-sqlite3` se recompila para Electron (`postinstall`). Si npm bloquea
el script de instalación, apruébalo con `npm install-scripts approve better-sqlite3`.

## Dónde están mis datos

- Base: `~/Library/Application Support/finanzas/finanzas.db` (en Windows, `%APPDATA%\Finanzas\finanzas.db`).
- Respaldos automáticos: carpeta `backups/` junto a la base, o la que elijas en **Respaldo y exportación**.
  Se crea uno al abrir la app (si no hay del día) y se sobrescribe al cerrarla; se conservan 30 días.
  Al restaurar, antes se guarda `finanzas-antes-de-restaurar-*.db`, que nunca se borra sola.
- Exportación a CSV (movimientos, cuentas, calendario MSI): UTF-8 con BOM para Excel, montos con punto
  decimal y dos decimales; textos que empiezan con `=`, `+`, `-` o `@` se neutralizan para que Excel no
  los ejecute como fórmula.

## Cómo funciona el modelo

- Los montos se guardan en **centavos (enteros)**. Los saldos no se guardan: se calculan como
  `saldo inicial + suma de movimientos`.
- En las **tarjetas de crédito**, el saldo es negativo cuando debes. Un gasto con tarjeta aumenta la deuda.
- Un **pago de tarjeta** es una transferencia de débito a crédito: crea dos movimientos ligados, y al
  borrar uno se borran ambos.
- Una **compra a meses sin intereses** carga el total a la tarjeta el día de la compra (así lo aparta el
  banco) y genera el calendario de cuotas. Si la tarjeta tiene día de corte y de pago, la fecha del
  primer pago se calcula sola. Cada cuota se marca como pagada a mano, o en bloque con "Marcar pagadas"
  para las que ya vencieron.
- En el resumen y en el presupuesto, el gasto del mes cuenta solo **la cuota de MSI del mes**, no el
  total de la compra.

## Presupuesto (cajitas)

- **Por asignar** = saldos iniciales de débito/efectivo + ingresos (y entradas sin categoría) − todo lo
  asignado. Un gasto sin categoría en débito sale directo de aquí.
- Cada categoría de gasto es una cajita: `disponible = lo que sobró del mes anterior + asignado + actividad`.
  Lo que sobra o falta se arrastra al mes siguiente.
- Cada tarjeta tiene su cajita **Pago <tarjeta>**, que se crea, renombra y archiva sola con la cuenta.
  Al gastar con tarjeta en una categoría (o al vencer una cuota de MSI), ese monto pasa de la categoría a
  la cajita de pago. Al pagar la tarjeta con una transferencia, sale de ahí. La deuda que ya tenías antes de
  usar la app no tiene dinero apartado: asígnale lo que quieras destinar a pagarla.
- El cálculo vive en `src/shared/budget.ts` (arrastre mes a mes) y `src/main/budget.ts` (consultas SQL).

## Reportes

Usan la misma definición de gasto que el presupuesto (`CATEGORY_ACTIVITY_SQL`): las compras a meses cuentan
con la cuota de cada mes, los reembolsos restan y los gastos sin categoría aparecen como «Sin categoría».
Las transferencias y pagos de tarjeta no son gasto.

## Estructura

```
src/shared/    tipos, contrato de la API y lógica pura (dinero, fechas, MSI) con pruebas
src/main/      proceso principal: SQLite, migraciones y API (lo único que toca la base de datos)
src/preload/   puente seguro que expone window.api a la interfaz
src/renderer/  interfaz en React y Tailwind
```

Para cambiar el esquema, agrega una migración nueva al final de `src/main/db/migrations.ts`.
Nunca edites una que ya se aplicó.
