import config from "../config.js";

const userMemory = new Map();

function createEmptyUserState() {
  return {
    messages: [],
    media: [],
    meta: {
      languageStyle: "english",
      lastDetectedLanguageStyle: "english",
    },
  };
}

function getOrCreateUserState(userId) {
  if (!userMemory.has(userId)) {
    userMemory.set(userId, createEmptyUserState());
  }

  return userMemory.get(userId);
}

function trimMessages(messages) {
  return messages.slice(-config.maxMemoryMessages);
}

function trimMedia(media) {
  return media.slice(-5);
}

export function getUserMemory(userId) {
  return getOrCreateUserState(userId);
}

export function getHistory(userId) {
  return [...getOrCreateUserState(userId).messages];
}

export function getRecentMessages(userId, limit = config.maxMemoryMessages) {
  return getOrCreateUserState(userId).messages.slice(-limit);
}

export function addUserMessage(userId, text, languageStyle) {
  const cleanText = typeof text === "string" ? text.trim() : "";

  if (!cleanText) {
    return;
  }

  const state = getOrCreateUserState(userId);
  state.messages.push({
    role: "user",
    content: cleanText,
  });
  state.messages = trimMessages(state.messages);
  state.meta.lastDetectedLanguageStyle = languageStyle;
  state.meta.languageStyle = languageStyle;
}

export function addAssistantMessage(userId, text) {
  const cleanText = typeof text === "string" ? text.trim() : "";

  if (!cleanText) {
    return;
  }

  const state = getOrCreateUserState(userId);
  state.messages.push({
    role: "assistant",
    content: cleanText,
  });
  state.messages = trimMessages(state.messages);
}

export function addInboundMedia(userId, media) {
  if (!media || !media.url) {
    return;
  }

  const state = getOrCreateUserState(userId);
  state.media.push({
    direction: "inbound",
    type: media.type || "image",
    url: media.url,
    createdAt: media.createdAt || new Date().toISOString(),
  });
  state.media = trimMedia(state.media);
}

export function getRecentMedia(userId) {
  return [...getOrCreateUserState(userId).media];
}

export function setLanguageStyle(userId, languageStyle) {
  const state = getOrCreateUserState(userId);
  state.meta.lastDetectedLanguageStyle = languageStyle;
  state.meta.languageStyle = languageStyle;
}

export function getLanguageStyle(userId) {
  const state = getOrCreateUserState(userId);
  return state.meta.languageStyle || state.meta.lastDetectedLanguageStyle;
}

export function clearHistory(userId) {
  userMemory.delete(userId);
}

// This memory is in-process only and resets whenever the server restarts.
