import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createApp } from "../src/server.js";
import { createWebhookRouter } from "../src/routes/webhook.js";
import config from "../src/config.js";
import {
  buildGeminiRequestPayload,
  generateReply,
  isGeminiQuotaExhausted,
} from "../src/services/deepseek.js";
import { detectLanguageStyle } from "../src/utils/detectLanguageStyle.js";
import { extractMessage } from "../src/utils/extractMessage.js";
import { analyseImage } from "../src/services/imageAnalysis.js";
import {
  getMediaByIntent,
  getSampleImage,
  listMedia,
} from "../src/services/mediaLibrary.js";

function createMemoryHarness() {
  const state = {
    messages: new Map(),
    media: new Map(),
    languageStyles: new Map(),
    conversation: new Map(),
  };

  const ensure = (map, key) => {
    if (!map.has(key)) {
      map.set(key, []);
    }

    return map.get(key);
  };

  return {
    state,
    getLanguageStyle(userId) {
      return state.languageStyles.get(userId) || "english";
    },
    getRecentMessages(userId, limit = 8) {
      return ensure(state.messages, userId).slice(-limit);
    },
    getConversationState(userId) {
      return state.conversation.get(userId) || {};
    },
    clearHistory(userId) {
      state.messages.delete(userId);
      state.media.delete(userId);
      state.languageStyles.delete(userId);
      state.conversation.delete(userId);
    },
    setLanguageStyle(userId, style) {
      state.languageStyles.set(userId, style);
    },
    setConversationState(userId, patch) {
      state.conversation.set(userId, {
        ...(state.conversation.get(userId) || {}),
        ...(patch || {}),
      });
    },
    addUserMessage(userId, text) {
      ensure(state.messages, userId).push({ role: "user", content: text });
    },
    addAssistantMessage(userId, text) {
      ensure(state.messages, userId).push({ role: "assistant", content: text });
    },
    addInboundMedia(userId, media) {
      const items = ensure(state.media, userId);
      items.push(media);
      state.media.set(userId, items.slice(-5));
    },
  };
}

async function withTestServer(app, callback) {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

function createWebhookApp(overrides = {}) {
  const memory = createMemoryHarness();
  const sentTexts = [];
  const sentTextAndImages = [];
  const sentImages = [];
  const generatedReplies = [];
  const analysedImages = [];
  const logs = [];
  const router = createWebhookRouter({
    config: {
      verifyToken: "verify123",
      webhookDebounceMs: 0,
      requestTimeoutMs: 5000,
      ...overrides.config,
    },
    processingState: overrides.processingState,
    clearHistory: memory.clearHistory,
    getConversationState: memory.getConversationState,
    getLanguageStyle: memory.getLanguageStyle,
    getRecentMessages: memory.getRecentMessages,
    setConversationState: memory.setConversationState,
    setLanguageStyle: memory.setLanguageStyle,
    addUserMessage: memory.addUserMessage,
    addAssistantMessage: memory.addAssistantMessage,
    addInboundMedia: memory.addInboundMedia,
    sendTextMessage: async (senderId, text) => {
      sentTexts.push({ senderId, text });
    },
    sendTextAndImage: async (senderId, text, url) => {
      sentTextAndImages.push({ senderId, text, url });
    },
    sendImageMessage: async (senderId, url) => {
      sentImages.push({ senderId, url });
    },
    generateReply: async ({ languageStyle, currentText }) => {
      generatedReplies.push({ languageStyle, currentText });
      return overrides.replyText || "Hamro team le herera chittai reply garchha.";
    },
    analyseImage: async (payload) => {
      analysedImages.push(payload);
      return {
        reply:
          overrides.imageReply ||
          "Photo pathaunu bhayeko ma dhanyabad. Hamro team le herera reply garchha.",
      };
    },
    buildPrompt: ({ userId, currentText, languageStyle, matchedPatternGuidance }) => [
      {
        role: "system",
        content: `${userId}|${languageStyle}|${matchedPatternGuidance || "none"}`,
      },
      { role: "user", content: currentText },
    ],
    getBestPatternMatch: (text) => {
      if (text.includes("price")) {
        return { intent: "non_mba_price", guidance: "price guidance" };
      }

      return null;
    },
    info: (...args) => logs.push({ level: "info", args }),
    warn: (...args) => logs.push({ level: "warn", args }),
    error: (...args) => logs.push({ level: "error", args }),
    sleep: async () => {},
    ...overrides.deps,
  });

  return {
    app: createApp(router),
    memory,
    sentTexts,
    sentTextAndImages,
    sentImages,
    generatedReplies,
    analysedImages,
    logs,
  };
}

function buildTextWebhook({ mid = "m1", text = "hello", senderId = "user-1" } = {}) {
  return {
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: "page-1" },
            timestamp: Date.now(),
            message: {
              mid,
              text,
            },
          },
        ],
      },
    ],
  };
}

