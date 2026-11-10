import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/components/ToolCard.tsx', import.meta.url),
  'utf8',
);

test('legacy tool cards expose one semantic execution target', () => {
  const cardOpeningTag = source.match(/<Card\b[\s\S]*?>/)?.[0];
  const executeButton = source.match(/<Button\b[\s\S]*?>/)?.[0];

  assert.ok(cardOpeningTag, 'ToolCard should render its card container');
  assert.ok(executeButton, 'ToolCard should render an execution button');
  assert.doesNotMatch(
    cardOpeningTag,
    /onClick\s*=/,
    'the non-semantic card container must not execute tools',
  );
  assert.match(
    executeButton,
    /onClick=\{handleClick\}/,
    'the semantic button should own tool activation',
  );
  assert.doesNotMatch(
    cardOpeningTag,
    /cursor-pointer/,
    'the card container must not imply that the whole surface is clickable',
  );
});
