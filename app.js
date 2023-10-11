const getNextDay6PMMdt = () => {
  const currentDate = new Date();
  currentDate.setUTCHours(24 + 6 + 6); // 24 hours for the next day + 6 PM + 6 hours for UTC-6
  currentDate.setUTCMinutes(0);
  currentDate.setUTCSeconds(0);
  currentDate.setUTCMilliseconds(0);
  return currentDate;
};

// simple healthcheck
const express = require("express");
const app = express();
const port = process.env.PORT ?? 3000;

app.get("/", (_req, res) => {
  res.send("healthy");
});

app.get("*", (req, res) => {
  res.redirect("/");
});

app.listen(port, () => {
  console.log(`Listening on Port=(${port})`);
});

//  monitor

const axios = require("axios");
const fs = require("node:fs");

const POLL_INTERVAL = 60_000;
const TIMEOUT = 25_000;
const REMIND_INTERVAL = 1 * 60 * 60_000;

const endpoints = fs
  .readFileSync("uptime-list.txt", { encoding: "utf-8" })
  .toString()
  .split("\n")
  .filter((endpoint) => endpoint && endpoint.length);
const webhook = process.env.DISCORD_WEBHOOK;

const stateSinceLastCheck = {
  checks: 0,
  failures: 0,
  nextStatsMessage: getNextDay6PMMdt(),
};
const up = new Map();
const down = new Map();
let messages = [];

const processEndpoint = async (endpoint) => {
  stateSinceLastCheck.checks += 1;

  try {
    console.log(new Date().toISOString(), "fetching", endpoint);

    const { data } = await axios(endpoint, { timeout: TIMEOUT });
    if (down.has(endpoint)) {
      down.delete(endpoint);
      up.set(endpoint, new Date());

      return `${endpoint} is back up and returned Body=(${JSON.stringify(
        data
      )})`;
    }
  } catch (e) {
    console.log(new Date().toISOString(), endpoint, "failed");
    stateSinceLastCheck.failures += 1;

    if (
      !down.has(endpoint) ||
      Date.now() - down.get(endpoint).getTime() > REMIND_INTERVAL
    ) {
      let message = `${endpoint} returned an error. `;

      if (e.response) {
        const { status, statusText } = e.response;
        message += `Status=(${status}, ${statusText}).`;
      } else if (e.cause) {
        const { cause } = e;
        message += `Cause=(${cause}).`;
      } else {
        message += `Exception=(${e.toString()}).`;
      }

      up.delete(endpoint);
      down.set(endpoint, new Date());

      return message;
    }
  }

  return null;
};

const monitorAndSend = async () => {
  for (const endpoint of endpoints) {
    const msg = await processEndpoint(endpoint);
    if (msg) {
      messages.push(msg);
    }
  }

  if (messages.length) {
    const allMessages = messages.map((x) => `+ ${x}`).join("\n");
    const content = `<@&${process.env.DISCORD_ROLE_ID}> \`\`\`${allMessages}\`\`\``;

    await axios.post(webhook, {
      content,
    });

    messages = [];
  }

  if (stateSinceLastCheck.nextStatsMessage.getTime() < Date.now()) {
    let message = `There were no failures since the last update on ${stateSinceLastCheck.nextStatsMessage.toISOString()} :))`;
    if (stateSinceLastCheck.failures > 0) {
      message = `Since the last update on ${stateSinceLastCheck.nextStatsMessage.toISOString()}, ${
        stateSinceLastCheck.failures
      } / ${stateSinceLastCheck.checks} health checks failed.`;
    }
    await axios.post(webhook, {
      content: `<@&${process.env.DISCORD_ROLE_ID}> \`\`\`${message}\`\`\``,
    });

    stateSinceLastCheck.checks = 0;
    stateSinceLastCheck.failures = 0;
    stateSinceLastCheck.nextStatsMessage = getNextDay6PMMdt();
  }
};

monitorAndSend().then(() => setInterval(monitorAndSend, POLL_INTERVAL));
