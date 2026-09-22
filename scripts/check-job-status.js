// scripts/check-job-status.js
// Read-only — just prints the real value, doesn't change anything.
require("dotenv").config();
const db = require("../src/config/firestore");

db.collection("jobPosts").doc("job01").get()
  .then((snap) => {
    if (!snap.exists) {
      console.log("job01 not found in jobPosts collection.");
      process.exit(0);
    }
    const data = snap.data();
    console.log("job01.status =", JSON.stringify(data.status));
    console.log("job01.type   =", JSON.stringify(data.type));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error reading job01:", err);
    process.exit(1);
  });