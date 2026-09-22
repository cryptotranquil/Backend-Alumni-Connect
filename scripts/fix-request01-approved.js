
// scripts/fix-request01-approved.js
require("dotenv").config();
const db = require("../src/config/firestore");
db.collection("mentorshipRequests").doc("request01")
  .update({ status: "approved" })
  .then(() => { console.log("request01.status -> approved"); process.exit(0); });