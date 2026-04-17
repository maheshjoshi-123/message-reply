export function extractMessage(event) {
  if (!event || typeof event !== "object") {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      reason: "Invalid event object",
    };
  }

  if (event.delivery) {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      reason: "Ignored delivery event",
    };
  }

  if (event.read) {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      reason: "Ignored read event",
    };
  }

  if (!event.message) {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      reason: "Ignored non-message event",
    };
  }

  if (event.message.is_echo) {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      reason: "Ignored echo message",
    };
  }

  const senderId = event.sender?.id ?? null;

  if (!senderId) {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      reason: "Missing sender id",
    };
  }

  if (typeof event.message.text !== "string") {
    return {
      shouldReply: false,
      senderId,
      text: null,
      reason: "Ignored attachments-only or unsupported message",
    };
  }

  const text = event.message.text.trim();

  if (!text) {
    return {
      shouldReply: false,
      senderId,
      text: null,
      reason: "Ignored blank text message",
    };
  }

  return {
    shouldReply: true,
    senderId,
    text,
    reason: "Text message ready for reply",
  };
}