function buildImageWebhook({
  mid = "img-1",
  text = "",
  senderId = "user-1",
  url = "https://example.com/image.jpg",
} = {}) {
  return {
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: "page-1" },
            timestamp: Date.now(),
            message: {
              mid,
              text,
              attachments: [
                {
                  type: "image",
                  payload: {
                    url,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

test("language detection classifies english, roman nepali, nepali, and mixed", () => {
  assert.equal(detectLanguageStyle("Hello I need thesis help"), "english");
  assert.equal(detectLanguageStyle("english audaina", "english"), "roman_nepali");
  assert.equal(detectLanguageStyle("tapai kasari help गर्नुहुन्छ?", "english"), "mixed");
  assert.equal(detectLanguageStyle("tapai kasari huncha ho", "english"), "roman_nepali");
  assert.equal(detectLanguageStyle("मलाई thesis help चाहिन्छ", "english"), "mixed");
  assert.equal(detectLanguageStyle("मलाई सहयोग चाहिन्छ", "english"), "nepali");
});

test("extractMessage returns image attachments and metadata", () => {
  const extracted = extractMessage(
    buildImageWebhook({
      text: "photo pathaeko",
      url: "https://example.com/a.jpg",
    }).entry[0].messaging[0]
  );

  assert.equal(extracted.shouldReply, true);
  assert.equal(extracted.messageType, "image");
  assert.equal(extracted.images.length, 1);
  assert.equal(extracted.images[0].url, "https://example.com/a.jpg");
});

test("image analysis returns safe fallback when provider is none", async () => {
  const result = await analyseImage({
    imageUrl: "https://example.com/a.jpg",
    userText: "see this",
    languageStyle: "roman_nepali",
  });

  assert.equal(result.analysed, false);
  assert.equal(
    result.reply,
    "Photo pathaunu bhayeko ma dhanyabad. Hamro team le herera reply garchha."
  );
});

test("media library returns sample image for sample intent", () => {
  assert.ok(getSampleImage());
  assert.equal(getMediaByIntent("sample_image")?.intent, "sample_image");
});

test("gemini request payload keeps system instruction separate", () => {
  const payload = buildGeminiRequestPayload([
    { role: "system", content: "System rule." },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there" },
    { role: "user", content: "Need thesis help" },
  ]);

  assert.equal(payload.system_instruction.parts[0].text, "System rule.");
  assert.equal(payload.contents.length, 3);
  assert.equal(payload.contents[0].role, "user");
  assert.equal(payload.contents[1].role, "model");
  assert.equal(payload.contents[2].parts[0].text, "Need thesis help");
});

test("gemini quota exhaustion detection matches quota errors only", () => {
  assert.equal(
    isGeminiQuotaExhausted({
      status: 429,
      message: "You exceeded your current quota.",
      body: {
        error: {
          status: "RESOURCE_EXHAUSTED",
        },
      },
    }),
    true
  );

  assert.equal(
    isGeminiQuotaExhausted({
      status: 500,
      message: "Internal error",
    }),
    false
  );
});

test("generateReply falls back to DeepSeek only when Gemini quota is exhausted", async () => {
  const previousGeminiApiKey = config.geminiApiKey;
  const previousGeminiModel = config.geminiModel;
  const previousGeminiBaseUrl = config.geminiBaseUrl;

  config.geminiApiKey = "gemini-test-key";
  config.geminiModel = "gemini-2.5-flash";
  config.geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";

  try {
    const reply = await generateReply({
      currentText: "Need thesis help",
      languageStyle: "english",
      promptMessages: [
        { role: "system", content: "Reply briefly." },
        { role: "user", content: "Need thesis help" },
      ],
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        async text() {
          return JSON.stringify({
            error: {
              code: 429,
              status: "RESOURCE_EXHAUSTED",
              message: "You exceeded your current quota.",
            },
          });
        },
      }),
      deepseekRequest: async () => ({
        choices: [
          {
            message: {
              content: "DeepSeek fallback reply.",
            },
          },
        ],
      }),
    });

    assert.equal(reply, "DeepSeek fallback reply.");
  } finally {
    config.geminiApiKey = previousGeminiApiKey;
    config.geminiModel = previousGeminiModel;
    config.geminiBaseUrl = previousGeminiBaseUrl;
  }
});

test("generateReply uses Gemini response when quota is available", async () => {
  const previousGeminiApiKey = config.geminiApiKey;
  const previousGeminiModel = config.geminiModel;
  const previousGeminiBaseUrl = config.geminiBaseUrl;

  config.geminiApiKey = "gemini-test-key";
  config.geminiModel = "gemini-2.5-flash";
  config.geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";

  try {
    let deepseekCalled = false;
    const reply = await generateReply({
      currentText: "Need thesis help",
      languageStyle: "english",
      promptMessages: [
        { role: "system", content: "Reply briefly." },
        { role: "user", content: "Need thesis help" },
      ],
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "Gemini reply." }],
                },
              },
            ],
          });
        },
      }),
      deepseekRequest: async () => {
        deepseekCalled = true;
        return {
          choices: [{ message: { content: "Should not be used." } }],
        };
      },
    });

    assert.equal(reply, "Gemini reply.");
    assert.equal(deepseekCalled, false);
  } finally {
    config.geminiApiKey = previousGeminiApiKey;
    config.geminiModel = previousGeminiModel;
    config.geminiBaseUrl = previousGeminiBaseUrl;
  }
});

