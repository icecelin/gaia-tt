import { GoogleGenerativeAI, Part, Content } from '@google/generative-ai';
import { TechTree, ChatMessage } from './types';

// Helper function to convert a File to a base64 string for Gemini API
const fileToGenerativePart = async (file: File): Promise<Part> => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
};

export class GeminiChatClient {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async sendMessage(
    message: string,
    context: TechTree,
    chatHistory: ChatMessage[] = [],
    file?: File,
  ): Promise<string> {
    if (!message?.trim() && !file) {
      throw new Error('Message or file is required');
    }

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    // Build the user's prompt parts, starting with the text message
    const userParts: Part[] = [{ text: message }];

    // If a file is provided, convert it to a generative part and add to the prompt
    if (file) {
      try {
        console.log('Processing file...');
        const filePart = await fileToGenerativePart(file);
        userParts.push(filePart);
        console.log('File processed successfully.');
      } catch (error) {
        console.error('Error processing file:', error);
        throw new Error('Failed to read the PDF file.');
      }
    }

    // Build context string from nodes and edges
    const nodesContext = context.nodes
      .map((node) => {
        const references = Array.isArray(node.data.references)
          ? node.data.references
          : [];
        const referencesBlock =
          references.length > 0
            ? `\n      - References:\n${references
                .map((ref, i) => `        ${i + 1}. ${ref}`)
                .join('\n')}`
            : '';
        return `Node: ${node.data.label} (${node.data.nodeLabel})
      - ID: ${node.id}
      - Category: ${node.data.category || 'N/A'}
      - TRL Current: ${node.data.trl_current || 'N/A'}
      - Description: ${
        node.data.detailedDescription ||
        node.data.description ||
        'No description available'
      }${referencesBlock}`;
      })
      .join('\n\n');

    const edgesContext = context.edges
      .map((edge) => {
        return `Edge: ${edge.source} → ${edge.target}`;
      })
      .join('\n');

    const systemPrompt = `You are an expert technology analyst assisting in the curation of a specialized Investment Tech Tree for nuclear and fusion energy. Your primary role is to analyze user-provided text and documents to suggest relevant additions or modifications to the tech tree.

Here is the current Tech Tree context:

NODES:
${nodesContext}

EDGES (Dependencies):
${edgesContext}

IMPORTANT INSTRUCTIONS:
- If a file is uploaded, first check if it pertains to the nuclear or fusion energy domain. If not, state that the information is outside the scope and decline to make suggestions.
- If the file is relevant, analyze it to identify:
  a) Potential edits to existing nodes (e.g., new TRL level).
  b) New nodes or edges that should be added.
  c) Inconsistencies or missing information in the tech tree based on the document.
- Answer any user questions concisely, based on the provided tech tree context and any uploaded file.
- Structure your answer with clear HTML headlines (h2, h3, h4) using Tailwind CSS classes.
- Format your response as well-structured HTML using Tailwind CSS classes.
- Use appropriate HTML elements for better readability:
  * Tables with Tailwind styling for data comparison.
  * Bullet points (ul/li) or numbered lists (ol/li) where appropriate.
  * Emphasis tags (strong, em) for important points.
- Use these Tailwind classes for consistency:
  * Headlines: "text-xl font-semibold mb-3 text-gray-900" for h2, "text-lg font-medium mb-2 text-gray-800" for h3
  * Paragraphs: "mb-3 text-gray-700 leading-relaxed"
  * Lists: "list-disc list-inside mb-3 text-gray-700" for ul, "list-decimal list-inside mb-3 text-gray-700" for ol
  * Tables: "min-w-full divide-y divide-gray-200 mb-4" with "px-3 py-2 text-sm" for cells
  * Strong text: "font-semibold text-gray-900"
- Each node may include a list of references. Use these references to ground your explanations and, when relevant, include a short "Sources" section at the end with a numbered list linking to them. Use anchor tags for URLs. Do not fabricate citations. If you reference a specific claim, add an inline [n] that corresponds to the numbered source. Ensure the Sources section uses proper HTML structure with h3 and ol/li elements.

PRESENT YOUR OUTPUT SUGGESTIONS IN THE FOLLOWING FORMAT:

<h2 class="text-xl font-semibold mb-4 text-gray-900">Analysis Results</h2>
<p class="mb-4 text-gray-700 leading-relaxed">Your introduction paragraph here...</p>

<h3 class="text-lg font-medium mb-3 mt-6 text-gray-800">Suggested Additions</h3>
<ul class="list-disc list-inside mb-4 space-y-3 text-gray-700">
  <li class="mb-2">
    <strong>Technology Name:</strong>
    <p class="ml-6 mt-1">Description of the technology...</p>
    <p class="ml-6 mt-1"><strong>TRL Current:</strong> 3-4</p>
    <p class="ml-6 mt-1"><strong>Dependencies:</strong> node_id_1, node_id_2</p>
  </li>
</ul>

<h3 class="text-lg font-medium mb-3 mt-6 text-gray-800">Technical Explanations</h3>
<ul class="list-disc list-inside mb-4 space-y-2 text-gray-700">
  <li><strong>Term:</strong> Definition and explanation...</li>
</ul>

Remember: Format everything as HTML with proper tags and spacing. No plain text or markdown formatting.`;

    // Build conversation history for context
    const conversationHistory: Content[] = chatHistory.map((msg) => ({
      role: msg.type === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    try {
      // Create the content array with system prompt, conversation history, and current message
      const contents: Content[] = [
        {
          role: 'user',
          parts: [{ text: systemPrompt }],
        },
        ...conversationHistory,
        {
          role: 'user',
          parts: userParts,
        },
      ];

      const result = await model.generateContent({
        contents,
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.3,
        },
      });

      const response = result.response;
      return response.text();
    } catch (error) {
      console.error('Error generating content:', error);
      throw new Error('Failed to generate response from Gemini');
    }
  }
}

