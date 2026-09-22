const db = require("../config/firestore");
const { createRosterStore } = require("./rosterStore");

module.exports = createRosterStore(db);
