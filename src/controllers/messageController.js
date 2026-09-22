const messageService = require("../services/messageService");
const userService = require("../services/userService");
const mentorshipService = require("../services/mentorshipService");
const { canExchangeMessages } = require("../services/connection.service");
const notificationService = require("../services/notification.service"); // Firestore-based (Phase 3g done)

const formatMessage = (m, conversationId) => ({
  _id: m.id, conversationId, senderId: m.senderId, receiverId: m.receiverId, message: m.message,
  timestamp: m.createdAt?.toDate ? m.createdAt.toDate().toISOString() : m.createdAt,
  read: !!m.read,
});

exports.getConversations = async (req, res) => {
  const conversations = await messageService.listConversationsForUser(req.user.userId);
  const results = [];

  for (const c of conversations) {
    const otherId = c.participantIds.find((id) => id !== req.user.userId);
    if (!otherId) continue;
    if (!(await canExchangeMessages(req.user.userId, otherId))) continue;

    const other = await userService.findById(otherId);
    const unreadCount = await messageService.countUnread(c.id, req.user.userId);
    results.push({
      user: { _id: otherId, name: `${other?.firstname || ""} ${other?.lastname || ""}`.trim(), profilePhoto: other?.profilePhoto || "", role: other?.role },
      lastMessage: c.lastMessage,
      lastTimestamp: c.lastMessageAt?.toDate ? c.lastMessageAt.toDate().toISOString() : c.lastMessageAt,
      unreadCount,
    });
  }
  res.json({ success: true, conversations: results });
};

exports.getThread = async (req, res) => {
  const me = req.user.userId;
  const other = req.params.userId;

  if (!(await canExchangeMessages(me, other))) {
    return res.status(403).json({ success: false, message: "You can only message this person after a connection is accepted (students ↔ alumni), or if you are both alumni." });
  }

  const conversation = await messageService.findConversationBetween(me, other);
  if (!conversation) return res.json({ success: true, messages: [] }); // no messages yet — not an error

  const messages = await messageService.listMessages(conversation.id);
  await messageService.markThreadRead(conversation.id, me);
  res.json({ success: true, messages: messages.map((m) => formatMessage(m, conversation.id)) });
};

exports.sendMessage = async (req, res) => {
  const { receiverId, message } = req.body;

  if (!(await canExchangeMessages(req.user.userId, receiverId))) {
    return res.status(403).json({ success: false, message: "Messaging not allowed until this connection is accepted, or you are not permitted to message this user." });
  }

  const receiver = await userService.findById(receiverId);
  if (!receiver) return res.status(404).json({ success: false, message: "Receiver not found" });

  const match = (await mentorshipService.findMatchBetween(req.user.userId, receiverId)) || (await mentorshipService.findMatchBetween(receiverId, req.user.userId));
  const conversation = await messageService.findOrCreateConversation(req.user.userId, receiverId, match?.id || null);
  const doc = await messageService.sendMessage(conversation.id, req.user.userId, receiverId, message.trim());
  const payload = formatMessage(doc, conversation.id);

  const io = req.app.get("io");
  if (io) io.to(`user:${receiverId}`).emit("message:new", payload);

  try {
    const sender = await userService.findById(req.user.userId);
    await notificationService.notifyNewMessage(sender, receiver, message.trim());
    if (io) {
      const unreadCount = await notificationService.getUnreadCount(receiverId);
      io.to(`user:${receiverId}`).emit("notification:new", { type: "new_message", title: `New Message from ${sender.firstname}`, message: message.trim().substring(0, 100), unreadCount });
    }
  } catch (err) { console.warn("[sendMessage] notification step failed :", err.message); }

  res.status(201).json({ success: true, message: payload });
};