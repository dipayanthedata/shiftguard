// Bedrock Claude narration: converts shift plan JSON to readable prose
// Generates both English and Spanish versions
// Graceful fallback if Bedrock unavailable

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Inference profile: Claude Haiku 4.5 (foundation model is ACTIVE, not EOL)
// Check foundation model lifecycle, not just inference profile status
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

export interface NarrationResult {
  english: string | null;
  spanish: string | null;
  availableNote?: string;
}

async function generateNarration(
  planSummary: string,
  language: 'English' | 'Spanish'
): Promise<string | null> {
  const languagePrompt =
    language === 'English'
      ? `Provide a brief, clear workplace safety briefing (2-3 sentences) based on this shift plan.
Use imperative language: "You must" / "Ensure" / "Workers should".
Separate REGULATORY requirements from ShiftGuard recommendations clearly:
- Start with "REGULATORY:" for mandatory requirements
- Start with "RECOMMENDATION:" for guidance
Do not add calculations or new analysis. Use the data as provided.`
      : `Proporciona una advertencia de seguridad laboral breve y clara (2-3 oraciones) basada en este plan de turno.
Usa lenguaje imperativo: "Deben" / "Asegúrense" / "Los trabajadores deben".
Separa claramente los requisitos REGULATORIOS de las recomendaciones de ShiftGuard:
- Comienza con "REQUISITO REGULATORIO:" para requisitos obligatorios
- Comienza con "RECOMENDACIÓN:" para orientación
No agregues cálculos ni análisis nuevos. Usa los datos tal como se proporcionan.`;

  try {
    console.log(`[narrate] Invoking Bedrock model: ${MODEL_ID} for ${language}`);
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [
        {
          role: 'user',
          content: [
            {
              text: `${languagePrompt}\n\n${planSummary}`,
            },
          ],
        },
      ],
      inferenceConfig: {
        maxTokens: 300,
        temperature: 0.3,
      },
    });

    const response = await bedrock.send(command);
    console.log(`[narrate] Bedrock response received for ${language}`);
    const narration = response.output?.message?.content?.[0]?.text || null;
    console.log(`[narrate] ${language} narration generated (${narration?.length || 0} chars)`);
    return narration;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.Code || (error as any)?.$metadata?.httpStatusCode || 'unknown';
    console.error(`[narrate] ${language} generation failed: [${errorCode}] ${errorMsg}`);
    return null;
  }
}

export async function narrateShift(plan: Record<string, unknown>): Promise<NarrationResult> {
  // Summarize plan for Bedrock (it must NOT regenerate, only narrate)
  const summary = JSON.stringify({
    hours: (plan.hourlyAnalysis as Array<unknown>)?.length || 0,
    regulatoryRequirements: plan.regulatoryRequirements,
    shiftGuardRecommendations: plan.shiftGuardRecommendations,
    aqiAvailable: plan.aqiAvailable,
    aqiNote: plan.aqiNote,
  });

  const [englishNarration, spanishNarration] = await Promise.all([
    generateNarration(summary, 'English'),
    generateNarration(summary, 'Spanish'),
  ]);

  const result: NarrationResult = {
    english: englishNarration,
    spanish: spanishNarration,
  };

  if (!englishNarration || !spanishNarration) {
    result.availableNote =
      'Narration temporarily unavailable. Structured shift data is complete; refer to regulatory requirements and recommendations above.';
  }

  return result;
}
