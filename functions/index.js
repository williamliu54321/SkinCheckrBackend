const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const OpenAI = require("openai");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

exports.analyzeImage = onCall(
  { secrets: [OPENAI_API_KEY] },
  async (request) => {
    const imageBase64 = request.data.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw new HttpsError("invalid-argument", "The function must be called with an 'imageBase64' string argument.");
    }

    // Initialize OpenAI client at runtime (can now access secret)
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY.value(),
    });

    const prompt = `
      You are an expert assistant for a skin health application named 'Skin Checkr'.
      Analyze the mole image using the "ABCDE" melanoma awareness framework.
      Respond ONLY with valid JSON:
      {
        "riskLevel": "Low Risk", "Medium Risk", or "High Risk",
        "asymmetry": "Low", "Medium", or "High",
        "border": "Low", "Medium", or "High",
        "color": "Low", "Medium", or "High",
        "aiNotes": "Two-sentence summary ending with: 'This is not a medical diagnosis. Please consult a dermatologist for any health concerns.'"
      }
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
            ],
          },
        ],
        max_tokens: 500,
      });

      const jsonString = response.choices[0].message.content;
      const analysisData = JSON.parse(jsonString);
      return { result: analysisData };
    } catch (error) {
      console.error("Error calling OpenAI API:", error);
      throw new HttpsError("internal", "Failed to analyze the image due to an internal server error.", error);
    }
  }
);