test("app serves root, health, and webhook verification", async () => {
  const { app } = createWebhookApp();

  await withTestServer(app, async (baseUrl) => {
    const rootResponse = await fetch(`${baseUrl}/`);
    assert.equal(rootResponse.status, 200);
    assert.equal(await rootResponse.text(), "Bot running");

    const healthResponse = await fetch(`${baseUrl}/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { ok: true });

    const webhookResponse = await fetch(
      `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=verify123&hub.challenge=abc123`
    );
    assert.equal(webhookResponse.status, 200);
    assert.equal(await webhookResponse.text(), "abc123");

    const mediaResponse = await fetch(
      `${baseUrl}/media/thesis-master/01-formatting-support.png`
    );
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.headers.get("content-type"), "image/png");
  });
});

test("text webhook stores detected language and sends a concise reply", async () => {
  const harness = createWebhookApp({
    replyText: "Hamro team le herera chittai reply garchha.",
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "tapai ko service kati ho",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTexts.length, 1);
  assert.equal(
    harness.memory.state.languageStyles.get("user-1"),
    "roman_nepali"
  );
});

test("thank-you style text is ignored", async () => {
  const harness = createWebhookApp({
    replyText: "Hajur, aru ke help chahinchha?",
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "dhanyabad",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 0);
  assert.equal(harness.generatedReplies.length, 0);
});

test("greeting resets old context before a new natural request", async () => {
  const harness = createWebhookApp({
    replyText:
      "Huncha. Full thesis support available chha. Tapai ko subject ra deadline pathaunus.",
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = [
      "topic",
      "hi",
      "I need a thesis to be completely done",
    ];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `reset-flow-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 3);
  assert.equal(harness.generatedReplies.length, 0);
  assert.match(harness.sentTexts[2].text, /full thesis support/i);
  assert.doesNotMatch(harness.sentTexts[2].text, /topic support/i);
});

test("subject list question gets a human subject list reply", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "kun kun subject ko hunxa",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTexts.length, 1);
  assert.match(harness.sentTexts[0].text, /MBA|MBS|MEd/i);
  assert.equal(harness.generatedReplies.length, 0);
});

