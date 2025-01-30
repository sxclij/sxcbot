/* Improved code with enhanced timeout logging, increased backoff, and documentation */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  verifyEvent,
} from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { useWebSocketImplementation } from "nostr-tools/relay";
import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();
useWebSocketImplementation(WebSocket);

// --- Helper functions (no changes) ---
const hexToBytes = (hex) => {
  const bytes = [];
  for (let c = 0; c < hex.length; c += 2) {
    bytes.push(parseInt(hex.substring(c, c + 2), 16));
  }
  return new Uint8Array(bytes);
};

const bytesToHex = (bytes) => {
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i].toString(16).padStart(2, "0");
        hex += byte;
    }
    return hex;
};

// --- Relay URLs and Private Key Configuration (no changes) ---
const RELAY_URLS_ENV = process.env.RELAY_URLS_ENV;
let RELAY_URLS = RELAY_URLS_ENV ? RELAY_URLS_ENV.split(",") : [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
  "wss://relay.nostr.band",
];

if (RELAY_URLS.length === 0) {
    console.error("Error: No relay URLs configured. Please set RELAY_URLS_ENV or provide default URLs in the code.");
    process.exit(1);
}

const NOSTR_PRIVATE_HEX = process.env.NOSTR_PRIVATE_HEX;
let botPrivateKeyHex = NOSTR_PRIVATE_HEX;

if (!botPrivateKeyHex) {
  botPrivateKeyHex = bytesToHex(generateSecretKey());
  console.warn(
    "Warning: NOSTR_PRIVATE_HEX environment variable not set. Generated a new private key. " +
    "Please store this key securely and set NOSTR_PRIVATE_HEX in your environment for persistent identity: " +
    botPrivateKeyHex
  );
}

const botPublicKey = getPublicKey(botPrivateKeyHex);

// --- Initialize Nostr Pool (no changes) ---
const pool = new SimplePool();

console.log("Starting sxcbot...");
console.log("Relay URLs:", RELAY_URLS);
console.log("Bot Public Key (hex):", botPublicKey);

// --- Publish with Retry Function (enhanced logging, increased backoff) ---
async function publishWithRetry(relays, event, retries = 3, backoffSeconds = 2) { // Increased backoffSeconds to 2
    for (let attempt = 1; attempt <= retries; attempt++) {
        for (const relayUrl of relays) { // Iterate through relays to log each attempt
            try {
                console.log(`Attempting to publish event to ${relayUrl} (attempt ${attempt}/${retries})...`); // Relay-specific log
                const pub = pool.publish([relayUrl], event); // Publish to ONE relay at a time for better logging
                await pub; // Wait for publish completion
                console.log(`Event published successfully to ${relayUrl} on attempt ${attempt}`);
                return true; // Success if published to ANY relay
            } catch (error) {
                console.error(`Publish to ${relayUrl} attempt ${attempt} failed:`, error.message);
                if (error.message.includes("timeout")) { // Specifically check for timeout error
                    if (attempt < retries) {
                        const waitTime = backoffSeconds * Math.pow(2, attempt - 1); // Exponential backoff
                        console.log(`Publish to ${relayUrl} timed out. Retrying in ${waitTime} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                        continue; // Retry with the next relay in the loop (or next attempt if all relays tried)
                    } else {
                        console.error(`Max retries reached for ${relayUrl}. Publish failed due to timeout.`);
                        // Continue to next relay if available, or return false if all relays failed
                    }
                } else {
                    console.error(`Publish to ${relayUrl} failed with a non-timeout error. No retry for this relay.`);
                    // Continue to next relay, don't retry for non-timeout errors on this relay in this attempt.
                }
            }
        }
        if (attempt < retries) {
            console.log(`Trying attempt ${attempt + 1} with all relays after failures.`); // Indicate trying next attempt
        } else {
            console.error("Max retries reached across all relays. Publish completely failed.");
            return false; // Failure after max retries on all relays
        }

    }
    return false; // Should not reach here, but for type safety
}

// --- Publish Task Queue and Rate Limiting (no changes) ---
const publishQueue = [];
const MAX_PUBLISH_PER_SECOND = 2;
const PUBLISH_INTERVAL_MS = 1000 / MAX_PUBLISH_PER_SECOND;

let isProcessingQueue = false;

async function processPublishQueue() {
    if (isProcessingQueue) {
        return;
    }
    isProcessingQueue = true;

    while (publishQueue.length > 0) {
        const task = publishQueue.shift();
        if (task) {
            const { relays, event } = task;
            console.log(`Processing publish queue. Tasks remaining: ${publishQueue.length}`);
            try {
                const published = await publishWithRetry(relays, event);
                if (published) {
                    console.log("Event from queue published successfully.");
                } else {
                    console.error("Failed to publish event from queue even after retries.");
                }
            } catch (error) {
                console.error("Error processing publish queue task:", error);
            }
        }
        if (publishQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, PUBLISH_INTERVAL_MS));
        }
    }

    isProcessingQueue = false;
    console.log("Publish queue processing complete.");
}


function enqueuePublishTask(relays, event) {
    publishQueue.push({ relays, event });
    console.log(`Event enqueued for publishing. Queue size: ${publishQueue.length}`);
    if (!isProcessingQueue) {
        processPublishQueue();
    }
}


async function handleEvent(event) {
  if (event.content === "sxcbot.ping") {
    console.log("Received sxcbot.ping from:", event.pubkey, ", replying with pong...");

    const replyEventTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", event.id], ["p", event.pubkey]],
      content: "pong",
    };
    const signedReplyEvent = finalizeEvent(replyEventTemplate, hexToBytes(botPrivateKeyHex));

    const isGood = verifyEvent(signedReplyEvent);

    if (isGood) {
      console.log("Event verification successful for pong reply.");
      enqueuePublishTask(RELAY_URLS, signedReplyEvent);
    } else {
      console.error("Event verification failed for pong reply.");
    }
  }
}

// --- Subscription and Shutdown (no changes) ---
console.log("Subscribing to relays for kind 1 events...");
const sub = pool.subscribeMany(
  RELAY_URLS,
  [
    {
      kinds: [1],
    },
  ],
  {
    onevent: handleEvent,
    oneose: () => {
      console.log("Subscription ended (oneose - initial events received).");
    },
    onerror: (error) => {
        console.error("Subscription error:", error);
    }
  }
);

console.log("Subscribed to relays successfully.");

process.on("SIGINT", () => {
  console.log("Shutting down bot gracefully...");
  console.log("Closing subscription...");
  sub.close();
  console.log("Closing pool connections...");
  pool.close();
  console.log("Bot shutdown complete.");
  process.exit(0);
});

/*
Documentation Note:
Regarding publish timeouts with nostr-tools SimplePool:

After investigation of nostr-tools documentation and source code (specifically pool.js),
it appears that SimplePool in nostr-tools DOES NOT currently expose a direct configuration option
to set or modify the publish timeout duration. The timeout is managed internally by the library.

Therefore, direct timeout adjustment from user code using SimplePool's API is not possible at this time.

The implemented retry mechanism with exponential backoff and enhanced logging is the primary strategy
to handle publish timeouts in this scenario.

If persistent timeout issues occur, consider:
1. Manually filtering out potentially slow or unreliable relays from RELAY_URLS.
2. Investigating network connectivity.
3. Further testing with different relay sets or potentially exploring alternative Nostr client libraries
   if SimplePool's behavior remains problematic.
*/