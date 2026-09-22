const groupService = require("../services/groupService");

exports.list = async (req, res) => {
  res.json(await groupService.list(req.user.userId));
};

exports.membership = async (req, res) => {
  res.json({ joined: await groupService.isMember(req.params.id, req.user.userId) });
};

exports.toggle = async (req, res) => {
  res.json(await groupService.toggle(req.params.id, req.user.userId));
};

exports.posts = async (req, res) => {
  const posts = await groupService.posts(req.params.id);
  if (!posts) return res.status(404).json({ success: false, message: "Group not found" });
  res.json(posts);
};

exports.members = async (req, res) => {
  if (!(await groupService.findById(req.params.id))) {
    return res.status(404).json({ success: false, message: "Group not found" });
  }
  res.json(await groupService.memberNames(req.params.id));
};
