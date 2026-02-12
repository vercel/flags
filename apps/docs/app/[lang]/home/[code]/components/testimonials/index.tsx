import Image from 'next/image';
import Link from 'next/link';

interface CardProps {
  name: string;
  alias: string;
  avatar: string;
  url: string;
  children: React.ReactNode;
}

export const Card = ({ name, alias, avatar, url, children }: CardProps) => {
  return (
    <Link
      href={url}
      target="_blank"
      className="drop-shadow-xs rounded-xl border bg-muted px-6 py-5 hover:bg-background hover:drop-shadow-sm"
    >
      <div className="flex items-center gap-4">
        <Image
          src={avatar}
          alt={name}
          width={40}
          height={40}
          className="h-12 w-12 rounded-full bg-gray-200"
        />
        <div className="flex flex-col">
          <div className="font-medium text-foreground">{name}</div>
          <div className="text-muted-foreground">{alias}</div>
        </div>
      </div>
      <div className="mt-4 text-foreground">{children}</div>
    </Link>
  );
};

export const Testimonials = () => {
  return (
    <div className="mb-6 mt-7 grid grid-cols-1 gap-4 min-[780px]:grid-cols-3">
      <div className="grid gap-4">
        <Card
          name="Julius"
          alias="@jullerino"
          avatar="https://assets.vercel.com/image/upload/v1740050235/flags-sdk-dev/DmFx1k13_400x400.jpg"
          url="https://x.com/jullerino/status/1828175266306498600"
        >
          <p>man @vercel flags are so nice</p>
        </Card>
        <Card
          name="Sully"
          alias="@SullyOmarr"
          avatar="https://assets.vercel.com/image/upload/v1740050365/flags-sdk-dev/iA_vPg8D_400x400.jpg"
          url="https://x.com/SullyOmarr/status/1848914238569681015"
        >
          <p className="mb-4">Ngl the feature flag from @vercel is goated</p>
          <p className="mb-4">
            i can ship my spaghetti to prod and have the entire team test
            without worrying about breaking things
          </p>
          <p className="mb-4">
            {' '}
            no more "it worked on local/staging" but breaks in prod
          </p>
        </Card>
      </div>
      <div className="grid gap-4">
        <Card
          name="Max Stoiber"
          alias="@mxstbr"
          avatar="https://assets.vercel.com/image/upload/v1740050410/flags-sdk-dev/smnE8goK_400x400.jpg"
          url="https://x.com/mxstbr/status/1834746781869261087"
        >
          <p className="mb-4">
            Vercel's new Flags SDK is a brilliant show of taste in developer
            experience 💯
          </p>
          <p className="mb-4">
            It introduces significant "artificial" limitations (server-only, no
            arguments at call site)—but those actually end up guiding users down
            the pit of success:
          </p>
          <ul className="mb-4 list-disc pl-4">
            <li>Server-only → No client-side loading spinners</li>
            <li>
              No arguments at call site → Consistent evaluation, easy to reason
              about, simple to delete
            </li>
          </ul>
          <p>:chef-kiss:</p>
        </Card>
      </div>
      <div className="grid gap-4">
        <Card
          name="Travis Arnold"
          alias="@souporserious"
          avatar="https://assets.vercel.com/image/upload/v1740050431/flags-sdk-dev/bkwwy78x_400x400.jpg"
          url="https://x.com/souporserious/status/1880296093399019658"
        >
          <p>Congrats on the release! By far the best feature flags API 🔥</p>
        </Card>
        <Card
          name="Paul Wild"
          alias="@pw_x"
          avatar="https://assets.vercel.com/image/upload/v1740050453/flags-sdk-dev/NNM5p4eF_400x400.jpg"
          url="https://x.com/pw_x/status/1891560507057881259"
        >
          <p>
            We use the Vercel flags in our project at work. We love it and
            people always compliment the power of it in demos
          </p>
        </Card>
        <Card
          name="Pontus Abrahamsson"
          alias="@pontusab"
          avatar="https://assets.vercel.com/image/upload/v1740050476/flags-sdk-dev/JwLEqyeo_400x400.jpg"
          url="https://x.com/pontusab/status/1880027682253205930"
        >
          <p>🔥 🔥</p>
        </Card>
      </div>
    </div>
  );
};

export default Testimonials;
