// scripts/approve-alumni01.js
require("dotenv").config();
const db = require("../src/config/firestore");
db.collection("users").doc("alumni01")
  .update({ accountStatus: "active" })
  .then(() => { console.log("alumni01 approved"); process.exit(0); });