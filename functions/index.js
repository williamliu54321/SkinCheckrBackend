const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const OpenAI = require("openai");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

exports.analyzeImage = onCall(
  { secrets: [OPENAI_API_KEY] },
  async (request) => {
    // --- DEBUG 1: Log that the function was successfully triggered ---
    console.log("✅ Function 'analyzeImage' triggered.");

    // (Optional) If you have authentication, log the user ID.
    // if (request.auth) {
    //   console.log(`Authenticated user: ${request.auth.uid}`);
    // } else {
    //   console.warn("⚠️ Warning: Function was called by an unauthenticated user.");
    // }

    const imageBase64 = request.data.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      // --- DEBUG 2: Log validation failures ---
      console.error("❌ Validation Error: 'imageBase64' is missing or not a string.");
      throw new HttpsError("invalid-argument", "The function must be called with an 'imageBase64' string argument.");
    }
    
    // --- DEBUG 3: Log the size of the received data to ensure it's not empty ---
    console.log(`👍 Received image data. Base64 String Length: ${imageBase64.length}`);

    // Initialize OpenAI client at runtime
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
      // --- DEBUG 4: Log right before making the expensive API call ---
      console.log("▶️ Sending request to OpenAI API...");
      const startTime = Date.now(); // Start a timer

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

      const duration = Date.now() - startTime;
      // --- DEBUG 5: Log the raw response from OpenAI ---
      // This is the most important log for debugging the AI's output.
      console.log(`✅ Received response from OpenAI in ${duration}ms.`);
      const jsonString = response.choices[0].message.content;
      console.log("📜 Raw OpenAI Response:", jsonString);

      // Parse the JSON string from OpenAI into a JavaScript object.
      const analysisData = JSON.parse(jsonString);

      // --- DEBUG 6: Log the final data being sent back to the app ---
      console.log("✅ Successfully parsed JSON. Sending result to client.");
      return { result: analysisData };

    } catch (error) {
      // --- DEBUG 7: Log any errors that occur during the process ---
      // This is crucial for understanding failures.
      console.error("❌ FATAL ERROR: Error during OpenAI call or JSON parsing.", error);
      throw new HttpsError("internal", "Failed to analyze the image due to an internal server error.", error);
    }
  }
);