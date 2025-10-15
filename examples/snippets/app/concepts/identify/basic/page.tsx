import { DemoFlag } from "@/components/demo-flag";
import { basicIdentifyExampleFlag } from "./flags";

export default async function Page() {
  const basic = await basicIdentifyExampleFlag();

  return <DemoFlag name={basicIdentifyExampleFlag.key} value={basic} />;
}
