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

// Start with a single reliable relay for testing
const RELAY_URLS = [
  "wss://relay.damus.io",
  // "wss://relay.snort.social",
  // "wss://relay.nostr.band",
  // Add more relays as needed later, one by one to debug
];

const BOT_PRIVATE_KEY_ENV = process.env.NOSTR_PRIVATE_HEX;

const botPrivateKeyHex = BOT_PRIVATE_KEY_ENV
  ? String(BOT_PRIVATE_KEY_ENV)
  : bytesToHex(generateSecretKey());

const botPublicKey = getPublicKey(botPrivateKeyHex);

const pool = new SimplePool();

async function handleEvent(event) {
  if (event.content === "sxcbot.ping") {
    console.log("Received sxcbot.ping, replying with pong...");

    const replyEventTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", event.id]], // reply event
      content: "pong",
    };
    const signedReplyEvent = finalizeEvent(replyEventTemplate, hexToBytes(botPrivateKeyHex));

    const isGood = verifyEvent(signedReplyEvent);

    if (isGood) {
      console.log("Event verification successful.");
      try {
          console.log("Attempting to publish pong event..."); // Log before publish
          const pub = pool.publish(RELAY_URLS, signedReplyEvent);
          console.log("Type of pub:", typeof pub); // <--- Add this line

          // Remove the .on() event handlers for now:
          // pub.on('ok', (relayUrl) => {
          //     console.log(`Published pong event to ${relayUrl}`);
          // });
          // pub.on('failed', (relayUrl, error) => {
          //     console.error(`Failed to publish to ${relayUrl}:`, error);
          // });

          await pub; // Wait for publish to complete or fail
          console.log("Publish operation completed (either ok or failed)."); // Log after publish attempt

      } catch (error) {
         console.error("Error publishing pong event (catch block):", error); // Catch any errors during publish
      }
    } else {
      console.log("Event verification failed.");
    }
  }
}

const sub = pool.subscribeMany(
  RELAY_URLS,
  [
    {
      kinds: [1], // Text notes
    },
  ],
  {
    onevent: handleEvent,
    oneose: () => {
      console.log("Subscription ended (oneose).");
    },
    oneoeose: () => {
      console.log("Subscription ended (oneoeose).");
    }
  }
);

console.log("Subscribed to relays:", RELAY_URLS);

process.on("SIGINT", () => {
  console.log("Shutting down...");
  sub.close();
  pool.close();
  process.exit(0);
});