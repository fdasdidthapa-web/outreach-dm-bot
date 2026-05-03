const { Client, GatewayIntentBits } = require("discord.js");
const { google } = require("googleapis");

// ─── CONFIG ────────────────────────────────────────────────────
// These are set as Environment Variables in Railway — never hardcode here
const BOT_TOKEN        = process.env.BOT_TOKEN;
const DM_LOG_CHANNEL   = process.env.DM_LOG_CHANNEL_ID;
const SPREADSHEET_ID   = process.env.SPREADSHEET_ID;
const GOOGLE_CREDS     = JSON.parse(process.env.GOOGLE_CREDENTIALS);

// Map Discord username (lowercase) → Sheet tab name
// Add employees here as you hire them
const EMPLOYEE_MAP = {
  "st_ronan": "Employee 1",
};

// ─── GOOGLE SHEETS AUTH ────────────────────────────────────────
const auth = new google.auth.GoogleAuth({
  credentials: GOOGLE_CREDS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// ─── DISCORD BOT ───────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  // Only listen in the dm-log channel, ignore bots
  if (message.author.bot) return;
  if (message.channelId !== DM_LOG_CHANNEL) return;

  const content  = message.content.trim().toLowerCase();
  const username = message.author.username.toLowerCase();
  const match    = content.match(/^!dms\s+(\d+)$/);

  if (!match) {
    // If they type something wrong, help them
    if (content.startsWith("!dms")) {
      message.reply("❌ Wrong format! Use: `!dms 50` (just the number, no extra text)");
    }
    return;
  }

  const dmCount  = parseInt(match[1]);
  const empName  = EMPLOYEE_MAP[username];

  if (!empName) {
    message.reply(`❌ Your Discord username **${username}** isn't mapped to a sheet tab. Ask your manager to add you.`);
    return;
  }

  const today    = new Date();
  const dateStr  = today.toISOString().split("T")[0]; // yyyy-mm-dd
  const displayDate = today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  try {
    // Read existing DM Log sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "DM Log!A:D",
    });

    const rows     = response.data.values || [];
    let   updated  = false;
    let   updateRow = -1;

    // Check if entry already exists for today + this user
    for (let i = 1; i < rows.length; i++) {
      const rowDate = rows[i][0] || "";
      const rowUser = (rows[i][1] || "").toLowerCase();
      if (rowDate === dateStr && rowUser === username) {
        updateRow = i + 1; // 1-indexed for Sheets API
        updated   = true;
        break;
      }
    }

    if (updated) {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `DM Log!A${updateRow}:D${updateRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [[dateStr, username, empName, dmCount]] },
      });
      message.reply(`✅ Updated! **${empName}** — ${dmCount} DMs logged for ${displayDate} 📊`);
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "DM Log!A:D",
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [[dateStr, username, empName, dmCount]] },
      });
      message.reply(`✅ Logged! **${empName}** — ${dmCount} DMs for ${displayDate} 📊`);
    }

    console.log(`Logged: ${empName} = ${dmCount} DMs on ${dateStr}`);

  } catch (err) {
    console.error("Sheets error:", err.message);
    message.reply("❌ Something went wrong writing to the sheet. Check bot logs.");
  }
});

// Keep alive ping (Railway sleeps on free tier after inactivity)
const http = require("http");
http.createServer((req, res) => res.end("Bot alive")).listen(process.env.PORT || 3000);

client.login(BOT_TOKEN);
