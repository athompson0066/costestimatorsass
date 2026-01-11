
import { GoogleGenAI, Type } from "@google/genai";
import { EstimateTask, EstimationResult, BusinessConfig } from "../types.ts";
import { supabase } from "./supabaseClient.ts";
import { generateUserEmailTemplate, generateClientEmailTemplate, sendResendEmail } from "./emailService.ts";

async function retryRequest<T>(fn: () => Promise<T>, retries = 3, initialDelay = 3000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = JSON.stringify(error).toLowerCase();
    
    if (errorStr.includes('requested entity was not found') || errorStr.includes('404')) {
      throw new Error("MODEL_NOT_FOUND");
    }

    const isRetryable = errorStr.includes('429') || errorStr.includes('quota') || errorStr.includes('rate_limit') || errorStr.includes('resource_exhausted');
    
    if (isRetryable && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, initialDelay));
      return retryRequest(fn, retries - 1, initialDelay * 2);
    }
    throw error;
  }
}

const cleanJson = (text: string) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start !== -1 && end !== -1 ? text.substring(start, end + 1) : text;
};

export const getEstimate = async (task: EstimateTask, config: BusinessConfig): Promise<EstimationResult> => {
  return retryRequest(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const corePricingContext = (config.corePricingItems || [])
      .map(item => `- ${item.label}: ${item.price} (${item.description || 'Core service'})`)
      .join('\n');

    const upsellContext = (config.smartAddons || [])
      .map(item => `- ${item.label}: ${item.price} (${item.description || 'Add-on'})`)
      .join('\n');

    const systemInstruction = `
      You are the Intelligent AI Service Consultant for ${config.name}.
      
      PERSONALITY & PROTOCOL:
      ${config.systemPrompt || "You are a professional, accurate, and helpful estimator."}

      PRICING DATA:
      - Global Rules: ${config.pricingRules}
      - Core Inventory:
      ${corePricingContext || "No fixed items provided, estimate based on rules."}
      - Recommended Add-ons:
      ${upsellContext || "No specific add-ons."}

      YOUR MISSION:
      1. Analyze the user's request (and image if provided).
      2. Calculate a realistic cost range based on ${config.pricingRules}.
      3. Recommend EXACTLY 1-2 items from the "Recommended Add-ons" list that specifically solve the user's problem or add value.
      4. Provide clear, professional reasoning.
    `;

    const parts: any[] = [
      { text: `
        ESTIMATE REQUEST:
        - Description: "${task.description}"
        - Zip Code: ${task.zipCode}
        - Urgency: ${task.urgency}
        
        Analyze this request. If an image is provided, identify the specific repair needs visible in the photo.
        Respond in JSON.
      `}
    ];

    if (task.image && task.image.includes('base64,')) {
      const base64Data = task.image.split(',')[1];
      const mimeType = task.image.split(';')[0].split(':')[1] || 'image/jpeg';
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            estimatedCostRange: { type: Type.STRING },
            baseMinCost: { type: Type.NUMBER },
            baseMaxCost: { type: Type.NUMBER },
            laborEstimate: { type: Type.STRING },
            materialsEstimate: { type: Type.STRING },
            timeEstimate: { type: Type.STRING },
            tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            caveats: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedUpsells: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  price: { type: Type.STRING },
                  reason: { type: Type.STRING }
                }
              }
            }
          },
          required: ['estimatedCostRange', 'baseMinCost', 'baseMaxCost', 'laborEstimate', 'tasks']
        }
      }
    });

    const responseText = response.text;
    if (!responseText) throw new Error("The AI returned an empty response.");
    
    return JSON.parse(cleanJson(responseText));
  });
};

export const dispatchLead = async (leadInfo: any, estimate: EstimationResult, config: BusinessConfig) => {
  try {
    // 1. Save to Database
    const { error } = await supabase.from('leads').insert([{
      name: leadInfo.name,
      email: leadInfo.email,
      phone: leadInfo.phone,
      notes: leadInfo.notes,
      date: leadInfo.date,
      time: leadInfo.time,
      estimate_json: estimate,
      created_at: new Date().toISOString()
    }]);
    
    if (error) console.error("Database Save Error:", error);

    // 2. Automated Email Dispatch (Resend API)
    if (config.leadGenConfig.resendApiKey) {
      console.log('Dispatching automated emails via Resend...');

      // A. Notification to Company (Handyman)
      if (config.leadGenConfig.targetEmail) {
        await sendResendEmail(
          config.leadGenConfig.resendApiKey,
          config.leadGenConfig.targetEmail,
          `New Lead: ${leadInfo.name} - ${estimate.estimatedCostRange}`,
          generateClientEmailTemplate(config, leadInfo, estimate),
          config.name
        );
      }

      // B. Confirmation to Customer (User)
      if (leadInfo.email) {
        await sendResendEmail(
          config.leadGenConfig.resendApiKey,
          leadInfo.email,
          `Your Project Estimate from ${config.name}`,
          generateUserEmailTemplate(config, leadInfo, estimate),
          config.name
        );
      }
    }

    // 3. Webhook Integration (Optional)
    if (config.leadGenConfig.googleSheetWebhookUrl) {
      try {
        await fetch(config.leadGenConfig.googleSheetWebhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...leadInfo, cost_range: estimate.estimatedCostRange, company: config.name })
        });
      } catch (e) {
        console.warn("Webhook failed:", e);
      }
    }

    return { success: true };
  } catch (e) {
    console.error("Lead Dispatch Failed", e);
    return { success: false, error: e };
  }
};