test("subject after subject list stays conversational instead of jumping to price", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["kun kun subject ko hunxa", "med"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `subject-list-followup-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /MEd/i);
  assert.match(harness.sentTexts[1].text, /Full thesis|proposal/i);
  assert.doesNotMatch(harness.sentTexts[1].text, /25,000|20,000|5,000/i);
});

test("proposal not ready message gets a natural proposal-start reply", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "proposal baney ko xaina mero",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTexts.length, 1);
  assert.match(harness.sentTexts[0].text, /proposal/i);
  assert.match(harness.sentTexts[0].text, /subject|deadline/i);
  assert.doesNotMatch(harness.sentTexts[0].text, /for proposal|for mero/i);
});

test("proposal not ready variants with xaina or chhaina stay natural", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["proposal xaina", "proposal chhaina"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `proposal-not-ready-${index + 1}`,
            text,
            senderId: `proposal-user-${index + 1}`,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[0].text, /proposal/i);
  assert.match(harness.sentTexts[1].text, /proposal/i);
  assert.doesNotMatch(harness.sentTexts[0].text, /for proposal/i);
  assert.doesNotMatch(harness.sentTexts[1].text, /for proposal/i);
});

test("deadline without subject after proposal request asks for subject first", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["proposal only", "1 month"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `proposal-subject-gap-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /subject|programme|program/i);
  assert.doesNotMatch(harness.sentTexts[1].text, /management|social science/i);
});

test("combined topic deadline cost query asks for exact subject first", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "Lake eutrophication topic. Deadline 1 month cost?",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 1);
  assert.match(harness.sentTexts[0].text, /subject|programme|program/i);
  assert.doesNotMatch(harness.sentTexts[0].text, /full thesis|proposal only/i);
});

test("price wording is not mistaken for clarification", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["mba ko thesis hunxa", "what's the cost"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `price-wording-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /30,000|30000|price|cost/i);
  assert.doesNotMatch(harness.sentTexts[1].text, /what do you mean/i);
});

test("proposal pricing question gives proposal-aware answer", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "what is the cost for MBA proposal",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTexts.length, 1);
  assert.match(harness.sentTexts[0].text, /MBA/i);
  assert.match(harness.sentTexts[0].text, /proposal/i);
  assert.doesNotMatch(harness.sentTexts[0].text, /exact requirement and I will guide you/i);
});

test("normal topic price conversation does not send an image", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "price kati ko topic banauna",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentImages.length, 0);
});

test("short unclear text is ignored", async () => {
  const harness = createWebhookApp({
    replyText: "Ma sir lai sodhera bhanxu hai.",
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "k bho",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 0);
  assert.equal(harness.generatedReplies.length, 0);
});

test("general thesis question uses text reply without sending image", async () => {
  const harness = createWebhookApp({
    replyText: "Huncha. Tapai full thesis chahinchha ki proposal matra?",
    deps: {
      getBestPatternMatch: (text) => {
        if (text.includes("thesis")) {
          return {
            intent: "general_thesis_help",
            guidance: "Confirm if the user wants thesis help from us.",
          };
        }

        return null;
      },
    },
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "thesis hunxa?",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 1);
  assert.equal(harness.generatedReplies.length, 0);
});

test("topic guidance question does not send an image", async () => {
  const harness = createWebhookApp({
    replyText: "Tapai ko subject k ho? Ma sir lai sodhera ramro topic bhanxu hai.",
    deps: {
      getBestPatternMatch: (text) => {
        if (text.includes("topic")) {
          return {
            intent: "topic_support",
            guidance: "Confirm if the user wants us to help with topic selection.",
          };
        }

        return null;
      },
    },
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "topic k garne?",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 1);
  assert.equal(harness.generatedReplies.length, 0);
});

test("topic follow-up uses recent conversation memory", async () => {
  const harness = createWebhookApp({
    deps: {
      getBestPatternMatch: (text) => {
        if (text.includes("topic")) {
          return {
            intent: "topic_support",
            guidance: "Help the user with topic support.",
          };
        }

        return null;
      },
    },
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["topic", "mba finance ko lagi"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `topic-flow-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[0].text, /topic support/i);
  assert.match(harness.sentTexts[1].text, /MBA finance/i);
  assert.match(harness.sentTexts[1].text, /topic/i);
  assert.equal(harness.generatedReplies.length, 0);
});

