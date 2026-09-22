const db = require("../config/firestore");
const canonicalDepartments = require("../config/departmentSeeds");

const departmentsRef = db.collection("departments");

function slugCode(name) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

function categoriesFor(programs = []) {
  return {
    BSc: programs.filter((name) => name.startsWith("BSc")),
    BCom: programs.filter((name) => name.startsWith("BCom")),
  };
}

/**
 * Ensure all departments used by the frontend registration flow exist. This
 * is additive: administrator-created departments are retained and existing
 * names are not overwritten, except that missing programme metadata is filled.
 */
async function ensureSeeded() {
  const snap = await departmentsRef.get();
  const byName = new Map(
    snap.docs.map((doc) => [String(doc.data().name || "").toLowerCase(), doc]),
  );
  const batch = db.batch();
  const now = new Date();
  let changed = false;

  for (const seed of canonicalDepartments) {
    const existing = byName.get(seed.name.toLowerCase());
    if (!existing) {
      batch.set(departmentsRef.doc(seed.id), {
        name: seed.name,
        code: seed.code,
        description: seed.description,
        programs: seed.programs,
        programCategories: categoriesFor(seed.programs),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      changed = true;
      continue;
    }

    const data = existing.data();
    const patch = {};
    if (!Array.isArray(data.programs) || data.programs.length === 0) {
      patch.programs = seed.programs;
      patch.programCategories = categoriesFor(seed.programs);
    }
    if (!data.code) patch.code = seed.code;
    if (Object.keys(patch).length) {
      batch.update(existing.ref, { ...patch, updatedAt: now });
      changed = true;
    }
  }

  if (changed) await batch.commit();
}

async function listActive() {
  await ensureSeeded();
  const canonicalNames = new Set(canonicalDepartments.map((item) => item.name));
  const snap = await departmentsRef.where("isActive", "==", true).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    // The current frontend has programme mappings for these canonical five.
    .filter((department) => canonicalNames.has(department.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function listAll() {
  await ensureSeeded();
  const snap = await departmentsRef.get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function findById(id) {
  const snap = await departmentsRef.doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function findByName(name) {
  const snap = await departmentsRef
    .where("name", "==", name.trim())
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function create({ name, code, description, programs = [] }) {
  const now = new Date();
  const payload = {
    name: name.trim(),
    code: (code?.trim() || slugCode(name)).toUpperCase(),
    description: description?.trim() || "",
    programs: Array.isArray(programs) ? programs : [],
    programCategories: categoriesFor(programs),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await departmentsRef.add(payload);
  return { id: ref.id, ...payload };
}

async function update(id, data) {
  const patch = { ...data, updatedAt: new Date() };
  if (patch.name) patch.name = patch.name.trim();
  if (patch.code) patch.code = patch.code.trim().toUpperCase();
  if (Array.isArray(patch.programs)) {
    patch.programCategories = categoriesFor(patch.programs);
  }
  delete patch.id;
  await departmentsRef.doc(id).update(patch);
  return findById(id);
}

async function remove(id) {
  await departmentsRef.doc(id).delete();
}

module.exports = {
  ensureSeeded,
  listActive,
  listAll,
  findById,
  findByName,
  create,
  update,
  remove,
};
