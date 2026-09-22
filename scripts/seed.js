require("dotenv").config({
  path: require("path").join(__dirname, "../.env"),
});

const departmentService = require("../src/services/departmentService");
const groupService = require("../src/services/groupService");
const userService = require("../src/services/userService");
const { checkPassword } = require("../src/utils/passwordPolicy");

async function seed() {
  console.log("Seeding canonical departments and community groups...");
  await Promise.all([
    departmentService.ensureSeeded(),
    groupService.ensureSeeded(),
  ]);

  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || "System Administrator";
  if (email && password && !(await userService.findByEmail(email))) {
    const strength = checkPassword(password);
    if (!strength.ok) {
      throw new Error(`INITIAL_ADMIN_PASSWORD is too weak. ${strength.message}`);
    }
    const [firstname, ...rest] = name.split(/\s+/);
    await userService.createUser({
      firstname,
      lastname: rest.join(" "),
      email,
      password,
      role: "admin",
      department: "Administration",
      accountStatus: "active",
      mustChangePassword: false,
    });
    console.log(`Created initial administrator: ${email}`);
  } else if (email) {
    console.log(`Initial administrator already exists: ${email}`);
  }

  console.log("Seed complete.");
}

seed().then(() => process.exit(0)).catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
