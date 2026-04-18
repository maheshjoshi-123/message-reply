import config from "../config.js";

const fallbackReplies = {
  english: "Thanks for the photo. Our team will review it.",
  roman_nepali:
    "Photo pathaunu bhayeko ma dhanyabad. Hamro team le herera reply garchha.",
  nepali:
    "Photo pathaunu bhayeko ma dhanyabad. Hamro team le herera reply garchha.",
  mixed: "Photo ko lagi dhanyabad. Hamro team le herera reply garchha.",
};

export async function analyseImage({ imageUrl, userText, languageStyle }) {
  void imageUrl;
  void userText;

  if (config.imageAnalysisProvider === "none") {
    return {
      provider: "none",
      analysed: false,
      reply: fallbackReplies[languageStyle] || fallbackReplies.english,
    };
  }

  return {
    provider: config.imageAnalysisProvider,
    analysed: false,
    reply: fallbackReplies[languageStyle] || fallbackReplies.english,
  };
}
