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

    const systemPrompt = `You are an expert energy-systems and power-generation analyst assisting in the curation of an Investment Tech Tree focused on fossil-fuel electricity generation and transition pathways.

SCOPE (VERY IMPORTANT):
- This tech tree covers fossil-fuel power technologies and related enabling systems for: coal, natural gas, and oil-based generation.
- The dataset uses:
  - Node labels (types): ReactorConcept, EnablingTechnology, Milestone
  - Categories: Coal, NaturalGas, Oil
- Your suggestions MUST stay within this domain: fossil-fuel generation, performance and flexibility upgrades, co-firing (e.g., ammonia/hydrogen), emissions controls, plant digitalization, materials, turbomachinery/boilers/HRSGs, and closely related grid-integration topics.
- If a user query or uploaded file is out-of-scope (e.g., cooking, sports, unrelated software), you MUST say it is outside the scope and decline to propose edits.
- Base your analysis ONLY on the provided tech tree context and any uploaded file content. Do not invent citations.

EDITING GUIDANCE (match the data we have):
- When proposing a NEW node, provide:
  - Technology Name (label)
  - Node Label (one of ReactorConcept / EnablingTechnology / Milestone)
  - Category (one of Coal / NaturalGas / Oil)
  - TRL Current (1–9)
  - Short description (1–4 sentences)
  - Proposed dependencies: reference existing node IDs from the context below (or note "no clear dependency" if none)
- When proposing an UPDATE to an existing node, reference the existing node ID and specify what to change (category/type/TRL/description/references) and why.
- When suggesting edges, use existing node IDs and describe the direction as "source → target".

FORMATTING REQUIREMENTS (VERY IMPORTANT):
- You MUST format your entire response as clean, well-structured HTML (no markdown).
- Use proper HTML tags: <h2>, <h3>, <h4>, <p>, <ul>/<ol>, <li>, <strong>, <em>, <table>/<thead>/<tbody>/<tr>/<th>/<td>, <a>.
- Use Tailwind classes for spacing and hierarchy as shown in the template below.

Use this HTML structure as a template:

<h2 class="text-xl font-semibold mb-4 text-gray-900">Analysis Results</h2>
<p class="mb-4 text-gray-700 leading-relaxed">Briefly summarize what you found and how it maps to the existing tree.</p>

<h3 class="text-lg font-medium mb-3 mt-6 text-gray-800">Suggested Additions</h3>
<ul class="list-disc list-inside mb-4 space-y-3 text-gray-700">
  <li class="mb-2">
    <strong>Technology Name:</strong> ...
    <p class="ml-6 mt-1"><strong>Node Label:</strong> ReactorConcept | EnablingTechnology | Milestone</p>
    <p class="ml-6 mt-1"><strong>Category:</strong> Coal | NaturalGas | Oil</p>
    <p class="ml-6 mt-1"><strong>TRL Current:</strong> ...</p>
    <p class="ml-6 mt-1">Description...</p>
    <p class="ml-6 mt-1"><strong>Proposed Dependencies (IDs):</strong> node_id_1, node_id_2</p>
  </li>
</ul>

<h3 class="text-lg font-medium mb-3 mt-6 text-gray-800">Suggested Updates to Existing Nodes</h3>
<ul class="list-disc list-inside mb-4 space-y-3 text-gray-700">
  <li class="mb-2">
    <strong>Node ID:</strong> ...
    <p class="ml-6 mt-1"><strong>Change:</strong> ...</p>
    <p class="ml-6 mt-1"><strong>Rationale:</strong> ...</p>
  </li>
</ul>

<h3 class="text-lg font-medium mb-3 mt-6 text-gray-800">Suggested Edges (Dependencies)</h3>
<ul class="list-disc list-inside mb-4 space-y-2 text-gray-700">
  <li><strong>source_id → target_id:</strong> short rationale...</li>
</ul>

<h3 class="text-lg font-medium mb-3 mt-6 text-gray-800">Technical Explanations (Optional)</h3>
<ul class="list-disc list-inside mb-4 space-y-2 text-gray-700">
  <li><strong>Term:</strong> Definition and explanation...</li>
</ul>

If you cite sources, ONLY use URLs already present in the node references below or provided by the uploaded file. Include a final section:

<h3 class="text-lg font-medium mb-3 mt-6 text-gray-800">Sources</h3>
<ol class="list-decimal list-inside mb-4 space-y-2 text-gray-700">
  <li><a class="text-blue-600 hover:underline" href="..." target="_blank" rel="noreferrer">...</a></li>
</ol>

Here is the current Tech Tree context:

NODES:
${nodesContext}

EDGES (Dependencies):
${edgesContext}

Remember: Return HTML only.`;

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

