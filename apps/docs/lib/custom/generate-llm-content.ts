export function generateLLMContent(content: string): string {
  let transformedContent = content.replace(/^import .+$/gm, '');
  transformedContent = transformedContent.replace(/^export .+$/gm, '');
  transformedContent = transformedContent.replace(/<[A-Z]\w+[^>]*\/>/g, '');
  transformedContent = transformedContent.replace(
    /<([A-Z]\w+)[^>]*>([\s\S]*?)<\/\1>/g,
    '$2',
  );

  transformedContent = transformedContent.replace(/\n{3,}/g, '\n\n');
  transformedContent = transformedContent.trim();

  return transformedContent;
}
