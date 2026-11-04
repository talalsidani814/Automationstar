# AUTOMATION STAR

## What is this API?
A JavaScript Express REST API for an in-memory e-commerce checkout demo. It has four business endpoints: Register, Login, Cart, and Checkout. Data is stored in variables and resets on restart.

## Installation
Requires Node.js 18+ and npm.

```bash
npm install
```

## Run
```bash
npm start
```

Default server: http://localhost:3000 (override with the `PORT` environment variable).

## Important URLs

| Method | URL | Description |
| --- | --- | --- |
| POST | http://localhost:3000/register | Register |
| POST | http://localhost:3000/login | Login, get Bearer token |
| POST | http://localhost:3000/cart | Replace authenticated cart |
| POST | http://localhost:3000/checkout | Checkout |
| GET | http://localhost:3000/api-docs | Swagger UI |
| GET | http://localhost:3000/openapi.yaml | OpenAPI YAML |

## Seeded test data

All three demo users have password `Password123!`.

| ID | Name | Email |
| --- | --- | --- |
| 1 | Alice | alice@example.com |
| 2 | Bob | bob@example.com |
| 3 | Charlie | charlie@example.com |

| Product ID | Product | Price | Initial stock |
| --- | --- | --- | --- |
| 1 | Keyboard | 50.00 | 10 |
| 2 | Mouse | 25.00 | 15 |
| 3 | Headphones | 100.00 | 8 |

Prices are illustrative currency units.

## Business rules
- **Cash checkout:** 10% discount on subtotal.
- **Credit-card checkout:** no discount.
- Checkout validates inventory, decreases stock, creates an in-memory order, and clears the cart.
- Cart items must have valid product IDs and positive integer quantities, with no duplicates or insufficient stock.
- Cart and checkout require a Bearer token from login.
- Register requires a unique valid email, nonempty name and password of at least eight characters.
- Credit-card payment is simulated; the API does not charge a card.
- All users, orders, sessions, carts, and inventory changes are reset when the server restarts.

## Example checkout

Log in:

```bash
curl -X POST http://localhost:3000/login -H "Content-Type: application/json" -d '{"email":"alice@example.com","password":"Password123!"}'
```

Copy the returned token and replace `YOUR_TOKEN`:

```bash
curl -X POST http://localhost:3000/cart -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_TOKEN" -d '{"items":[{"productId":1,"quantity":2},{"productId":2,"quantity":1}]}'
curl -X POST http://localhost:3000/checkout -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_TOKEN" -d '{"paymentMethod":"cash"}'
```

Subtotal: **125.00**. Cash discount: **12.50**. Total: **112.50**. Credit-card total would be **125.00**.

## API documentation
See [openapi.yaml](openapi.yaml) or the Swagger UI at `/api-docs`.

No automated tests are included, as requested.
