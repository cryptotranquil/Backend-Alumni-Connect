const eventService = require("../services/eventService");
const userService = require("../services/userService");
const notificationService = require("../services/notification.service");
const { serialize, toIso } = require("../utils/serialize");

function nameOf(user) {
  return (
    user?.name ||
    `${user?.firstname || ""} ${user?.lastname || ""}`.trim() ||
    "Exploits University"
  );
}

function formatEvent(event, organizer, participantIds = []) {
  return serialize({
    _id: event.id,
    title: event.title,
    description: event.description || "",
    eventDate: event.startDate,
    location: event.location || "",
    organizer: {
      _id: organizer?.id || event.createdBy,
      name: nameOf(organizer),
    },
    participants: participantIds,
    imageUrl: event.imageUrl || "",
    createdAt: event.createdAt,
  });
}

async function formattedEvents(events) {
  const [organizers, registrations] = await Promise.all([
    Promise.all(events.map((event) => userService.findById(event.createdBy))),
    Promise.all(
      events.map((event) => eventService.listRegistrationsForEvent(event.id)),
    ),
  ]);
  return events.map((event, index) =>
    formatEvent(
      event,
      organizers[index],
      registrations[index].map((registration) => registration.userId),
    ),
  );
}

exports.listEvents = async (_req, res) => {
  res.json({ success: true, events: await formattedEvents(await eventService.listAll()) });
};

exports.createEvent = async (req, res) => {
  const { title, description, eventDate, location, imageUrl } = req.body;
  const event = await eventService.createEvent({
    title: title.trim(),
    description: description?.trim() || "",
    startDate: new Date(eventDate),
    endDate: null,
    eventType: "in-person",
    location: location?.trim() || "",
    onlineMeetingUrl: null,
    imageUrl: imageUrl || "",
    createdBy: req.user.userId,
  });
  const organizer = await userService.findById(req.user.userId);
  // createEventApi expects the Event directly.
  res.status(201).json(formatEvent(event, organizer, []));
};

exports.joinEvent = async (req, res) => {
  const event = await eventService.findById(req.params.id);
  if (!event) {
    return res
      .status(404)
      .json({ success: false, message: "Event not found" });
  }
  const existing = await eventService.findRegistration(
    req.params.id,
    req.user.userId,
  );
  if (!existing) {
    await eventService.register(req.params.id, req.user.userId);
    await notifyOrganizer(req, event);
  }
  res.json({ success: true, message: existing ? "Already registered" : "Joined event" });
};

async function notifyOrganizer(req, event) {
  try {
    const [user, organizer] = await Promise.all([
      userService.findById(req.user.userId),
      userService.findById(event.createdBy),
    ]);
    if (!organizer || organizer.id === req.user.userId) return;
    await notificationService.createNotification({
      userId: organizer.id,
      type: "event_rsvp",
      title: `New RSVP: ${event.title}`,
      message: `${nameOf(user)} has registered for your event "${event.title}"`,
      data: {
        eventId: event.id,
        eventTitle: event.title,
        participantId: user.id,
        participantName: nameOf(user),
      },
      actionUrl: `/events/${event.id}/participants`,
      sendEmail: true,
      emailRecipient: organizer.email,
    });
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${organizer.id}`).emit("notification:new", {
        type: "event_rsvp",
        title: "New Event Registration",
        message: `${nameOf(user)} joined ${event.title}`,
      });
    }
  } catch (error) {
    console.warn("[event RSVP] notification failed:", error.message);
  }
}

exports.toggleRsvp = async (req, res) => {
  const event = await eventService.findById(req.params.id);
  if (!event) {
    return res
      .status(404)
      .json({ success: false, message: "Event not found" });
  }
  const existing = await eventService.findRegistration(
    event.id,
    req.user.userId,
  );
  let rsvped;
  if (existing) {
    await eventService.unregister(event.id, req.user.userId);
    rsvped = false;
  } else {
    await eventService.register(event.id, req.user.userId);
    await notifyOrganizer(req, event);
    rsvped = true;
  }
  const registrations = await eventService.listRegistrationsForEvent(event.id);
  res.json({ rsvped, count: registrations.length });
};

exports.rsvpStatus = async (req, res) => {
  const event = await eventService.findById(req.params.id);
  if (!event) {
    return res
      .status(404)
      .json({ success: false, message: "Event not found" });
  }
  res.json({
    rsvped: Boolean(
      await eventService.findRegistration(event.id, req.user.userId),
    ),
  });
};

exports.myEvents = async (req, res) => {
  const now = new Date();
  const events = (await eventService.listEventsForUser(req.user.userId))
    .filter((event) => {
      const date = event.startDate?.toDate
        ? event.startDate.toDate()
        : new Date(event.startDate);
      return date >= now;
    })
    .sort((a, b) => +new Date(toIso(a.startDate)) - +new Date(toIso(b.startDate)));
  res.json({ events: await formattedEvents(events) });
};

exports.deleteEvent = async (req, res) => {
  if (!(await eventService.findById(req.params.id))) {
    return res
      .status(404)
      .json({ success: false, message: "Event not found" });
  }
  await eventService.deleteEvent(req.params.id);
  res.json({ success: true, message: "Event deleted" });
};

exports.getParticipants = async (req, res) => {
  const event = await eventService.findById(req.params.id);
  if (!event) {
    return res
      .status(404)
      .json({ success: false, message: "Event not found" });
  }
  const registrations = await eventService.listRegistrationsForEvent(event.id);
  const users = await Promise.all(
    registrations.map((registration) => userService.getFullUser(registration.userId)),
  );
  const participants = users.filter(Boolean).map((user) => ({
    _id: user.id,
    name: nameOf(user),
    email: user.email,
    role: user.role,
    phone: user.phone || "",
    profilePhoto: user.profilePhoto || "",
    graduationYear: user.graduationYear || "",
    university: user.university || "",
    company: user.company || "",
    position: user.position || user.jobTitle || "",
  }));
  res.json({
    eventId: event.id,
    title: event.title,
    eventDate: toIso(event.startDate),
    location: event.location || "",
    total: participants.length,
    participants,
  });
};

exports.sendEventReminders = async (req, res) => {
  const cronSecret = req.headers["x-cron-secret"];
  if (cronSecret !== process.env.CRON_SECRET && req.user?.role !== "admin") {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const upcomingEvents = await eventService.listUpcoming(tomorrow, dayAfter);
  let remindersSent = 0;
  for (const event of upcomingEvents) {
    const registrations = await eventService.listRegistrationsForEvent(event.id);
    const users = await Promise.all(
      registrations.map((registration) => userService.findById(registration.userId)),
    );
    for (const user of users.filter(Boolean)) {
      try {
        await notificationService.notifyEventReminder(user, event);
        remindersSent += 1;
      } catch (error) {
        console.warn("[event reminder] notification failed:", error.message);
      }
    }
  }
  res.json({
    success: true,
    message: `Reminders sent for ${upcomingEvents.length} events (${remindersSent} total notifications)`,
  });
};
