require("dotenv").config();
if (
  process.env.NODE_ENV === "production" &&
  !process.env.APP_ORIGIN?.startsWith("https://")
)
  throw new Error(
    "Set APP_ORIGIN to the HTTPS origin serving this CRM in production.",
  );
const app = require("./app");

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`CRM backend running on http://localhost:${PORT}`);
});
