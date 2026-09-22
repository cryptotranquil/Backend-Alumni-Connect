const postService = require("../services/postService");
const userService = require("../services/userService");

exports.list = async (req, res) => {
  const posts = await postService.list({ authorId: req.query.authorId });
  res.json(posts);
};

exports.create = async (req, res) => {
  const { category, text, imageUrl } = req.body;
  if (!text?.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Post text is required" });
  }
  if (text.trim().length > 5000) {
    return res
      .status(400)
      .json({ success: false, message: "Post is too long" });
  }
  const post = await postService.create({
    authorId: req.user.userId,
    category,
    text,
    imageUrl,
  });
  res.status(201).json(post);
};

exports.toggleLike = async (req, res) => {
  res.json(await postService.toggleLike(req.params.id, req.user.userId));
};

exports.comment = async (req, res) => {
  const { text } = req.body;
  if (!text?.trim() || text.trim().length > 1000) {
    return res.status(400).json({
      success: false,
      message: "Comment must be between 1 and 1000 characters",
    });
  }
  const user = await userService.getFullUser(req.user.userId);
  res.json(await postService.addComment(req.params.id, user, text));
};

exports.update = async (req, res) => {
  if (!req.body.text?.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Post text is required" });
  }
  const post = await postService.update(req.params.id, req.user, req.body.text);
  if (!post) {
    return res
      .status(404)
      .json({ success: false, message: "Post not found" });
  }
  res.json(post);
};

exports.remove = async (req, res) => {
  const removed = await postService.remove(req.params.id, req.user);
  if (!removed) {
    return res
      .status(404)
      .json({ success: false, message: "Post not found" });
  }
  res.json({ success: true });
};
