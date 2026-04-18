function extractImageAttachments(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];

  return attachments
    .filter((attachment) => attachment?.type === "image")
    .map((attachment) => ({
      type: "image",
      url: attachment?.payload?.url || null,
    }))
    .filter((attachment) => attachment.url);
}

export function extractMessage(event) {
  if (!event || typeof event !== "object") {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      messageId: null,
      images: [],
      messageType: "unknown",
      reason: "Invalid event object",
    };
  }

  if (event.delivery) {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      messageId: null,
      images: [],
      messageType: "delivery",
      reason: "Ignored delivery event",
    };
  }

  if (event.read) {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      messageId: null,
      images: [],
      messageType: "read",
      reason: "Ignored read event",
    };
  }

  if (!event.message) {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      messageId: null,
      images: [],
      messageType: "unsupported",
      reason: "Ignored non-message event",
    };
  }

  if (event.message.is_echo) {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      messageId: event.message.mid ?? null,
      images: [],
      messageType: "echo",
      reason: "Ignored echo message",
    };
  }

  const senderId = event.sender?.id ?? null;

  if (!senderId) {
    return {
      shouldReply: false,
      senderId: null,
      text: null,
      messageId: event.message.mid ?? null,
      images: [],
      messageType: "unsupported",
      reason: "Missing sender id",
    };
  }

  const text =
    typeof event.message.text === "string" ? event.message.text.trim() : null;
  const images = extractImageAttachments(event.message);
  const hasText = Boolean(text);
  const hasImages = images.length > 0;

  if (!hasText && !hasImages) {
    return {
      shouldReply: false,
      senderId,
      text: null,
      messageId: event.message.mid ?? null,
      images: [],
      messageType: "unsupported",
      reason: "Ignored unsupported attachment message",
    };
  }

  return {
    shouldReply: true,
    senderId,
    text: hasText ? text : "",
    messageId: event.message.mid ?? null,
    images,
    messageType: hasImages ? "image" : "text",
    reason: hasImages ? "Image message ready for reply" : "Text message ready for reply",
  };
}