test("title only follow-up is handled after topic scope question", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["mba finance ko lagi topic", "title only"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `title-only-flow-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /title/i);
  assert.match(harness.sentTexts[1].text, /deadline/i);
});

test("price follow-up uses recent conversation memory", async () => {
  const harness = createWebhookApp({
    deps: {
      getBestPatternMatch: (text) => {
        if (text.includes("kati")) {
          return {
            intent: "exact_price_unclear_scope",
            guidance: "Ask for subject to guide pricing.",
          };
        }

        return null;
      },
    },
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["price kati ho", "med"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `price-flow-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /MEd/i);
  assert.match(harness.sentTexts[1].text, /20,000|20000/i);
  assert.equal(harness.generatedReplies.length, 0);
});

test("english pricing follow-up stays in english after subject reply", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["What's the cost?", "MBA"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `english-price-followup-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /For MBA|MBA thesis support is available/i);
  assert.doesNotMatch(harness.sentTexts[1].text, /huncha|matra|ko/i);
});

test("affirmative scope reply asks user to choose between full thesis and proposal", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["mba ko thesis hunxa", "yes"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `scope-yes-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /full thesis|proposal/i);
  assert.doesNotMatch(harness.sentTexts[1].text, /meaning/i);
});

test("scope follow-up treats only proposal as scope answer", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["mba finance ko lagi topic", "only proposal"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `scope-flow-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /proposal/i);
  assert.match(harness.sentTexts[1].text, /deadline/i);
  assert.doesNotMatch(harness.sentTexts[1].text, /for only/i);
});

test("scope clarification explains previous choice question", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["mba finance ko lagi topic", "yes"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `clarify-flow-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /topic titles|proposal support/i);
});

test("deadline clarification explains deadline meaning", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["mba topic", "only proposal", "what"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `deadline-clarify-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 3);
  assert.match(harness.sentTexts[2].text, /deadline/i);
  assert.match(harness.sentTexts[2].text, /submission|date|samma/i);
});

test("science follow-up asks for exact subject instead of confirming", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["full thesis", "on science"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `science-flow-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /exact subject|management|social science/i);
});

test("unsupported subject candidate after subject prompt does not get ignored", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["science", "biotechnology"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `unsupported-subject-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /management|social science|Exact subject/i);
  assert.equal(harness.generatedReplies.length, 0);
});

test("pricing after unsupported subject still asks for exact subject", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["science", "price kati ho"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `unsupported-price-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[1].text, /subject|programme|program/i);
  assert.doesNotMatch(harness.sentTexts[1].text, /30,000|25,000|20,000/i);
});

test("deadline follow-up treats 1 month as timeline not subject", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const messages = ["med", "only proposal", "1 month"];

    for (const [index, text] of messages.entries()) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildTextWebhook({
            mid: `timeline-flow-${index + 1}`,
            text,
          })
        ),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTexts.length, 3);
  assert.match(harness.sentTexts[2].text, /timeline|milcha|possible|subject/i);
  assert.doesNotMatch(harness.sentTexts[2].text, /for 1 month/i);
});

test("conversation memory stays isolated per sender", async () => {
  const harness = createWebhookApp({
    deps: {
      getBestPatternMatch: (text) => {
        if (text.includes("topic")) {
          return {
            intent: "topic_support",
            guidance: "Help the user with topic support.",
          };
        }

        return null;
      },
    },
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const events = [
      { mid: "iso-1", senderId: "user-a", text: "topic" },
      { mid: "iso-2", senderId: "user-b", text: "mba finance ko lagi" },
    ];

    for (const event of events) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildTextWebhook(event)),
      });

      assert.equal(response.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 2);
  assert.match(harness.sentTexts[0].text, /topic/i);
  assert.doesNotMatch(harness.sentTexts[1].text, /topic/i);
  assert.match(harness.sentTexts[1].text, /MBA/i);
});

