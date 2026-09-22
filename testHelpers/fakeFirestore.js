/**
 * A tiny in-memory stand-in for the parts of Firestore that the roster
 * service uses. It exists so unit tests run offline with no credentials.
 * It checks the service's LOGIC; it cannot prove real Firestore semantics
 * (that is what the emulator integration tests and the Bruno run are for).
 */

class FakeFirestore {
  constructor() {
    this.data = new Map(); // "collection/id" -> object
    this.batchesCommitted = 0;
  }

  collection(name) { return new FakeQuery(this, name); }

  async getAll(...refs) { return Promise.all(refs.map((r) => r.get())); }

  batch() {
    const ops = [];
    const db = this;
    return {
      set(ref, data) { ops.push(() => ref._set(data)); },
      create(ref, data) {
        ops.push(() => {
          if (db.data.has(ref.key)) { const e = new Error("ALREADY_EXISTS: " + ref.key); e.code = 6; throw e; }
          ref._set(data);
        });
      },
      update(ref, data) { ops.push(() => ref._update(data)); },
      delete(ref) { ops.push(() => ref._delete()); },
      async commit() {
        if (ops.length > 500) throw new Error("Batch too large: " + ops.length);
        ops.forEach((op) => op());
        db.batchesCommitted += 1;
      },
    };
  }

  async runTransaction(fn) {
    const tx = {
      get: (ref) => ref.get(),
      set: (ref, data) => ref._set(data),
      update: (ref, data) => ref._update(data),
    };
    return fn(tx);
  }
}

class FakeDocRef {
  constructor(db, collection, id) { this.db = db; this.collectionName = collection; this.id = id; }
  get key() { return `${this.collectionName}/${this.id}`; }
  async get() {
    const exists = this.db.data.has(this.key);
    const value = exists ? this.db.data.get(this.key) : undefined;
    return { id: this.id, exists, ref: this, data: () => (exists ? { ...value } : undefined) };
  }
  async set(data) { this._set(data); }
  async update(data) { this._update(data); }
  async delete() { this._delete(); }
  _set(data) { this.db.data.set(this.key, { ...data }); }
  _update(data) {
    if (!this.db.data.has(this.key)) throw new Error("NOT_FOUND: " + this.key);
    this.db.data.set(this.key, { ...this.db.data.get(this.key), ...data });
  }
  _delete() { this.db.data.delete(this.key); }
}

class FakeQuery {
  constructor(db, name, filters = [], order = null, max = null, start = null) {
    this.db = db; this.name = name; this.filters = filters; this.order = order; this.max = max; this.start = start;
  }
  doc(id) { return new FakeDocRef(this.db, this.name, id); }
  where(field, op, value) { return new FakeQuery(this.db, this.name, [...this.filters, { field, op, value }], this.order, this.max, this.start); }
  orderBy(field, dir = "asc") { return new FakeQuery(this.db, this.name, this.filters, { field, dir }, this.max, this.start); }
  limit(n) { return new FakeQuery(this.db, this.name, this.filters, this.order, n, this.start); }
  startAfter(snap) { return new FakeQuery(this.db, this.name, this.filters, this.order, this.max, snap.id); }

  _rows() {
    let rows = [...this.db.data.entries()]
      .filter(([key]) => key.startsWith(this.name + "/"))
      .map(([key, value]) => ({ id: key.slice(this.name.length + 1), value }));
    for (const { field, op, value } of this.filters) {
      rows = rows.filter((row) => {
        const actual = field === "__name__" ? row.id : row.value[field];
        if (op === "==") return actual === value;
        if (op === ">=") return actual >= value;
        if (op === "<") return actual < value;
        throw new Error("unsupported op " + op);
      });
    }
    if (this.order) {
      const { field, dir } = this.order;
      rows.sort((a, b) => (a.value[field] < b.value[field] ? -1 : a.value[field] > b.value[field] ? 1 : 0) * (dir === "desc" ? -1 : 1));
    } else {
      rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // Firestore's default order
    }
    if (this.start) {
      const index = rows.findIndex((row) => row.id === this.start);
      rows = index === -1 ? rows : rows.slice(index + 1);
    }
    if (this.max !== null) rows = rows.slice(0, this.max);
    return rows;
  }

  async get() {
    const docs = this._rows().map((row) => ({ id: row.id, exists: true, data: () => ({ ...row.value }) }));
    return { docs, size: docs.length };
  }
  count() {
    return { get: async () => ({ data: () => ({ count: this._rows().length }) }) };
  }
}

module.exports = { FakeFirestore };
