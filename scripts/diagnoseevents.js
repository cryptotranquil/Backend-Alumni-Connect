// One-off diagnostic — safe to delete after the malformed doc is found and fixed.
// Run from the backend/ root: node scripts/diagnose-events.js
require("dotenv").config();
const db = require("../src/config/firestore");

async function main() {
  const eventsRef = db.collection("events");
  const snap = await eventsRef.get();

  console.log(`Found ${snap.size} document(s) in "events":\n`);

  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`--- ${doc.id} ---`);
    console.log(JSON.stringify(data, null, 2));

    if (!("createdBy" in data)) {
      console.log(`  ⚠️  no "createdBy" field at all`);
    } else if (typeof data.createdBy !== "string" || data.createdBy.trim() === "") {
      console.log(
        `  ⚠️  "createdBy" is present but invalid: ${JSON.stringify(data.createdBy)} (type: ${typeof data.createdBy})`,
      );
    }

    // A stray "(string)" badge in the Console's collection tree usually means
    // a document has a subcollection hanging off it — check for that directly
    // instead of guessing from the UI.
    const subcollections = await doc.ref.listCollections();
    if (subcollections.length > 0) {
      console.log(`  ⚠️  has subcollection(s): ${subcollections.map((c) => c.id).join(", ")}`);
    }

    console.log("");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Diagnostic script failed:", err);
  process.exit(1);
});