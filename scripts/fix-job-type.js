// scripts/fix-job-type.js
require("dotenv").config();
const db = require("../src/config/firestore");
db.collection("jobPosts").doc("job01").update({ type: "full-time" })
  .then(() => { console.log("job01.type -> full-time"); process.exit(0); });