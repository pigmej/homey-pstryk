#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Read JSON file helper
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

// Read all JSON files from a directory
function readJSONDir(dirPath) {
  try {
    const files = fs.readdirSync(dirPath);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const content = readJSON(path.join(dirPath, f));
        if (!content) return null;
        // Extract id from filename (remove .json extension)
        const id = f.replace(".json", "");
        return { filename: f, id, ...content };
      })
      .filter(Boolean);
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
    return [];
  }
}

// Generate README content
function generateReadme() {
  const appInfo = readJSON(".homeycompose/app.json");
  const capabilities = readJSONDir(".homeycompose/capabilities");
  const actions = readJSONDir(".homeycompose/flow/actions");
  const conditions = readJSONDir(".homeycompose/flow/conditions");
  const triggers = readJSONDir(".homeycompose/flow/triggers");

  let readme = `# ${appInfo.name.en}\n\n`;
  readme += `${appInfo.description.en}\n\n`;
  readme += `**Version:** ${appInfo.version}\n`;
  readme += `**Author:** ${appInfo.author.name}\n\n`;

  // Table of Contents
  readme += `## Table of Contents\n\n`;
  readme += `- [Features](#features)\n`;
  readme += `- [Capabilities](#capabilities)\n`;
  readme += `- [Flow Cards](#flow-cards)\n`;
  readme += `  - [Triggers](#triggers)\n`;
  readme += `  - [Conditions](#conditions)\n`;
  readme += `  - [Actions](#actions)\n`;
  readme += `- [Installation](#installation)\n`;
  readme += `- [Configuration](#configuration)\n\n`;

  // Features
  readme += `## Features\n\n`;
  readme += `- Real-time electricity price monitoring from PSTRYK API\n`;
  readme += `- Price position tracking with tie-aware ranking\n`;
  readme += `- Smart usage period detection (cheap/expensive hours)\n`;
  readme += `- Multiple time window analysis (4h, 8h, 12h, 24h, 36h)\n`;
  readme += `- Automatic price data refresh\n`;
  readme += `- Energy consumption monitoring with PSTRYK meter\n\n`;

  // Capabilities
  readme += `## Capabilities\n\n`;
  readme += `The app provides the following device capabilities:\n\n`;

  // Group capabilities by category
  const capabilityGroups = {
    "Price Information": capabilities.filter(
      (c) => c.id && (c.id.includes("price") || (c.id.includes("value") && !c.id.includes("cheapest"))),
    ),
    "Cheapest Hours": capabilities.filter((c) => c.id && c.id.includes("cheapest_h")),
    "Usage Periods": capabilities.filter(
      (c) => c.id && (c.id.includes("maximise") || c.id.includes("minimise") || c.id.includes("currently")),
    ),
    "Ranking & Position": capabilities.filter(
      (c) => c.id && (c.id.includes("in_cheapest") || c.id.includes("position")),
    ),
    System: capabilities.filter((c) => c.id && (c.id.includes("cache") || c.id.includes("daily_average"))),
    "Meter Measurements": capabilities.filter((c) => c.id && c.id.includes("measure_")),
  };

  for (const [groupName, caps] of Object.entries(capabilityGroups)) {
    if (caps.length > 0) {
      readme += `### ${groupName}\n\n`;
      readme += `| Capability | Description | Type |\n`;
      readme += `|------------|-------------|------|\n`;

      caps.forEach((cap) => {
        const title = cap.title?.en || cap.id;
        const desc = cap.desc?.en || "-";
        const type = cap.type || "-";
        readme += `| \`${cap.id}\` | ${desc} | ${type} |\n`;
      });

      readme += `\n`;
    }
  }

  // Flow Cards
  readme += `## Flow Cards\n\n`;

  // Triggers
  if (triggers.length > 0) {
    readme += `### Triggers\n\n`;
    readme += `These cards trigger flows when specific events occur:\n\n`;
    triggers.forEach((trigger) => {
      readme += `#### ${trigger.title?.en || trigger.id}\n`;
      readme += `${trigger.desc?.en || "No description available"}\n\n`;

      if (trigger.tokens && trigger.tokens.length > 0) {
        readme += `**Tokens:**\n`;
        trigger.tokens.forEach((token) => {
          readme += `- \`${token.name}\` (${token.type}): ${token.title?.en || token.name}\n`;
        });
        readme += `\n`;
      }
    });
  }

  // Conditions
  if (conditions.length > 0) {
    readme += `### Conditions\n\n`;
    readme += `These cards check conditions in your flows:\n\n`;

    // Group conditions by category
    const conditionGroups = {
      "Price Conditions": conditions.filter((c) => c.id && c.id.includes("price") && !c.id.includes("position")),
      "Position Conditions": conditions.filter((c) => c.id && c.id.includes("position")),
      "Period Conditions": conditions.filter((c) => c.id && (c.id.includes("period") || c.id.includes("currently"))),
      "Ranking Conditions": conditions.filter((c) => c.id && c.id.includes("in_cheapest")),
    };

    for (const [groupName, conds] of Object.entries(conditionGroups)) {
      if (conds.length > 0) {
        readme += `#### ${groupName}\n\n`;
        conds.forEach((cond) => {
          readme += `- **${cond.title?.en || cond.id}**: ${cond.desc?.en || "No description available"}\n`;
        });
        readme += `\n`;
      }
    }
  }

  // Actions
  if (actions.length > 0) {
    readme += `### Actions\n\n`;
    readme += `These cards perform actions in your flows:\n\n`;
    actions.forEach((action) => {
      readme += `#### ${action.title?.en || action.id}\n`;
      readme += `${action.desc?.en || "No description available"}\n\n`;

      if (action.args && action.args.length > 0) {
        readme += `**Arguments:**\n`;
        action.args.forEach((arg) => {
          if (arg.type !== "device") {
            readme += `- \`${arg.name}\` (${arg.type}): ${arg.title?.en || arg.placeholder?.en || arg.name}\n`;
          }
        });
        readme += `\n`;
      }
    });
  }

  // Installation
  readme += `## Installation\n\n`;
  readme += `1. Install the app from the Homey App Store\n`;
  readme += `2. Add a new PSTRYK Price device\n`;
  readme += `3. Configure your PSTRYK API key in the device settings\n`;
  readme += `4. Optionally configure the price refresh hour (default: 15:00)\n\n`;

  // Configuration
  readme += `## Configuration\n\n`;
  readme += `### Device Settings\n\n`;
  readme += `- **API Key**: Your PSTRYK API key (required)\n`;
  readme += `- **Price Refresh Hour**: Hour when price data should be refreshed (default: 15)\n`;
  readme += `- **Price Difference Threshold**: Percentage threshold for grouping similar prices (default: 10%)\n`;
  readme += `- **Today Label**: Custom label for today's date (default: "Today")\n`;
  readme += `- **Tomorrow Label**: Custom label for tomorrow's date (default: "Tomorrow")\n\n`;

  // Usage Examples
  readme += `## Usage Examples\n\n`;
  readme += `### Turn on device during cheapest hours\n\n`;
  readme += `**WHEN** Current hour in cheapest (8h) changed\n`;
  readme += `**AND** Current hour is among cheapest 3 (8h window)\n`;
  readme += `**THEN** Turn on washing machine\n\n`;

  readme += `### Alert when price is expensive\n\n`;
  readme += `**WHEN** Minimise period is active\n`;
  readme += `**THEN** Send notification "Electricity is expensive now"\n\n`;

  readme += `### Smart-ish EV charger control\n\n`;
  readme += `**WHEN** Current hour price position changed\n`;
  readme += `**AND** Current hour price position <= 3 (24h window)\n`;
  readme += `**THEN** Enable EV charger\n`;
  readme += `**ELSE** Disable EV charger\n\n`;

  // License & Support
  readme += `## License\n\n`;
  readme += `This is an unofficial PSTRYK integration. Use at your own risk.\n\n`;

  readme += `## Support\n\n`;
  readme += `For issues and feature requests, please use the GitHub issue tracker.\n`;

  return readme;
}

// Main execution
try {
  const readme = generateReadme();
  fs.writeFileSync("README.md", readme, "utf8");
  console.log("✓ README.md generated successfully");
} catch (error) {
  console.error("Error generating README:", error);
  process.exit(1);
}
