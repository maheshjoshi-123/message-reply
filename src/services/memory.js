import config from "../config.js";

const userMemory = new Map();

function createEmptyUserState() {
  return {
    messages: [],
    meta: {
      preferredLanguageStyle: "english",
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
  return messages.slice(-config.memoryWindow);
}

export function getUserMemory(userId) {
  return getOrCreateUserState(userId);
}

export function getHistory(userId) {
  return [...getOrCreateUserState(userId).messages];
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
  state.meta.preferredLanguageStyle = languageStyle;
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

export function setLanguageStyle(userId, languageStyle) {
  const state = getOrCreateUserState(userId);
  state.meta.lastDetectedLanguageStyle = languageStyle;
  state.meta.preferredLanguageStyle = languageStyle;
}

export function getLanguageStyle(userId) {
  const state = getOrCreateUserState(userId);
  return state.meta.preferredLanguageStyle || state.meta.lastDetectedLanguageStyle;
}

export function clearHistory(userId) {
  userMemory.delete(userId);
}

// This memory is in-process only and resets whenever the server restarts.
