const functions = require("firebase-functions/v2/https");
const { HttpsError } = require("firebase-functions/v2/https");
const OpenAI = require("openai");

// This line securely loads your secret API key from Google Secret Manager.
// Your key is NEVER exposed in the code.
const OPENAI_API_KEY = functions.params.defineSecret("OPENAI_API_KEY");

// Initialize the OpenAI client once. This is a performance best practice.
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY.value(),
});

/**
 * A Callable Cloud Function to analyze a skin mole image using the OpenAI Vision API.
 * Expects a Base64-encoded image string in the request data.
 * Returns a structured JSON object with the analysis result.
 */
exports.analyzeImage = functions.https.onCall(
  // This object connects the function to the secret manager.
  { secrets: [OPENAI_API_KEY] },
  async (request) => {
    // --- Step 1: (Optional but Recommended) Authenticate the user ---
    // This ensures only logged-in users of your app can call this function.
    // if (!request.auth) {
    //   throw new HttpsError("unauthenticated", "You must be logged in to analyze an image.");
    // }

    // --- Step 2: Validate the incoming data from your app ---
    const imageBase64 = request.data.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw new HttpsError("invalid-argument", "The function must be called with an 'imageBase64' string argument.");
    }

    // --- Step 3: Craft the detailed prompt for the AI ---
    // This is where you control the AI's behavior and output format.
    const prompt = `
      You are an expert assistant for a skin health application named 'Skin Checkr'.
      Your task is to analyze an image of a skin mole based on the common "ABCDE" characteristics for melanoma awareness.
      You MUST respond with ONLY a valid JSON object. Do not include any introductory text, explanations, or markdown formatting like \`\`\`json.

      The JSON object must have the following exact structure:
      {
        "riskLevel": "Low Risk", "Medium Risk", or "High Risk",
        "asymmetry": "Low", "Medium", or "High",
        "border": "Low", "Medium", or "High",
        "color": "Low", "Medium", or "High",
        "aiNotes": "A brief, two-sentence summary of your findings. Be encouraging and always end with the disclaimer: 'This is not a medical diagnosis. Please consult a dermatologist for any health concerns.'"
      }

      Analyze the provided image and return the JSON object with your assessment.
    `;

    try {
      // --- Step 4: Make the API call to OpenAI ---
      console.log("Sending analysis request to OpenAI...");
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        // This is a crucial parameter that forces OpenAI to return valid JSON.
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                // OpenAI can directly accept a Base64-encoded data URL.
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
            ],
          },
        ],
        max_tokens: 500, // A safe limit for the JSON response.
      });

      // --- Step 5: Process and return the response ---
      const jsonString = response.choices[0].message.content;
      console.log("Successfully received JSON response from OpenAI.");

      // Parse the JSON string from OpenAI into a JavaScript object.
      const analysisData = JSON.parse(jsonString);

      // Return the data in the format your SwiftUI app expects: { "result": { ... } }
      // The Firebase SDK handles serializing this back to your app.
      return { result: analysisData };

    } catch (error) {
      console.error("Error calling OpenAI API:", error);
      // Throw a structured error back to the app.
      throw new HttpsError("internal", "Failed to analyze the image due to an internal server error.", error);
    }
  },
);