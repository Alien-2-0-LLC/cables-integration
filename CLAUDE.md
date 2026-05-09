# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Hub de integración Node.js (Express 5) que sincroniza **inventario y órdenes entre Odoo y Mercado Libre**. La estructura está preparada para Amazon y Shopify, pero esos paths están **comentados** en `server.js` — sólo Mercado Libre + Odoo están activos hoy.

## Stack

- Express 5, Mongoose 8, Bull 4 (declarado, uso limitado), `node-cron`
- `xmlrpc` para hablar con Odoo
- MongoDB (orders + tokens)
- Postgres (lo levanta `docker-compose` para Odoo, no para la app)

## Comandos

```bash
npm install
npm run dev               # nodemon server.js — desarrollo
docker compose up         # app + mongo + odoo + postgres (odoo db)
docker compose -f docker-compose.prod.yml up
```

No hay tests configurados (`"test"` devuelve error). No hay lint script aunque ESLint y Prettier están en devDeps.

## Arquitectura

```
server.js                 ← entry: conecta Mongo, instancia services, monta rutas, levanta crons
src/
├── services/
│   ├── mercadolibre/     ← meliAPI.js (HTTP raw) + meliService.js (lógica) + transformers.js
│   ├── amazon/           ← preparado, NO usado (rutas comentadas en server.js)
│   ├── shopify/          ← preparado, NO usado
│   └── odooService.js    ← cliente XML-RPC compartido (clase, se instancia)
├── routes/               ← meliRoutes.js, odooRoutes.js  (factories: reciben service y devuelven router)
├── controller/           ← OJO: SINGULAR, no "controllers"
├── models/               ← MeliOrder.js, MeliToken.js (Mongoose)
├── workers/              ← pollOrdersWorker.js
└── public/               ← assets estáticos (página de éxito post-OAuth)
```

**Patrón importante**: las rutas son **factories** — `module.exports = (meliService) => { ... return router }`. `server.js` instancia los services y los inyecta. No requieras directamente el módulo de servicio dentro de las rutas; pedilo por parámetro (excepción: `meliRoutes.js` también requiere `odooService` directo, herencia del patrón viejo).

## Webhooks de Mercado Libre

Endpoint único: `POST /api/meli/notifications`. Despacha por `body.topic`:

| Topic | Qué hace |
|---|---|
| `orders_v2` | Idempotencia por `orderId` en Mongo (`MeliOrder`); si no existe, baja la orden y la procesa |
| `shipments` | Si `shipment.status === "delivered"` (o substatus contiene `"delivered"`), llama `odooService.updateShipmentStatus(odoo_id, "done", shipping_id)` y marca la orden completada en Mongo. Después llama `checkInventory()` |
| `fbm_stock_operations` | Sólo `INBOUND_RECEPTION`: mueve stock de `ML/En Camino` → `ML/Existencias (full)` en Odoo |

**Convención**: siempre devolver `200` (incluso ante errores controlados) para que Mercado Libre no reintente eternamente. Sólo devolver `500` ante fallas no manejadas.

## OAuth Mercado Libre

`GET /api/meli/auth/user?code=...` recibe el callback de ML, intercambia el código y dispara `automaticAccessToken()`. URL para iniciar el flujo está en el README del subproyecto.

## Crons

`server.js` registra dos:
- **Cada 5 horas** (`0 */5 * * *`): refresca el access token de ML.
- **Diario 00:00** (`0 0 * * *`): hace `GET http://localhost:${PORT}/api/meli/check-inventory` (sí, se llama a sí mismo por HTTP — no refactorices a llamada directa sin avisar, hay razones de aislamiento de errores).

## Variables de entorno

Ver `.env.example`. Mínimas para correr ML + Odoo: `MONGODB_URI`, `MELI_CLIENT_ID`, `MELI_CLIENT_SECRET`, `MELI_REDIRECT_URI`, `ODOO_XMLRPC_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_PASS`.

## Gotchas

- **`controller/` en singular**, no `controllers/`. Si vas a importar, mirá el path real.
- Las rutas y services de Amazon/Shopify existen pero están comentados en `server.js`. **No los actives sin confirmar** — pueden tener código incompleto.
- `server.js` instancia tanto `meliService` como `odooSer`, y `meliRoutes.js` también instancia su propio `odooService` adentro. Hay duplicación de instancias; antes de "limpiar" eso, verificá si hay estado por instancia.
- Bull está en `dependencies` pero el uso es marginal — no asumas un sistema de colas establecido.
