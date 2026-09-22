const db = require("../config/firestore");
const userService = require("./userService");
const { serialize } = require("../utils/serialize");

const postsRef = db.collection("posts");

const CATEGORIES = new Set([
  "Achievement",
  "Career Update",
  "News",
  "General",
  "Event",
  "Job",
]);

function plain(doc) {
  return { id: doc.id, ...doc.data() };
}

async function findById(id) {
  const snap = await postsRef.doc(id).get();
  return snap.exists ? plain(snap) : null;
}

async function formatPost(post) {
  if (!post) return null;
  const author = await userService.getFullUser(post.authorId);
  return serialize({
    _id: post.id,
    author: {
      _id: author?.id || post.authorId,
      name:
        author?.name ||
        `${author?.firstname || ""} ${author?.lastname || ""}`.trim() ||
        "Former member",
      profilePhoto: author?.profilePhoto || "",
      role: author?.role || "alumni",
      department: author?.department || "",
      position: author?.position || author?.jobTitle || "",
      graduationYear: author?.graduationYear || "",
    },
    category: post.category || "General",
    text: post.text || "",
    imageUrl: post.imageUrl || "",
    likes: post.likes || [],
    comments: post.comments || [],
    createdAt: post.createdAt,
  });
}

async function list({ authorId, groupId } = {}) {
  // Deliberately filter/sort in memory to avoid requiring a collection of
  // deployment-specific Firestore composite indexes for this small feed.
  const snap = await postsRef.get();
  let posts = snap.docs.map(plain);
  if (authorId) posts = posts.filter((post) => post.authorId === authorId);
  if (groupId) posts = posts.filter((post) => post.groupId === groupId);
  else posts = posts.filter((post) => !post.groupId);
  posts.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || +new Date(a.createdAt || 0);
    const bTime = b.createdAt?.toMillis?.() || +new Date(b.createdAt || 0);
    return bTime - aTime;
  });
  return Promise.all(posts.map(formatPost));
}

async function create({ authorId, category, text, imageUrl = "", groupId = null }) {
  const now = new Date();
  const doc = {
    authorId,
    category: CATEGORIES.has(category) ? category : "General",
    text: text.trim(),
    imageUrl: imageUrl || "",
    groupId,
    likes: [],
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
  const ref = await postsRef.add(doc);
  return formatPost({ id: ref.id, ...doc });
}

async function toggleLike(id, userId) {
  const ref = postsRef.doc(id);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      const error = new Error("Post not found");
      error.status = 404;
      throw error;
    }
    const likes = snap.data().likes || [];
    const next = likes.includes(userId)
      ? likes.filter((item) => item !== userId)
      : [...likes, userId];
    transaction.update(ref, { likes: next, updatedAt: new Date() });
  });
  return formatPost(await findById(id));
}

async function addComment(id, user, text) {
  const ref = postsRef.doc(id);
  const now = new Date();
  const comment = {
    _id: postsRef.doc().id,
    userId: user.id,
    authorName:
      user.name || `${user.firstname || ""} ${user.lastname || ""}`.trim(),
    authorPhoto: user.profilePhoto || "",
    authorRole: user.role,
    text: text.trim(),
    createdAt: now.toISOString(),
  };
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      const error = new Error("Post not found");
      error.status = 404;
      throw error;
    }
    transaction.update(ref, {
      comments: [...(snap.data().comments || []), comment],
      updatedAt: now,
    });
  });
  return formatPost(await findById(id));
}

async function update(id, actor, text) {
  const post = await findById(id);
  if (!post) return null;
  if (post.authorId !== actor.userId && actor.role !== "admin") {
    const error = new Error("You can only edit your own posts");
    error.status = 403;
    throw error;
  }
  await postsRef.doc(id).update({ text: text.trim(), updatedAt: new Date() });
  return formatPost(await findById(id));
}

async function remove(id, actor) {
  const post = await findById(id);
  if (!post) return false;
  if (post.authorId !== actor.userId && actor.role !== "admin") {
    const error = new Error("You can only delete your own posts");
    error.status = 403;
    throw error;
  }
  await postsRef.doc(id).delete();
  return true;
}

async function listTagged(user) {
  const posts = await list();
  const needle = `@${
    user.name || `${user.firstname || ""} ${user.lastname || ""}`.trim()
  }`.toLowerCase();
  return posts.filter((post) => post.text.toLowerCase().includes(needle));
}

module.exports = {
  CATEGORIES,
  findById,
  list,
  create,
  toggleLike,
  addComment,
  update,
  remove,
  listTagged,
};
