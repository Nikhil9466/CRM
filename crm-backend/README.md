# Virtual Binz CRM — Backend

Auth-only slice for now: signup and login, matching the frontend's `signup.html` / `login.html`.

## Stack
- Node.js + Express
- PostgreSQL via Prisma ORM
- bcrypt for password hashing, JWT for session tokens
- multer for profile photo uploads

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the env template and fill in your own values:
   ```bash
   cp .env.example .env
   ```
   At minimum, set `DATABASE_URL` to a real Postgres connection string and
   `JWT_SECRET` to a random string.

3. Create the database tables:
   ```bash
   npm run prisma:migrate
   ```

4. Start the server:
   ```bash
   npm run dev
   ```
   The API runs on `http://localhost:4000` by default.

## Endpoints

### `POST /api/auth/signup`
`multipart/form-data` (so the photo file can ride along):
| field    | type   | rules                                      |
|----------|--------|---------------------------------------------|
| name     | text   | required, ≤20 chars                          |
| email    | text   | required, must end in @gmail.com             |
| password | text   | required, 6–20 chars, ≥1 special character   |
| phone    | text   | required, exactly 10 digits                  |
| orgId    | text   | required                                     |
| photo    | file   | optional, image only, ≤5MB                   |

Returns `201` with `{ user, token }`, or `400` with `{ errors: { field: message } }`.

### `POST /api/auth/login`
`application/json`:
```json
{ "email": "you@gmail.com", "password": "yourPassword1!" }
```
Returns `200` with `{ user, token }`, or `401` if the credentials don't match.

## Wiring up the frontend

In `signup.html` / `login.html`, replace the `console.log("Form data", …)` block
in the submit handler with a real `fetch` call. For signup, since there's a file
involved, build a `FormData` object instead of `JSON.stringify`:

```js
const formData = new FormData();
formData.append("name", nameInput.value);
formData.append("email", document.getElementById("email").value);
formData.append("password", document.getElementById("password").value);
formData.append("phone", document.getElementById("phone").value);
formData.append("orgId", document.getElementById("orgId").value);
if (document.getElementById("photo").files[0]) {
  formData.append("photo", document.getElementById("photo").files[0]);
}

const res = await fetch("http://localhost:4000/api/auth/signup", {
  method: "POST",
  body: formData,
});
const data = await res.json();
```

Store `data.token` (e.g. in memory or a cookie set by the backend) and send it
as `Authorization: Bearer <token>` on future requests once protected routes exist.

## Not built yet
- Auth middleware to protect future routes (contacts, deals, etc.)
- Organisation model (orgId is currently a free-text string)
- Password reset flow (the "Forgot password?" link on the login page is a stub)
