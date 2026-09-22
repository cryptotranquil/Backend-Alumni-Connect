const db = require("../config/firestore");
const { sendTransactionalEmail, frontendBaseUrl } = require("./email.service");
const notificationsRef = db.collection("notifications");

class NotificationService {
  async createNotification({ userId, type, title, message, data = {}, actionUrl = null, imageUrl = null, sendEmail = true, emailRecipient = null }) {
    try {
      const id = notificationsRef.doc().id;
      const now = new Date();
      const doc = { userId, type, title, message, data, actionUrl, imageUrl, isRead: false, readAt: null, createdAt: now, updatedAt: now };
      await notificationsRef.doc(id).set(doc);

      if (sendEmail && emailRecipient) {
        const emailActionUrl = actionUrl
          ? /^https?:\/\//i.test(actionUrl)
            ? actionUrl
            : `${frontendBaseUrl()}${actionUrl.startsWith("/") ? actionUrl : `/${actionUrl}`}`
          : frontendBaseUrl();
        await this.sendEmailNotification({ email: emailRecipient, title, message, type, actionUrl: emailActionUrl });
      }
      return { id, ...doc };
    } catch (error) {
      console.error("Error creating notification:", error);
      return null;
    }
  }

  // Reconstructed, not recovered verbatim — the original Mongo-version
  // implementation was never seen in this migration. Built to match the
  // calling convention already used by createNotification() and the simple
  // HTML-email pattern already used elsewhere (authController's invite/reset
  // emails). Adjust styling/copy as needed.
  async sendEmailNotification({ email, title, message, actionUrl }) {
    const html = `
      <p>${message}</p>
      ${actionUrl ? `<p><a href="${actionUrl}">View in Alumni Connect</a></p>` : ""}
    `;
    await sendTransactionalEmail({ to: email, subject: title, html });
  }

  async getUnreadCount(userId) {
    const snap = await notificationsRef.where("userId", "==", userId).get();
    return snap.docs.filter((doc) => !doc.data().isRead).length;
  }

  async getUserNotifications(userId, limit = 20, skip = 0) {
    const snap = await notificationsRef.where("userId", "==", userId).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const at = a.createdAt?.toMillis?.() || +new Date(a.createdAt || 0);
        const bt = b.createdAt?.toMillis?.() || +new Date(b.createdAt || 0);
        return bt - at;
      })
      .slice(skip, skip + limit);
  }

  async markAsRead(notificationId, userId) {
    const ref = notificationsRef.doc(notificationId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().userId !== userId) return null;
    await ref.update({ isRead: true, readAt: new Date() });
    return { id: snap.id, ...snap.data(), isRead: true };
  }

  async markAllAsRead(userId) {
    const snap = await notificationsRef.where("userId", "==", userId).get();
    const unread = snap.docs.filter((doc) => !doc.data().isRead);
    if (!unread.length) return;
    const batch = db.batch();
    unread.forEach((doc) =>
      batch.update(doc.ref, { isRead: true, readAt: new Date() }),
    );
    await batch.commit();
  }

  async deleteNotification(notificationId, userId) {
    const ref = notificationsRef.doc(notificationId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().userId !== userId) return null;
    await ref.delete();
    return { id: snap.id };
  }

  async notifyMentorshipRequest(student, alumni, matchScore, message) {
    const studentName = `${student.firstname || ""} ${student.lastname || ""}`.trim();
    return this.createNotification({
      userId: alumni.id, type: "mentorship_request", title: `New Mentorship Request from ${studentName}`,
      message: `${studentName} (${student.department || "Student"}) has requested you as a mentor. Match score: ${matchScore}%`,
      data: { studentId: student.id, studentName, studentDepartment: student.department, matchScore, skillMatches: [], requestMessage: message },
      actionUrl: `/dashboard?tab=mentorship`, sendEmail: true, emailRecipient: alumni.email,
    });
  }

  async notifyMentorshipResponse(student, alumni, status, responseMessage) {
    const alumniName = `${alumni.firstname || ""} ${alumni.lastname || ""}`.trim();
    const isAccepted = status === "accepted";
    return this.createNotification({
      userId: student.id, type: isAccepted ? "mentorship_accepted" : "mentorship_rejected",
      title: isAccepted ? "Mentorship Request Accepted!" : "Mentorship Request Update",
      message: isAccepted ? `${alumniName} has accepted your mentorship request! Start messaging now.` : `${alumniName} has declined your mentorship request. ${responseMessage ? `Message: ${responseMessage}` : "You can try requesting another mentor."}`,
      data: { alumniId: alumni.id, alumniName, status, responseMessage },
      actionUrl: `/messages?user=${alumni.id}`, sendEmail: true, emailRecipient: student.email,
    });
  }

  async notifyNewMessage(sender, receiver, messagePreview) {
    const senderName = `${sender.firstname || ""} ${sender.lastname || ""}`.trim();
    return this.createNotification({
      userId: receiver.id, type: "new_message", title: `New Message from ${senderName}`,
      message: `${senderName}: "${messagePreview.substring(0, 100)}${messagePreview.length > 100 ? "..." : ""}"`,
      data: { senderId: sender.id, senderName, messagePreview },
      actionUrl: `/messages?user=${sender.id}`, sendEmail: true, emailRecipient: receiver.email,
    });
  }

  async notifyJobApplication(job, student, alumni) {
    const studentName = `${student.firstname || ""} ${student.lastname || ""}`.trim();
    return this.createNotification({
      userId: alumni.id, type: "job_application", title: `New Job Application for ${job.title}`,
      message: `${studentName} has applied for ${job.title} at ${job.company}`,
      data: { jobId: job.id, jobTitle: job.title, company: job.company, studentId: student.id, studentName },
      actionUrl: `/jobs`, sendEmail: true, emailRecipient: alumni.email,
    });
  }

  async notifyEventReminder(user, event) {
    const eventDate = event.startDate?.toDate ? event.startDate.toDate() : new Date(event.startDate);
    return this.createNotification({
      userId: user.id, type: "event_reminder", title: `Reminder: ${event.title}`,
      message: `Your event "${event.title}" is happening on ${eventDate.toLocaleDateString()} at ${eventDate.toLocaleTimeString()}`,
      data: { eventId: event.id, eventTitle: event.title, eventDate, location: event.location },
      actionUrl: `/events`, sendEmail: true, emailRecipient: user.email,
    });
  }

  async notifyAlumniApproved(alumni) {
    const alumniName = `${alumni.firstname || ""} ${alumni.lastname || ""}`.trim();
    return this.createNotification({
      userId: alumni.id, type: "alumni_approved", title: "Welcome to Alumni Connect!",
      message: "Your alumni account has been approved. You can now post jobs and mentor students.",
      data: { alumniId: alumni.id, alumniName },
      actionUrl: `/dashboard`, sendEmail: true, emailRecipient: alumni.email,
    });
  }
}

module.exports = new NotificationService();