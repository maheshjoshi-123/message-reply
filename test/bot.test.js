import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createApp } from "../src/server.js";
import { createWebhookRouter } from "../src/routes/webhook.js";
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
    setLanguageStyle(userId, style) {
      state.languageStyles.set(userId, style);
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
    getLanguageStyle: memory.getLanguageStyle,
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

test("text webhook keeps normal AI flow and stores detected language", async () => {
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

  assert.equal(harness.generatedReplies.length, 1);
  assert.equal(harness.generatedReplies[0].languageStyle, "roman_nepali");
  assert.equal(harness.sentTexts.length, 1);
  assert.equal(
    harness.memory.state.languageStyles.get("user-1"),
    "roman_nepali"
  );
});

test("thank-you style text does not send an image", async () => {
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
  assert.equal(harness.sentTexts.length, 1);
});

test("short confused text does not send an image", async () => {
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
  assert.equal(harness.sentTexts.length, 1);
});

test("general thesis question does not send an image even with thesis intent", async () => {
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
});

test("what to do next question does not send an image", async () => {
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

test("single typo theme word sends the formatting creative", async () => {
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

  assert.equal(harness.sentTextAndImages.length, 1);
  assert.match(
    harness.sentTextAndImages[0].url,
    /\/media\/thesis-master\/01-formatting-support\.png$/
  );
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
  assert.equal(harness.sentTexts.length, 1);
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
  assert.equal(harness.sentTexts.length, 1);
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
