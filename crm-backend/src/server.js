require("dotenv").config();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith("replace-with"))
  throw new Error("Set JWT_SECRET to a random secret of at least 32 characters in .env.");
const app = require("./app");

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`CRM backend running on http://localhost:${PORT}`);
});