test("what to do next question stays text only", async () => {
  const harness = createWebhookApp({
    replyText: "Tapai ko subject ra level pathaunus. Ani next step bhanchu.",
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "what to do next?",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 1);
});

test("analysis request gets a direct text reply", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "Do you do statistics analysis?",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTexts.length, 1);
  assert.match(harness.sentTexts[0].text, /analysis/i);
  assert.match(harness.sentTexts[0].text, /subject|deadline|tool/i);
  assert.equal(harness.generatedReplies.length, 0);
});

test("deadline-first message asks for subject and required work", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "deadline 1 month",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTexts.length, 1);
  assert.match(harness.sentTexts[0].text, /subject|required work/i);
  assert.equal(harness.generatedReplies.length, 0);
});

test("subject only message stays text only for MEd", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "Med",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 1);
  assert.match(harness.sentTexts[0].text, /MEd/i);
  assert.equal(harness.generatedReplies.length, 0);
});

test("english subject reply stays in english", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "MEd thesis",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTexts.length, 1);
  assert.match(harness.sentTexts[0].text, /Do you need full thesis or proposal only/i);
  assert.doesNotMatch(harness.sentTexts[0].text, /huncha|matra|ko/i);
});

test("natural subject sentence keeps a clean subject label", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "Can you do my full thesis for MBA finance?",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTexts.length, 1);
  assert.match(harness.sentTexts[0].text, /MBA/i);
  assert.doesNotMatch(harness.sentTexts[0].text, /can you do my/i);
});

test("subject only message stays text only for rural development", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "Rural development",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 1);
  assert.match(harness.sentTexts[0].text, /Rural Development/i);
  assert.equal(harness.generatedReplies.length, 0);
});

test("short subject aliases do not match unrelated words", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "I need immediate help",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 0);
  assert.equal(harness.generatedReplies.length, 0);
});

test("unknown non-domain text is ignored", async () => {
  const harness = createWebhookApp({
    replyText: "I will confirm and get back to you.",
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "theaiaaa",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 0);
  assert.equal(harness.generatedReplies.length, 0);
});

test("suppressed AI reply does not send a message", async () => {
  const harness = createWebhookApp({
    deps: {
      buildDirectReply: () => null,
      isThesisDomainText: () => true,
      generateReply: async () => null,
    },
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "Need help with thesis structure",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTexts.length, 0);
  assert.equal(harness.sentTextAndImages.length, 0);
});

test("image webhook stores inbound image and sends safe fallback", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildImageWebhook({
          text: "यो photo हो",
          url: "https://example.com/photo.jpg",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.analysedImages.length, 1);
  assert.equal(harness.sentTexts.length, 1);
  assert.equal(
    harness.memory.state.media.get("user-1")[0].url,
    "https://example.com/photo.jpg"
  );
});

test("sample image intent sends one caption and one image payload", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "sample pic pathaunu",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 1);
  assert.equal(harness.sentTexts.length, 0);
  assert.match(
    harness.sentTextAndImages[0].url,
    /\/media\/thesis-master\/14-sample-request\.png$/
  );
});

test("natural english sentence asking for sample image sends one image", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "Can you send a sample image?",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 1);
  assert.equal(harness.sentTexts.length, 0);
});

test("roman nepali image request with polite particle sends one image", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "photo pathaunu na",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 1);
  assert.equal(harness.sentTexts.length, 0);
});

test("short direct image command still sends one image", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "mba image",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 1);
  assert.match(
    harness.sentTextAndImages[0].url,
    /\/media\/thesis-master\/02-mba-thesis-support\.png$/
  );
});

test("themed image request sends the matching themed asset", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "mba ko sample pic pathaunu",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 1);
  assert.match(
    harness.sentTextAndImages[0].url,
    /\/media\/thesis-master\/02-mba-thesis-support\.png$/
  );
});

test("price list image request sends the pricing creative", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "price list image pathaunu",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 1);
  assert.match(
    harness.sentTextAndImages[0].url,
    /\/media\/thesis-master\/11-pricing-inquiry\.png$/
  );
});

test("natural poster phrasing sends the MBA creative", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "malai mba wala poster pathaunu",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 1);
  assert.match(
    harness.sentTextAndImages[0].url,
    /\/media\/thesis-master\/02-mba-thesis-support\.png$/
  );
});

