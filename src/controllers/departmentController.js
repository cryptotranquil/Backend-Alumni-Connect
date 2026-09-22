const departmentService = require("../services/departmentService");
const userService = require("../services/userService");
const formatDepartment = require("../utils/formatDepartment");

// ========== PUBLIC ==========

/** GET /departments — active departments only, for the registration dropdown etc. */
exports.listActive = async (req, res) => {
  try {
    const departments = await departmentService.listActive();
    res.json({ success: true, departments: departments.map(formatDepartment) });
  } catch (error) {
    console.error("List active departments error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ========== ADMIN ==========

/** GET /admin/departments/all — everything, including inactive. */
exports.listAll = async (req, res) => {
  try {
    const departments = await departmentService.listAll();
    res.json({ success: true, departments: departments.map(formatDepartment) });
  } catch (error) {
    console.error("List all departments error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** POST /admin/departments */
exports.create = async (req, res) => {
  try {
    const { name, code, description } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: "Department name is required." });
    }
    const existing = await departmentService.findByName(name);
    if (existing) {
      return res.status(400).json({ success: false, message: "A department with that name already exists." });
    }
    const department = await departmentService.create({ name, code, description });
    res.status(201).json({ success: true, department: formatDepartment(department) });
  } catch (error) {
    console.error("Create department error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** PUT /admin/departments/:id */
exports.update = async (req, res) => {
  try {
    const existing = await departmentService.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }
    const { name, code, description, isActive } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ success: false, message: "Department name cannot be empty." });
    }
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (code !== undefined) patch.code = code;
    if (description !== undefined) patch.description = description;
    if (isActive !== undefined) patch.isActive = !!isActive;

    const department = await departmentService.update(req.params.id, patch);
    res.json({ success: true, department: formatDepartment(department) });
  } catch (error) {
    console.error("Update department error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** DELETE /admin/departments/:id */
exports.remove = async (req, res) => {
  try {
    const existing = await departmentService.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }
    await departmentService.remove(req.params.id);
    res.json({ success: true, message: "Department deleted" });
  } catch (error) {
    console.error("Delete department error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** GET /admin/departments/stats — student/alumni/total counts per department.
 *  Mirrors the departmentDistribution logic already used in
 *  adminService.getDashboardStats, but scoped to every known department
 *  (not just the top 10 with the most users), so newly created empty
 *  departments still show up with zero counts. */
exports.stats = async (req, res) => {
  try {
    const [departments, users] = await Promise.all([
      departmentService.listAll(),
      userService.listUsers(),
    ]);

    const counts = {};
    departments.forEach((d) => {
      counts[d.name] = { department: d.name, students: 0, alumni: 0, total: 0 };
    });

    users
      .filter((u) => ["student", "alumni"].includes(u.role) && u.department)
      .forEach((u) => {
        if (!counts[u.department]) {
          counts[u.department] = { department: u.department, students: 0, alumni: 0, total: 0 };
        }
        if (u.role === "student") counts[u.department].students++;
        if (u.role === "alumni") counts[u.department].alumni++;
        counts[u.department].total++;
      });

    const stats = Object.values(counts).sort((a, b) => b.total - a.total);
    res.json({ success: true, stats });
  } catch (error) {
    console.error("Department stats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};