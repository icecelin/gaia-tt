'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Send, Upload } from 'lucide-react';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { useTechTree } from '@/hooks/useTechTree';
import DOMPurify from 'dompurify';
import { Badge } from '@/components/ui/badge';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

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

const AiAssistantPanel: React.FC = () => {
  const { techTree } = useTechTree();
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [genAI] = useState(() => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    return apiKey ? new GoogleGenerativeAI(apiKey) : null;
  });

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.type === 'user') {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setMessage(question);
    textareaRef.current?.focus();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!message.trim() && !file) return;
    if (!genAI) {
      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        type: 'assistant',
        content: 'Error: Gemini API key not configured',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: message.trim() + (file ? ` [File: ${file.name}]` : ''),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
      });

      // Build context string from nodes and edges
      const nodesContext = techTree?.nodes
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
      - Description: ${node.data.detailedDescription || node.data.description || 'No description available'}${referencesBlock}`;
        })
        .join('\n\n');

      const edgesContext = techTree?.edges
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

      const conversationHistory = messages.map((msg) => ({
        role: msg.type === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      // Build the parts of the user's message, including the file if it exists
      const userParts: Part[] = [{ text: message }];
      if (file) {
        const filePart = await fileToGenerativePart(file);
        userParts.push(filePart);
      }

      const contents = [
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
      const aiResponse = response.text();

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: aiResponse,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      setMessage('');
      setFile(null);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get AI response'}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 ? (
          <Card>
            <CardContent className="text-center text-gray-500 mt-8">
              <p className="text-lg mb-4">AI Assistant for Tech Tree Editing</p>
              <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
                Upload a document with evidence (e.g., a research paper) for analysis, or use one of the prompts below to get started.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto">
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSuggestedQuestion('Analyze the attached document for new "EnablingTechnology" nodes.')}
                >
                  Analyze document for new tech
                </Badge>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSuggestedQuestion('Based on the attached paper, suggest updates to the TRL of existing nodes.')}
                >
                  Update TRL from paper
                </Badge>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSuggestedQuestion('Identify any missing dependencies or connections based on this document.')}
                >
                  Suggest new edges
                </Badge>
              </div>
            </CardContent>
          </Card>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <Card
                className={`max-w-[80%] ${
                  msg.type === 'user'
                    ? 'bg-slate-600 text-white border-slate-600'
                    : 'bg-gray-100 text-gray-900 border'
                }`}
              >
                <CardContent
                  className={`p-4 ${msg.type === 'user' ? 'p-3' : 'p-4 pl-6'}`}
                >
                  <div className="break-words">
                    {msg.type === 'assistant' ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(
                            msg.content
                              .replace(/^```html\s*/i, '')
                              .replace(/```[\s\n]*$/, ''),
                            {
                              ALLOWED_TAGS: [
                                'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 
                                'strong', 'em', 'table', 'thead', 'tbody', 
                                'tr', 'td', 'th', 'code', 'pre', 'br', 'a',
                              ],
                              ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
                            }
                          ),
                        }}
                        className="prose prose-sm max-w-none [&_table]:overflow-x-auto [&_table]:block [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-gray-300 [&_td]:border [&_td]:border-gray-300 [&_td]:px-3 [&_td]:py-2 [&_td]:whitespace-nowrap [&_th]:border [&_th]:border-gray-300 [&_th]:px-3 [&_th]:py-2 [&_th]:bg-gray-50 [&_th]:font-semibold [&_th]:text-left [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:mb-3 [&_ol]:text-gray-700 [&_li]:mb-1 [&_a]:text-blue-600 [&_a]:hover:underline"
                      />
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                  </div>
                  <div
                    className={`text-xs mt-2 ${
                      msg.type === 'user' ? 'text-slate-100' : 'text-gray-500'
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString('de-DE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex justify-start">
            <Card className="bg-gray-100 border">
              <CardContent className="p-3">
                <div className="flex items-center space-x-2">
                  <Loader2 size={16} className="animate-spin text-gray-500" />
                  <span className="text-gray-500">Analyzing...</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4">
        {file && (
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
            <Upload size={14} />
            <span className="flex-1">{file.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFile(null)}
              className="h-6 px-2"
            >
              Remove
            </Button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the tech tree or request suggestions..."
              className="w-full resize-none pr-24 max-h-32"
              rows={1}
              disabled={isLoading}
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
              <label htmlFor="file-upload">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="p-1 h-8 w-8 cursor-pointer"
                  disabled={isLoading}
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <Upload size={18} />
                </Button>
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".txt,.pdf,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                type="submit"
                size="sm"
                disabled={(!message.trim() && !file) || isLoading}
                className="p-1 h-8 w-8"
              >
                <Send size={18} />
              </Button>
            </div>
          </div>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
};

export default AiAssistantPanel;