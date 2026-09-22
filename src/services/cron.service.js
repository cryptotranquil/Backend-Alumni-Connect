const cron = require("node-cron");
const axios = require("axios");

class CronService {
  constructor() {
    this.jobs = [];
  }

  // Schedule event reminders to run daily at 9 AM
  scheduleEventReminders(baseUrl) {
    // Run every day at 9:00 AM
    const job = cron.schedule("0 9 * * *", async () => {
      console.log("[Cron] Running event reminders...");
      try {
        const response = await axios.post(
          `${baseUrl}/api/events/reminders`,
          {},
          {
            headers: {
              "x-cron-secret": process.env.CRON_SECRET || "your-secret-key",
            },
            timeout: 30000, // 30 second timeout
          },
        );

        if (response.data.success) {
          console.log(
            `[Cron] Event reminders sent successfully: ${response.data.message}`,
          );
        } else {
          console.log(
            `[Cron] Event reminders response: ${response.data.message}`,
          );
        }
      } catch (error) {
        console.error("[Cron] Failed to send event reminders:", error.message);
        if (error.response) {
          console.error("[Cron] Response status:", error.response.status);
          console.error("[Cron] Response data:", error.response.data);
        }
      }
    });

    this.jobs.push(job);
    console.log("[Cron] Event reminders scheduled for 9:00 AM daily");
    return job;
  }

  // Stop all cron jobs
  stopAll() {
    this.jobs.forEach((job) => {
      try {
        job.stop();
        console.log("[Cron] Stopped a cron job");
      } catch (error) {
        console.error("[Cron] Error stopping job:", error.message);
      }
    });
    this.jobs = [];
    console.log("[Cron] All cron jobs stopped");
  }
}

module.exports = new CronService();
