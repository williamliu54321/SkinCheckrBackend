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

    // FOR APP STORE COMPLIANCE: Always use skincare analysis
    // TO RESTORE MOLE DETECTION: Change this to detect face vs other skin areas
    const analysisType = "skincare";
    console.log("✅ Using skincare analysis for app store compliance");
    
    try {
      // Skincare analysis prompt
      const analysisPrompt = `
        You are an expert dermatology and skincare assistant for a skincare recommendation application named 'Skincare Advisor'.
        
        IMPORTANT: First determine if this image contains human skin (face, hands, arms, legs, or any body part).
        
        If the image does NOT contain human skin (e.g., it's an inanimate object, animal, landscape, food, etc.), respond with:
        {
          "analysisType": "error",
          "noFaceDetected": true,
          "skinType": "N/A",
          "concerns": [],
          "moistureLevel": "N/A",
          "oilinessLevel": "N/A",
          "sensitivity": "N/A",
          "recommendations": "No human skin detected in the image. Please upload a photo showing human skin for analysis.",
          "productSuggestions": []
        }
        
        If the image DOES contain human skin (even if not a face - hands, arms, etc. are fine), analyze it:
        - If it's a face: provide detailed facial skincare analysis
        - If it's another body part (hand, arm, leg, etc.): provide general skin analysis for that area
        - Overall skin type (Dry, Oily, Combination, Normal, Sensitive)
        - Visible skin concerns and problem areas
        - Moisture and oil levels
        - Signs of sensitivity or irritation
        - Appropriate recommendations for the skin area shown
        
        For valid human skin images, respond with JSON in this format:
        {
          "analysisType": "skincare",
          "noFaceDetected": false,
          "skinType": "one of: Dry, Oily, Combination, Normal, Sensitive",
          "concerns": ["array of identified concerns like Dryness, Irritation, Sun Damage, Age Spots, Rough Texture, etc."],
          "moistureLevel": "Low, Medium, or High",
          "oilinessLevel": "Low, Medium, or High", 
          "sensitivity": "Low, Medium, or High",
          "recommendations": "Detailed paragraph with specific skincare recommendations. If it's a face, focus on facial skincare routine. If it's hands/arms/body, provide appropriate care advice for that body part including moisturizing, sun protection, etc. Always include medical citation links at the end, such as: Sources: American Academy of Dermatology (https://www.aad.org), Mayo Clinic (https://www.mayoclinic.org), or other reputable medical sources.",
          "productSuggestions": ["array of 4-6 specific product types appropriate for the skin area shown"]
        }
      `;

      console.log("🎯 Performing skincare analysis...");
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
          analysisType: "error",
          noFaceDetected: true,
          skinType: "N/A",
          concerns: [],
          moistureLevel: "N/A",
          oilinessLevel: "N/A",
          sensitivity: "N/A",
          recommendations: "We were unable to analyze your image. Please ensure you upload a clear photo of your face for skin analysis.",
          productSuggestions: []
        };
      }

      // Check if no face was detected
      if (analysisData.noFaceDetected === true || analysisData.analysisType === "error") {
        console.log("⚠️ No face detected in image");
        const noFaceResult = {
          id: generateUUID(),
          date: new Date().toISOString(),
          analysisType: "skincare",
          // All fields set to indicate no analysis possible
          riskLevel: "",
          asymmetry: "",
          border: "",
          color: "",
          diameter: "",
          evolution: "",
          skinType: "N/A",
          concerns: [],
          moistureLevel: "N/A",
          oilinessLevel: "N/A",
          sensitivity: "N/A",
          productSuggestions: [],
          recommendations: analysisData.recommendations || "No human skin detected in the image. Please upload a photo showing human skin for analysis.",
          imageData: null
        };
        return { result: noFaceResult };
      }

      // Format result for frontend - ensure no null values that could crash the app
      const result = {
        id: generateUUID(),
        date: new Date().toISOString(),
        analysisType: "skincare",
        // Mole analysis fields (empty strings for skincare mode to prevent null issues)
        riskLevel: "",
        asymmetry: "",
        border: "",
        color: "",
        diameter: "",
        evolution: "",
        // Skincare analysis fields - always provide default values
        skinType: analysisData.skinType || "Normal",
        concerns: Array.isArray(analysisData.concerns) ? analysisData.concerns : [],
        moistureLevel: analysisData.moistureLevel || "Medium",
        oilinessLevel: analysisData.oilinessLevel || "Medium",
        sensitivity: analysisData.sensitivity || "Medium",
        productSuggestions: Array.isArray(analysisData.productSuggestions) ? analysisData.productSuggestions : [],
        // Common fields
        recommendations: analysisData.recommendations || "Please consult with a professional for personalized advice.",
        imageData: null
      };

      console.log("✅ Sending result to client");
      return { result };

    } catch (error) {
      console.error("❌ Error during analysis:", error);
      
      // Return error response in expected format - NEVER return null for required fields
      const errorMessage = error.message || 'Unknown error';
      const errorResult = {
        id: generateUUID(),
        date: new Date().toISOString(),
        analysisType: "skincare",
        // Mole analysis fields (use empty strings instead of null to prevent frontend crashes)
        riskLevel: "",
        asymmetry: "",
        border: "",
        color: "",
        diameter: "",
        evolution: "",
        // Skincare analysis fields - always provide values, never null
        skinType: "Unknown",
        concerns: ["Analysis Error"],
        moistureLevel: "Unknown",
        oilinessLevel: "Unknown",
        sensitivity: "Unknown",
        productSuggestions: [],
        // Common fields
        recommendations: `Analysis failed: ${errorMessage}. Please try again with a clear photo of your face, ensuring good lighting. If the problem persists, consult with a dermatologist for professional advice.`,
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

// ===== RESTORATION INSTRUCTIONS FOR MOLE DETECTION =====
// TO ENABLE MOLE DETECTION AFTER APP STORE APPROVAL:
// 
// 1. Change line 25: const analysisType = "skincare"; 
//    TO: const analysisType = imageContainsFace ? "skincare" : "mole";
//
// 2. Add face detection logic before line 25:
//    const faceDetectionPrompt = `Is there a human face visible in this image? Respond with JSON: {"containsFace": true/false}`;
//    const faceResponse = await openai.chat.completions.create({...faceDetectionPrompt...});
//    const imageContainsFace = JSON.parse(faceResponse.choices[0].message.content).containsFace;
//
// 3. Add mole analysis prompt after line 63:
//    if (analysisType === "mole") {
//      analysisPrompt = `Analyze this mole using ABCDE framework. Return JSON with: analysisType:"mole", riskLevel, asymmetry, border, color, diameter, evolution, recommendations`;
//    }
//
// 4. Update result formatting around line 100 to use analysisType instead of hardcoded "skincare"
//
// The frontend will automatically display the correct UI based on analysisType returned from backend.