import { agent, github } from '@/geistdocs';

const GITHUB_URL = `https://github.com/${github.owner}/${github.repo}`;

const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
});

const markdownResponse = (description: string) => ({
  description,
  content: {
    'text/markdown': {
      schema: { type: 'string' },
    },
  },
});

export const buildOpenApiDocument = ({ origin }: { origin: string }) => ({
  openapi: '3.1.0',
  info: {
    title: 'Flags SDK documentation site API',
    version: '1.0.0',
    summary:
      'Search, chat, and machine-readable documentation endpoints served by flags-sdk.dev.',
    description: [
      `${agent.product.description}`,
      '',
      'The Flags SDK itself is a client library published on npm; it has no hosted runtime API.',
      'This document describes the HTTP endpoints of the documentation site so that agents can search the docs, ask the docs assistant, and fetch Markdown versions of every page.',
      '',
      'All endpoints are public and need no authentication.',
      'Every error response is JSON and follows the `Error` schema with a stable `code`, a human-readable `message`, and a `hint` describing how to resolve the problem. Requests to unknown `/api/*` paths return a `404` with this shape.',
    ].join('\n'),
    contact: {
      name: 'Flags SDK maintainers',
      url: `${GITHUB_URL}/issues`,
    },
    license: {
      name: 'MIT',
      url: `${GITHUB_URL}/blob/main/LICENSE.md`,
    },
  },
  servers: [{ url: origin, description: 'Production' }],
  security: [],
  tags: [
    { name: 'Search', description: 'Full-text search over the documentation.' },
    {
      name: 'Chat',
      description: 'Ask AI assistant grounded in the documentation.',
    },
    {
      name: 'Discovery',
      description: 'Machine-readable documentation surfaces for agents.',
    },
  ],
  paths: {
    '/api/search': {
      get: {
        operationId: 'searchDocs',
        tags: ['Search'],
        summary: 'Search the documentation',
        description:
          'Runs a full-text search over all documentation pages and returns matching pages, headings, and text fragments. Returns an empty array when `query` is omitted.',
        parameters: [
          {
            name: 'query',
            in: 'query',
            required: false,
            description: 'Search terms.',
            schema: { type: 'string', minLength: 1 },
            example: 'precompute',
          },
          {
            name: 'locale',
            in: 'query',
            required: false,
            description: 'Documentation language. Defaults to `en`.',
            schema: { type: 'string', enum: ['en'], default: 'en' },
          },
          {
            name: 'tag',
            in: 'query',
            required: false,
            description: 'Comma-separated page tags used to narrow the search.',
            schema: { type: 'string' },
          },
          {
            name: 'mode',
            in: 'query',
            required: false,
            description: 'Search mode.',
            schema: {
              type: 'string',
              enum: ['full', 'vector'],
              default: 'full',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Ranked search results.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/SearchResult' },
                },
              },
            },
          },
          '405': { $ref: '#/components/responses/MethodNotAllowed' },
        },
      },
    },
    '/api/chat': {
      post: {
        operationId: 'askDocsAssistant',
        tags: ['Chat'],
        summary: 'Ask the documentation assistant',
        description:
          'Streams an answer from the Ask AI assistant. The assistant searches the documentation before answering. The response is an AI SDK UI message stream (server-sent events).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ChatRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'AI SDK UI message stream.',
            content: {
              'text/event-stream': {
                schema: { type: 'string' },
              },
            },
          },
          '400': errorResponse(
            'The request body is not valid JSON or `messages` is not an array.',
          ),
          '405': { $ref: '#/components/responses/MethodNotAllowed' },
        },
      },
    },
    '/openapi.json': {
      get: {
        operationId: 'getOpenApiDocument',
        tags: ['Discovery'],
        summary: 'Get this OpenAPI document',
        description: 'Returns this OpenAPI 3.1 document as JSON.',
        responses: {
          '200': {
            description: 'OpenAPI document.',
            content: {
              'application/json': { schema: { type: 'object' } },
            },
          },
        },
      },
    },
    '/agents.md': {
      get: {
        operationId: 'getAgentsGuide',
        tags: ['Discovery'],
        summary: 'Get the agent guide',
        description:
          'Returns a Markdown guide that tells agents what the Flags SDK is, when to use it, and which documentation surfaces exist.',
        responses: { '200': markdownResponse('Agent guide as Markdown.') },
      },
    },
    '/llms.txt': {
      get: {
        operationId: 'getLlmsText',
        tags: ['Discovery'],
        summary: 'Get the full documentation as Markdown',
        description:
          'Returns every documentation page concatenated as Markdown, following the llms.txt convention.',
        responses: {
          '200': markdownResponse('Complete documentation corpus as Markdown.'),
        },
      },
    },
    '/sitemap.md': {
      get: {
        operationId: 'getMarkdownSitemap',
        tags: ['Discovery'],
        summary: 'Get the semantic sitemap',
        description:
          'Returns a Markdown index of all documentation pages with their titles and descriptions.',
        responses: { '200': markdownResponse('Semantic sitemap as Markdown.') },
      },
    },
    '/docs/{slug}.md': {
      get: {
        operationId: 'getDocsPageMarkdown',
        tags: ['Discovery'],
        summary: 'Get one documentation page as Markdown',
        description:
          'Returns the Markdown source of a single documentation page. `slug` is the page path below `/docs` and can contain `/`, for example `frameworks/next`. Requests with `Accept: text/markdown` to the HTML URL return the same content.',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            description: 'Page path below `/docs`, without the `.md` suffix.',
            schema: { type: 'string' },
            example: 'frameworks/next',
          },
        ],
        responses: {
          '200': markdownResponse('Page content as Markdown.'),
          '404': markdownResponse(
            'The page does not exist. The body links to the sitemap and llms.txt.',
          ),
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message', 'docs'],
            properties: {
              code: {
                type: 'string',
                enum: [
                  'bad_request',
                  'not_found',
                  'method_not_allowed',
                  'internal_error',
                ],
                description: 'Stable machine-readable error code.',
              },
              message: {
                type: 'string',
                description: 'Human-readable explanation of the error.',
              },
              hint: {
                type: 'string',
                description: 'How to resolve the error.',
              },
              docs: {
                type: 'string',
                description: 'Path to the API documentation.',
              },
            },
          },
        },
        example: {
          error: {
            code: 'not_found',
            message: 'No API route exists at /api/unknown.',
            hint: 'List the available operations in the OpenAPI document at /openapi.json.',
            docs: '/openapi.json',
          },
        },
      },
      SearchResult: {
        type: 'object',
        required: ['id', 'type', 'content', 'url'],
        properties: {
          id: { type: 'string', description: 'Unique result identifier.' },
          type: {
            type: 'string',
            enum: ['page', 'heading', 'text'],
            description: 'Kind of content that matched.',
          },
          content: { type: 'string', description: 'Matched text.' },
          url: {
            type: 'string',
            description:
              'Site-relative URL of the page, including any heading anchor.',
          },
          breadcrumbs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Section titles from the docs root to the page.',
          },
          contentWithHighlights: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type', 'content'],
              properties: {
                type: { type: 'string' },
                content: { type: 'string' },
                styles: { type: 'object', additionalProperties: true },
              },
            },
            description: 'Matched text split into highlighted fragments.',
          },
        },
      },
      ChatRequest: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array',
            description: 'Conversation history as AI SDK UI messages.',
            items: { $ref: '#/components/schemas/UIMessage' },
          },
          currentRoute: {
            type: 'string',
            description: 'Site-relative path of the page the user is viewing.',
            example: '/docs/frameworks/next',
          },
          pageContext: {
            type: 'object',
            description: 'Optional content of the current page for grounding.',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              content: { type: 'string' },
            },
          },
        },
      },
      UIMessage: {
        type: 'object',
        required: ['id', 'role', 'parts'],
        properties: {
          id: { type: 'string' },
          role: { type: 'string', enum: ['user', 'assistant', 'system'] },
          parts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type'],
              properties: {
                type: { type: 'string', example: 'text' },
                text: { type: 'string' },
              },
              additionalProperties: true,
            },
          },
        },
        example: {
          id: 'msg_1',
          role: 'user',
          parts: [{ type: 'text', text: 'How do I precompute flags?' }],
        },
      },
    },
    responses: {
      MethodNotAllowed: errorResponse(
        'The HTTP method is not supported on this route. The `Allow` header lists supported methods.',
      ),
    },
  },
});

export type OpenApiDocument = ReturnType<typeof buildOpenApiDocument>;
