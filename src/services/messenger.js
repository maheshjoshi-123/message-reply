import axios from "axios";
import config from "../config.js";
import { error, info } from "../utils/logger.js";

const messengerClient = axios.create({
  baseURL: "https://graph.facebook.com/v23.0",
  timeout: 15000,
});

export async function sendTextMessage(recipientId, text) {
  const cleanText = typeof text === "string" ? text.trim() : "";

  if (!recipientId || !cleanText) {
    throw new Error("Recipient ID and non-empty text are required.");
  }

  try {
    const response = await messengerClient.post(
      "/me/messages",
      {
        recipient: { id: recipientId },
        message: { text: cleanText },
      },
      {
        params: {
          access_token: config.pageAccessToken,
        },
      }
    );

    info("Messenger reply sent successfully.", {
      recipientId,
      status: response.status,
      messageId: response.data?.message_id ?? null,
    });

    return response.data;
  } catch (err) {
    error("Messenger Send API request failed.", {
      recipientId,
      message: err.message,
      status: err.response?.status ?? null,
      data: err.response?.data ?? null,
    });
    throw err;
  }
}
