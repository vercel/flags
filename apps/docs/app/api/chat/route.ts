import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from "ai";
import { createTools } from "./tools";
import type { MyUIMessage } from "./types";
import { createSystemPrompt } from "./utils";

// Reduced from 800s to prevent resource exhaustion via long-running requests
export const maxDuration = 60;

/** Maximum number of messages per request to limit context size */
const MAX_MESSAGES = 50;
/** Maximum total content length across all messages (500KB) */
const MAX_TOTAL_CONTENT_LENGTH = 512 * 1024;
/** Maximum page context content length (100KB) */
const MAX_PAGE_CONTEXT_LENGTH = 100 * 1024;

type RequestBody = {
  messages: MyUIMessage[];
  currentRoute: string;
  pageContext?: {
    title: string;
    url: string;
    content: string;
  };
};

export async function POST(req: Request) {
  try {
    // Validate Content-Type
    const contentType = req.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return new Response(
        JSON.stringify({ error: "Content-Type must be application/json" }),
        { status: 415, headers: { "Content-Type": "application/json" } }
      );
    }

    const body: unknown = await req.json();

    // Validate request body structure
    if (typeof body !== "object" || body === null) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { messages, currentRoute, pageContext } = body as RequestBody;

    if (!Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages must be an array" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (typeof currentRoute !== "string") {
      return new Response(
        JSON.stringify({ error: "currentRoute must be a string" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Enforce message count limit
    if (messages.length > MAX_MESSAGES) {
      return new Response(
        JSON.stringify({
          error: `Too many messages. Maximum is ${MAX_MESSAGES}.`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Enforce total content length limit
    const totalLength = JSON.stringify(messages).length;
    if (totalLength > MAX_TOTAL_CONTENT_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Request content too large" }),
        { status: 413, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate and limit page context size
    if (pageContext) {
      if (
        typeof pageContext.title !== "string" ||
        typeof pageContext.url !== "string" ||
        typeof pageContext.content !== "string"
      ) {
        return new Response(
          JSON.stringify({ error: "Invalid pageContext structure" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      if (pageContext.content.length > MAX_PAGE_CONTEXT_LENGTH) {
        pageContext.content = pageContext.content.slice(
          0,
          MAX_PAGE_CONTEXT_LENGTH
        );
      }
    }

    // Filter out UI-only page context messages (they're just visual feedback)
    const actualMessages = messages.filter(
      (msg) => !msg.metadata?.isPageContext
    );

    // If pageContext is provided, prepend it to the last user message
    let processedMessages = actualMessages;

    if (pageContext && actualMessages.length > 0) {
      const lastMessage = actualMessages.at(-1);

      if (!lastMessage) {
        return new Response(
          JSON.stringify({
            error: "No last message found",
          }),
          { status: 500 }
        );
      }

      if (lastMessage.role === "user") {
        // Extract text content from the message parts
        const userQuestion = lastMessage.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");

        processedMessages = [
          ...actualMessages.slice(0, -1),
          {
            ...lastMessage,
            parts: [
              {
                type: "text",
                text: `Here's the content from the current page:

**Page:** ${pageContext.title}
**URL:** ${pageContext.url}

---

${pageContext.content}

---

User question: ${userQuestion}`,
              },
            ],
          },
        ];
      }
    }

    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: ({ writer }) => {
        const result = streamText({
          model: "openai/gpt-4.1-mini",
          messages: convertToModelMessages(processedMessages),
          stopWhen: stepCountIs(10),
          tools: createTools(writer),
          system: createSystemPrompt(currentRoute),
          prepareStep: ({ stepNumber }) => {
            if (stepNumber === 0) {
              return { toolChoice: { type: "tool", toolName: "search_docs" } };
            }
          },
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("AI chat API error:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to process chat request. Please try again.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
