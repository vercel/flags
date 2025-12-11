import { enableBannerFlag, enableDitheredHeroFlag, enableHeroTextFlag, rootFlags } from "./flags";
import { FlagSelect, FlagToggle } from "./toggles";

type FlagsConfigProps = {
  code: string;
};

export const FlagsConfig = async ({ code }: FlagsConfigProps) => {
  const [bannerFlag, ditheredHeroFlag, heroTextFlag] = await Promise.all([
    enableBannerFlag(code, rootFlags),
    enableDitheredHeroFlag(code, rootFlags),
    enableHeroTextFlag(code, rootFlags),
  ]);

  return (
    <div className="rounded-xl bg-background p-4 ring-1 ring-border md:p-6">
      <div className="flex flex-col gap-y-1 px-2">
        <div className="mb-0.5 text-xl font-semibold tracking-tight">Try the Flags SDK</div>
        <span className="text-base">
          Set persistent flags for this page
        </span>
      </div>
      <div className="divide-y">
        <FlagToggle
          value={ditheredHeroFlag}
          flagKey={enableDitheredHeroFlag.key}
          label={enableDitheredHeroFlag.key}
          description={enableDitheredHeroFlag.description}
        />
        <FlagSelect
          value={heroTextFlag}
          flagKey={enableHeroTextFlag.key}
          label={enableHeroTextFlag.key}
          description={enableHeroTextFlag.description}
          options={enableHeroTextFlag.options}
        />
        <FlagToggle
          value={bannerFlag}
          flagKey={enableBannerFlag.key}
          label={enableBannerFlag.key}
          description={enableBannerFlag.description}
          scroll
        />
      </div>
    </div>
  );
}