// scripts/delete-stray-admin.js
require("dotenv").config();
const db = require("../src/config/firestore");
db.collection("users").doc("adadmin-uid").delete()
  .then(() => { console.log("adadmin-uid deleted"); process.exit(0); });