const notificationService = require("../services/notification.service");
const { serialize } = require("../utils/serialize");

function formatNotification(notification) {
  const value = serialize({ ...notification });
  value._id = value.id;
  value.read = Boolean(value.isRead ?? value.read);
  delete value.id;
  delete value.isRead;
  return value;
}

const getNotifications = async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const notifications = await notificationService.getUserNotifications(
    req.user.userId,
    limit,
    skip,
  );
  const unreadCount = await notificationService.getUnreadCount(req.user.userId);
  res.json({
    success: true,
    notifications: notifications.map(formatNotification),
    unreadCount,
    pagination: {
      limit,
      skip,
      hasMore: notifications.length === limit,
    },
  });
};

const markAsRead = async (req, res) => {
  const notification = await notificationService.markAsRead(
    req.params.id,
    req.user.userId,
  );
  if (!notification) {
    return res
      .status(404)
      .json({ success: false, message: "Notification not found" });
  }
  res.json({ success: true, notification: formatNotification(notification) });
};

const markAllAsRead = async (req, res) => {
  await notificationService.markAllAsRead(req.user.userId);
  res.json({ success: true, message: "All notifications marked as read" });
};

const deleteNotification = async (req, res) => {
  const notification = await notificationService.deleteNotification(
    req.params.id,
    req.user.userId,
  );
  if (!notification) {
    return res
      .status(404)
      .json({ success: false, message: "Notification not found" });
  }
  res.json({ success: true, message: "Notification deleted" });
};

const getUnreadCount = async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.userId);
  res.json({ success: true, unreadCount: count });
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
};