test("banner phrasing sends the pricing creative", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "pricing ko banner deu",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 1);
  assert.match(
    harness.sentTextAndImages[0].url,
    /\/media\/thesis-master\/11-pricing-inquiry\.png$/
  );
});

test("theme word alone does not send an image", async () => {
  const harness = createWebhookApp();

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "formating",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 1);
});

test("availability question does not send an image", async () => {
  const harness = createWebhookApp({
    replyText: "Huncha. Tapai lai sample image chahinchha bhane pathaidiula.",
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "image cha?",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 0);
});

test("send sample without image word stays text only", async () => {
  const harness = createWebhookApp({
    replyText: "Sample image chahinchha bhane sample pic pathaunu bhanera bhannus.",
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "send sample",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 0);
});

test("all photos phrasing sends all images", async () => {
  const harness = createWebhookApp();
  const expectedMediaCount = listMedia("http://127.0.0.1").length;

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "all photos that you have",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.equal(harness.sentTextAndImages.length, 1);
  assert.equal(harness.sentImages.length, expectedMediaCount - 1);
  assert.match(
    harness.sentTextAndImages[0].url,
    /\/media\/thesis-master\/01-formatting-support\.png$/
  );
});

test("negative photo phrasing does not send an image", async () => {
  const harness = createWebhookApp({
    replyText: "Kripaya photo send nagarnus bhane bujheko chhu.",
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "Ho ra.. photo send nagari hudaina",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 0);
});

test("why did you send photo complaint does not send another image", async () => {
  const harness = createWebhookApp({
    replyText: "Photo kina pathaeko ho bhanera bujheko chhu. Aba image pathaudaina.",
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "Kina send garey ko photo",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTextAndImages.length, 0);
  assert.equal(harness.sentTexts.length, 0);
});

test("duplicate message ids are ignored", async () => {
  const harness = createWebhookApp();
  const body = buildTextWebhook({
    mid: "same-mid",
    text: "hello thesis help",
  });

  await withTestServer(harness.app, async (baseUrl) => {
    for (let index = 0; index < 2; index += 1) {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      assert.equal(response.status, 200);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  assert.equal(
    harness.sentTexts.length + harness.sentTextAndImages.length,
    1
  );
});

test("processing errors trigger a concise fallback reply", async () => {
  const harness = createWebhookApp({
    deps: {
      buildDirectReply: () => null,
      isThesisDomainText: () => true,
      generateReply: async () => {
        throw new Error("boom");
      },
    },
  });

  await withTestServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildTextWebhook({
          text: "I need thesis guidance",
        })
      ),
    });

    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(harness.sentTexts.length, 1);
  assert.equal(harness.sentTexts[0].text, "Please try again shortly.");
});

test("messenger service sends the correct text and image payloads", async () => {
  const requests = [];
  const apiServer = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      requests.push({
        url: req.url,
        body: JSON.parse(body || "{}"),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, message_id: `m-${requests.length}` }));
    });
  });

  apiServer.listen(0, "127.0.0.1");
  await once(apiServer, "listening");
  const address = apiServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        "node",
        [
          "--input-type=module",
          "-e",
          [
            "import { sendTextAndImage } from './src/services/messenger.js';",
            "await sendTextAndImage('psid-1', 'Yo sample image ho.', 'https://example.com/sample.png');",
          ].join(" "),
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PORT: process.env.PORT || "3000",
            VERIFY_TOKEN: process.env.VERIFY_TOKEN || "verify123",
            PAGE_ACCESS_TOKEN: "test-page-token",
            MESSENGER_API_BASE_URL: baseUrl,
            DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "test-key",
            DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
            DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || "deepseek-chat",
          },
          stdio: "pipe",
        }
      );

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr || `Child exited with code ${code}`));
      });
    });
  } finally {
    await new Promise((resolve, reject) => {
      apiServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /access_token=test-page-token/);
  assert.equal(requests[0].body.message.text, "Yo sample image ho.");
  assert.equal(requests[1].body.message.attachment.type, "image");
  assert.equal(
    requests[1].body.message.attachment.payload.url,
    "https://example.com/sample.png"
  );
});
