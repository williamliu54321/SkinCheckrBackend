const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const OpenAI = require("openai");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// Main analysis function - currently skincare only for App Store compliance
exports.analyzeSkincareImage = onCall(
  { secrets: [OPENAI_API_KEY] },
  async (request) => {
    console.log("✅ Function 'analyzeSkincareImage' triggered.");

    const { imageBase64 } = request.data;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      console.error("❌ Validation Error: 'imageBase64' is missing or not a string.");
      throw new HttpsError("invalid-argument", "The function must be called with an 'imageBase64' string argument.");
    }
    
    console.log(`👍 Received image data. Base64 String Length: ${imageBase64.length}`);

    // Initialize OpenAI client
    const apiKey = OPENAI_API_KEY.value();
    if (!apiKey) {
      console.error("❌ OpenAI API key is not configured");
      throw new HttpsError("failed-precondition", "OpenAI API key is not configured");
    }
    
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    // Easy mode switching - change this variable to switch analysis types
    const ANALYSIS_MODE = "medical"; // Change to "medical" or "skincare" to switch modes
    console.log(`✅ Using ${ANALYSIS_MODE} analysis mode`);
    
    try {
      let analysisPrompt;
      
      if (ANALYSIS_MODE === "skincare") {
        analysisPrompt = `
          You are an expert skincare assistant. Please respond with a JSON object.
          
          IMPORTANT: First determine if this image contains a human FACE specifically (not just any skin).
          
          If the image does NOT contain a clear human face, respond with JSON:
          {
            "analysisError": true,
            "concerns": [],
            "metrics": [],
            "recommendations": "Please upload a clear photo of your face for skincare analysis."
          }
          
          If the image DOES contain a human face, analyze it and respond with JSON:
          {
            "analysisError": false,
            "concerns": ["array of facial skin concerns like Acne, Dryness, Dark Spots, Fine Lines, etc."],
            "metrics": [
              {"label": "Moisture Level", "value": "Low/Medium/High"},
              {"label": "Oiliness Level", "value": "Low/Medium/High"},
              {"label": "Sensitivity", "value": "Low/Medium/High"}
            ],
            "recommendations": "Detailed facial skincare routine recommendations with specific steps. Always end with 'Source:' followed by 1 Mayo Clinic page relevant to the specific skin concerns identified. Format as: Source: [Mayo Clinic Page Title] - [Full Mayo Clinic URL]"
          }
        `;
      } else {
        analysisPrompt = `
          You are an expert dermatology assistant for medical skin analysis. Please respond with a JSON object.
          
          IMPORTANT: First determine if this image contains human skin (face, hands, arms, legs, or any body part).
          
          If the image does NOT contain human skin, respond with JSON:
          {
            "analysisError": true,
            "concerns": [],
            "metrics": [],
            "recommendations": "Please upload a photo showing skin for medical analysis."
          }
          
          If the image DOES contain human skin, analyze it and respond with JSON:
          {
            "analysisError": false,
            "concerns": ["array of medical concerns like Irregular borders, Color variation, Asymmetry, Size changes, etc."],
            "metrics": [
              {"label": "Risk Level", "value": "Low/Medium/High"},
              {"label": "Urgency", "value": "Monitor/Consult Soon/Seek Immediate Care"}
            ],
            "recommendations": "Medical assessment and advice about when to consult a dermatologist. Always end with 'Source:' followed by 1 Mayo Clinic page relevant to the specific skin concerns identified. Format as: Source: [Mayo Clinic Page Title] - [Full Mayo Clinic URL]"
          }
        `;
      }

      console.log(`🎯 Performing ${ANALYSIS_MODE} analysis...`);
      const startTime = Date.now();

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: analysisPrompt },
              {
                type: "image_url",
                image_url: { 
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "high"
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.3
      });

      const duration = Date.now() - startTime;
      console.log(`✅ Received response from OpenAI in ${duration}ms.`);
      
      const jsonString = response.choices[0].message.content;
      console.log("📜 Raw OpenAI Response:", jsonString);

      let analysisData;
      try {
        analysisData = JSON.parse(jsonString);
        console.log("✅ Successfully parsed JSON response");
      } catch (parseError) {
        console.error("❌ JSON parsing failed:", parseError);
        // Fallback response
        analysisData = {
          analysisError: true,
          concerns: [],
          metrics: [],
          recommendations: ANALYSIS_MODE === "skincare" ? 
            "We were unable to analyze your image. Please ensure you upload a clear photo of your face for skincare analysis." :
            "We were unable to analyze your image. Please ensure you upload a clear photo showing skin for medical analysis."
        };
      }

      // Check if analysis failed
      if (analysisData.analysisError === true) {
        console.log("⚠️ Analysis error detected");
        const errorResult = {
          id: generateUUID(),
          date: new Date().toISOString(),
          concerns: analysisData.concerns || [],
          metrics: analysisData.metrics || [],
          recommendations: analysisData.recommendations,
          imageData: null
        };
        return { result: errorResult };
      }

      // Format result for frontend with dynamic structure
      const result = {
        id: generateUUID(),
        date: new Date().toISOString(),
        concerns: Array.isArray(analysisData.concerns) ? analysisData.concerns : [],
        metrics: Array.isArray(analysisData.metrics) ? analysisData.metrics : [],
        recommendations: analysisData.recommendations || "Please consult with a professional for personalized advice.",
        imageData: null
      };

      console.log("✅ Sending result to client");
      return { result };

    } catch (error) {
      console.error("❌ Error during analysis:", error);
      
      // Return error response in new format
      const errorResult = {
        id: generateUUID(),
        date: new Date().toISOString(),
        concerns: ["Analysis Error"],
        metrics: [],
        recommendations: "An error occurred during analysis. Please try again with a different image or contact support if the issue persists.",
        imageData: null
      };
      
      return { result: errorResult };
    }
  }
);

// Helper function to generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ===== MODE SWITCHING INSTRUCTIONS =====
// TO SWITCH ANALYSIS MODES:
// 
// Change the ANALYSIS_MODE variable at the top:
// const ANALYSIS_MODE = "skincare"; // For facial skincare analysis 
// const ANALYSIS_MODE = "medical";   // For medical skin analysis
//
// Skincare mode: Requires face photos, analyzes moisture/oiliness/sensitivity
// Medical mode: Works with any skin area, provides risk assessment and urgency