import { HTMLRewriter } from 'htmlrewriter';

const rewriter = new HTMLRewriter();

async function main() {
  rewriter.on('a', {
    element(element) {
      element.setAttribute('href', 'https://www.baidu.com');
    },
  });
  const res = await rewriter.transform(
    new Response('<a href="https://www.google.com">google</a>'),
  );
  console.log(await res.text());
}

main();
