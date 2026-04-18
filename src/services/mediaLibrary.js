const sampleMedia = [
  {
    intent: "sample_image",
    url: "https://placehold.co/1200x800/png?text=Thesis+Support+Sample",
    caption: {
      english: "Here is a sample image.",
      roman_nepali: "Yo sample image ho.",
      nepali: "Yo sample image ho.",
      mixed: "Yo sample image ho.",
    },
  },
];

export function getSampleImage() {
  return sampleMedia[0] || null;
}

export function getMediaByIntent(intent) {
  return sampleMedia.find((item) => item.intent === intent) || null;
}
