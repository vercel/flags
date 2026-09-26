import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

const ASSET_DIR = join(process.cwd(), 'app/[lang]/og/[...slug]');

export const OG_IMAGE_SIZE = { width: 1200, height: 628 } as const;

export const renderOgImage = async ({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) => {
  const [regularFont, semiboldFont, backgroundImage] = await Promise.all([
    readFile(join(ASSET_DIR, 'geist-sans-regular.ttf')),
    readFile(join(ASSET_DIR, 'geist-sans-semibold.ttf')),
    readFile(join(ASSET_DIR, 'background.png')),
  ]);

  const backgroundImageData = backgroundImage.buffer.slice(
    backgroundImage.byteOffset,
    backgroundImage.byteOffset + backgroundImage.byteLength,
  );

  return new ImageResponse(
    <div style={{ fontFamily: 'Geist' }} tw="flex h-full w-full bg-black">
      {/** biome-ignore lint/performance/noImgElement: "Required for Satori" */}
      <img
        alt="Vercel OpenGraph Background"
        height={OG_IMAGE_SIZE.height}
        src={backgroundImageData as never}
        width={OG_IMAGE_SIZE.width}
      />
      <div tw="flex flex-col absolute h-full w-[750px] justify-center left-[50px] pr-[50px] pt-[116px] pb-[86px]">
        <div
          style={{
            textWrap: 'balance',
          }}
          tw="text-5xl font-medium text-white tracking-tight flex leading-[1.1] mb-4"
        >
          {title}
        </div>
        <div
          style={{
            color: '#8B8B8B',
            lineHeight: '44px',
            textWrap: 'balance',
          }}
          tw="text-[32px]"
        >
          {description}
        </div>
      </div>
    </div>,
    {
      ...OG_IMAGE_SIZE,
      fonts: [
        {
          name: 'Geist',
          data: regularFont,
          weight: 400,
        },
        {
          name: 'Geist',
          data: semiboldFont,
          weight: 500,
        },
      ],
    },
  );
};
