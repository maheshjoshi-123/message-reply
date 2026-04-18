import axios from "axios";
import config from "../config.js";
import { withRetries } from "../utils/asyncTools.js";
import { error } from "../utils/logger.js";

const messengerClient = axios.create({
  baseURL: config.messengerApiBaseUrl,
  timeout: config.requestTimeoutMs,
});

async function sendMessage(recipientId, message) {
  if (!recipientId || !message) {
    throw new Error("Recipient ID and message payload are required.");
  }

  try {
    const response = await withRetries(
      () =>
        messengerClient.post(
          "/me/messages",
          {
            recipient: { id: recipientId },
            message,
          },
          {
            params: {
              access_token: config.pageAccessToken,
            },
          }
        ),
      {
        retries: config.retryCount,
        retryDelayMs: 300,
      }
    );

    return response.data;
  } catch (err) {
    error("Messenger Send API request failed.", {
      stage: "messenger_send",
      status: err.response?.status ?? null,
      detail: err.message,
    });
    throw err;
  }
}

export async function sendTextMessage(recipientId, text) {
  const cleanText = typeof text === "string" ? text.trim() : "";

  if (!cleanText) {
    throw new Error("Non-empty text is required.");
  }

  return sendMessage(recipientId, {
    text: cleanText,
  });
}

export async function sendImageMessage(recipientId, url) {
  const cleanUrl = typeof url === "string" ? url.trim() : "";

  if (!cleanUrl) {
    throw new Error("A public image URL is required.");
  }

  return sendMessage(recipientId, {
    attachment: {
      type: "image",
      payload: {
        url: cleanUrl,
        is_reusable: false,
      },
    },
  });
}

export async function sendTextAndImage(recipientId, text, url) {
  const cleanText = typeof text === "string" ? text.trim() : "";

  if (cleanText) {
    await sendTextMessage(recipientId, cleanText);
  }

  return sendImageMessage(recipientId, url);
}
