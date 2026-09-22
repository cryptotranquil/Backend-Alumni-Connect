// scripts/make-test-admin.js
require("dotenv").config();
const db = require("../src/config/firestore");
db.collection("users").doc("alumni01").update({ role: "admin" }) // TEMP for testing — revert after
  .then(() => { console.log("alumni01 is now role=admin"); process.exit(0); });